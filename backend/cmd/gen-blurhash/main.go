// Command gen-blurhash 为所有有封面的游戏生成 blurhash，写入 games.json。
//
// 用法：go run ./backend/cmd/gen-blurhash
// 读取 frontend/public/games.json + frontend/public/covers/，为每个有 coverFilename
// 的游戏计算 blurhash，写回 coverBlurhash 字段。
//
// 一次性脚本，新增封面由 admin 上传时自动计算。
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/gaubee/dos.oweb.xin/backend/internal/blurhash"
)

func main() {
	dataDir := "frontend/public"
	gamesPath := filepath.Join(dataDir, "games.json")

	// 读 games.json
	raw, err := os.ReadFile(gamesPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取 games.json 失败: %v\n", err)
		os.Exit(1)
	}
	var data struct {
		Games map[string]json.RawMessage `json:"games"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		fmt.Fprintf(os.Stderr, "解析 games.json 失败: %v\n", err)
		os.Exit(1)
	}

	type gameEntry struct {
		Identifier    string `json:"identifier"`
		CoverFilename string `json:"coverFilename,omitempty"`
		CoverBlurhash string `json:"coverBlurhash,omitempty"`
		Raw           json.RawMessage
	}

	// 并发生成 blurhash
	var mu sync.Mutex
	var wg sync.WaitGroup
	skipped, generated, failed := 0, 0, 0

	for id, rawGame := range data.Games {
		var g gameEntry
		if err := json.Unmarshal(rawGame, &g); err != nil {
			continue
		}
		g.Raw = rawGame
		if g.CoverFilename == "" {
			skipped++
			continue
		}

		wg.Add(1)
		go func(id, coverFile string, rawG json.RawMessage) {
			defer wg.Done()
			coverPath := filepath.Join(dataDir, "covers", id, coverFile)
			hash, err := blurhash.FromFile(coverPath)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failed++
				fmt.Fprintf(os.Stderr, "✗ %s: %v\n", id, err)
				return
			}
			// 注入 coverBlurhash 字段（反序列化→改→序列化）
			var m map[string]any
			_ = json.Unmarshal(rawG, &m)
			m["coverBlurhash"] = hash
			newRaw, _ := json.Marshal(m)
			data.Games[id] = newRaw
			generated++
		}(id, g.CoverFilename, rawGame)
	}
	wg.Wait()

	// 写回
	out, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "序列化失败: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(gamesPath, out, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "写入失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("完成：生成 %d，跳过（无封面）%d，失败 %d\n", generated, skipped, failed)
}
