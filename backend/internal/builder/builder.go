// Package builder 实现发布管线：写数据 → 执行 hook → 压缩 dist → SSE 日志流。
//
// 发布流程：
//   1. store.FlushAll() 把 games/featured/mirrors 原子写到 DATA_DIR
//   2. commandHook（可选）—— 构建前端 + 部署
//   3. packageDist（可选）—— 压缩 frontend/dist → zip → sha256 → 受保护下载链接
//   4. webHook（可选）—— POST 通知（body 含 downloadUrl + sha256）
package builder

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gaubee/dos.oweb.xin/backend/internal/config"
	"github.com/gaubee/dos.oweb.xin/backend/internal/store"
)

const logBufferLines = 2000

type Phase string

const (
	PhaseIdle       Phase = "idle"
	PhaseFlushing   Phase = "flushing"
	PhasePublishing Phase = "publishing"
	PhaseDone       Phase = "done"
	PhaseFailed     Phase = "failed"
)

type Status struct {
	Phase     Phase   `json:"phase"`
	StartedAt int64   `json:"startedAt,omitempty"`
	EndedAt   int64   `json:"endedAt,omitempty"`
	Hook      string  `json:"hook,omitempty"`
	ExitCode  int     `json:"exitCode,omitempty"`
	Error     string  `json:"error,omitempty"`
	Progress  float64 `json:"progress,omitempty"`
}

type Builder struct {
	mu            sync.Mutex
	buildMu       sync.Mutex
	store         *store.Store
	cfg           *config.Manager
	workDir       string
	addr          string // 监听地址（默认 Host 拼接用）
	subsMu        sync.Mutex
	subs          map[chan LogLine]struct{}
	logBuf        []LogLine
	status        Status
	downloadToken string // 最近一次发布的 zip sha256（下载 token）
	downloadFile  string // 最近一次发布的 zip 文件名
}

type LogLine struct {
	Stream string `json:"stream"`
	Line   string `json:"line"`
	Time   int64  `json:"time"`
}

// New 创建 Builder。cfg 提供 hook 配置，workDir 为 hook 执行目录，addr 为监听地址。
func New(s *store.Store, cfg *config.Manager, workDir, addr string) *Builder {
	return &Builder{
		store:   s,
		cfg:     cfg,
		workDir: workDir,
		addr:    addr,
		subs:    make(map[chan LogLine]struct{}),
		status:  Status{Phase: PhaseIdle, ExitCode: -1},
	}
}

// DownloadToken 返回当前下载 token（sha256）和文件名。无发布产物时返回空。
func (b *Builder) DownloadToken() (token, filename string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.downloadToken, b.downloadFile
}

// Host 返回外部可访问地址（配置的 host 或默认 localhost:PORT）。
func (b *Builder) Host() string {
	h := b.cfg.Get().Host
	if h != "" {
		return strings.TrimRight(h, "/")
	}
	return "localhost" + b.addr // addr 形如 :7780
}

func (b *Builder) Status() Status {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.status
}

func (b *Builder) LogHistory() []LogLine {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]LogLine, len(b.logBuf))
	copy(out, b.logBuf)
	return out
}

func (b *Builder) Subscribe() (chan LogLine, func()) {
	ch := make(chan LogLine, 64)
	b.subsMu.Lock()
	b.subs[ch] = struct{}{}
	b.subsMu.Unlock()
	return ch, func() {
		b.subsMu.Lock()
		delete(b.subs, ch)
		b.subsMu.Unlock()
		close(ch)
	}
}

func (b *Builder) emit(line LogLine) {
	b.logBuf = append(b.logBuf, line)
	if len(b.logBuf) > logBufferLines {
		b.logBuf = b.logBuf[len(b.logBuf)-logBufferLines:]
	}
	b.subsMu.Lock()
	for ch := range b.subs {
		select {
		case ch <- line:
		default:
		}
	}
	b.subsMu.Unlock()
}

func (b *Builder) emitStr(stream, line string) {
	b.emit(LogLine{Stream: stream, Line: line, Time: time.Now().UnixMilli()})
}

// Publish 触发发布。
func (b *Builder) Publish(ctx context.Context) error {
	if !b.buildMu.TryLock() {
		return fmt.Errorf("已有发布任务正在运行")
	}
	defer b.buildMu.Unlock()

	hookCfg := b.cfg.Get()

	b.mu.Lock()
	b.logBuf = b.logBuf[:0]
	b.status = Status{
		Phase:     PhaseFlushing,
		StartedAt: time.Now().UnixMilli(),
		Hook:      hookSummary(hookCfg),
		ExitCode:  -1,
	}
	b.mu.Unlock()

	// 1. 写数据（用绝对路径）
	dataDir := b.store.DataDir()
	b.emitStr("system", "→ 写入数据到 "+dataDir+"/")
	if err := b.store.FlushAll(); err != nil {
		b.finish(PhaseFailed, -1, fmt.Sprintf("写数据失败: %v", err))
		return err
	}
	b.emitStr("system", "✓ 数据写入完成 ("+dataDir+"/games.json + featured.json + mirrors.json)")

	// 2. 无任何后续步骤时仅写数据
	if hookCfg.CommandHook == "" && hookCfg.WebHook == "" && !hookCfg.PackageDist {
		b.emitStr("system", "ℹ 未配置任何 hook / 打包，仅写数据完成。可在发布设置页配置")
		b.finish(PhaseDone, 0, "")
		return nil
	}

	b.mu.Lock()
	b.status.Phase = PhasePublishing
	b.mu.Unlock()

	// 3. 执行 commandHook（本地命令，如 pnpm build）
	if hookCfg.CommandHook != "" {
		b.emitStr("system", "→ 执行 commandHook: "+hookCfg.CommandHook)
		if err := b.execCommand(ctx, hookCfg.CommandHook); err != nil {
			b.finish(PhaseFailed, -1, fmt.Sprintf("commandHook 失败: %v", err))
			return err
		}
		b.emitStr("system", "✓ commandHook 完成")
	}

	// 4. 压缩 frontend/dist + 算 sha256（作为下载 token）
	if hookCfg.PackageDist {
		token, filename, downloadUrl, err := b.packageDist()
		if err != nil {
			b.emitStr("stderr", "⚠ 打包失败: "+err.Error())
		} else {
			b.mu.Lock()
			b.downloadToken = token
			b.downloadFile = filename
			b.mu.Unlock()
			b.emitStr("system", "✓ 前端项目已打包: "+filename)
			b.emitStr("system", "  SHA256: "+token)
			b.emitStr("system", "  下载链接: "+downloadUrl)
		}
	}

	// 5. 调用 webHook（HTTP POST，body 含 downloadUrl + sha256）
	if hookCfg.WebHook != "" {
		b.emitStr("system", "→ 调用 webHook: "+hookCfg.WebHook)
		if err := b.execWebHook(ctx, hookCfg.WebHook); err != nil {
			b.emitStr("stderr", "⚠ webHook 调用失败: "+err.Error())
		} else {
			b.emitStr("system", "✓ webHook 响应正常")
		}
	}

	b.finish(PhaseDone, 0, "")
	return nil
}

// packageDist 压缩 frontend/dist → DATA_DIR/downloads/dist-<timestamp>.zip，
// 返回 (sha256, filename, downloadUrl)。
func (b *Builder) packageDist() (token, filename, downloadUrl string, err error) {
	distDir := filepath.Join(b.workDir, "frontend", "dist")
	if _, err := os.Stat(distDir); err != nil {
		return "", "", "", fmt.Errorf("frontend/dist 不存在（需先构建）: %w", err)
	}

	downloadsDir := filepath.Join(b.store.DataDir(), "downloads")
	if err := os.MkdirAll(downloadsDir, 0755); err != nil {
		return "", "", "", err
	}

	filename = fmt.Sprintf("dist-%d.zip", time.Now().Unix())
	zipPath := filepath.Join(downloadsDir, filename)

	// 压缩
	if err := zipDir(distDir, zipPath); err != nil {
		return "", "", "", fmt.Errorf("压缩失败: %w", err)
	}

	// sha256
	data, err := os.ReadFile(zipPath)
	if err != nil {
		return "", "", "", err
	}
	hash := sha256.Sum256(data)
	token = hex.EncodeToString(hash[:])

	// 拼接下载 URL
	host := b.Host()
	downloadUrl = fmt.Sprintf("%s/storage/downloads/%s?token=%s", host, filename, token)

	return token, filename, downloadUrl, nil
}

// zipDir 把 dir 压缩到 zipPath。
func zipDir(dir, zipPath string) error {
	out, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer out.Close()

	zw := zip.NewWriter(out)
	defer zw.Close()

	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		w, err := zw.Create(rel)
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(w, f)
		return err
	})
}

// execCommand 执行本地命令，实时推送 stdout/stderr。
func (b *Builder) execCommand(ctx context.Context, command string) error {
	cmd := exec.CommandContext(ctx, "bash", "-c", command)
	cmd.Dir = b.workDir
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go b.pipeToLog("stdout", stdout, &wg)
	go b.pipeToLog("stderr", stderr, &wg)

	err = cmd.Wait()
	wg.Wait()
	return err
}

// execWebHook POST 发布信息到 webhook URL（含下载链接 + sha256）。
func (b *Builder) execWebHook(ctx context.Context, url string) error {
	payload := map[string]any{
		"event":   "publish",
		"dataDir": b.store.DataDir(),
		"time":    time.Now().Unix(),
	}
	// 附带打包信息（如果 packageDist 执行了）
	b.mu.Lock()
	if b.downloadToken != "" {
		host := b.Host()
		payload["sha256"] = b.downloadToken
		payload["downloadUrl"] = fmt.Sprintf("%s/storage/downloads/%s?token=%s", host, b.downloadFile, b.downloadToken)
		payload["filename"] = b.downloadFile
	}
	b.mu.Unlock()

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook 返回 HTTP %d", resp.StatusCode)
	}
	return nil
}

func (b *Builder) pipeToLog(stream string, r interface{ Read([]byte) (int, error) }, wg *sync.WaitGroup) {
	defer wg.Done()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		b.emitStr(stream, scanner.Text())
	}
}

func (b *Builder) finish(phase Phase, exitCode int, errMsg string) {
	b.mu.Lock()
	b.status.Phase = phase
	b.status.EndedAt = time.Now().UnixMilli()
	b.status.ExitCode = exitCode
	b.status.Error = errMsg
	st := b.status
	b.mu.Unlock()
	if phase == PhaseFailed {
		b.emitStr("system", "✗ "+errMsg)
	} else {
		duration := st.EndedAt - st.StartedAt
		b.emitStr("system", fmt.Sprintf("✓ 发布完成 (耗时 %.1fs)", float64(duration)/1000))
	}
}

// hookSummary 生成 status.hook 摘要。
func hookSummary(cfg config.HookConfig) string {
	parts := []string{}
	if cfg.CommandHook != "" {
		parts = append(parts, "cmd: "+cfg.CommandHook)
	}
	if cfg.WebHook != "" {
		parts = append(parts, "web: "+cfg.WebHook)
	}
	return strings.Join(parts, " | ")
}
