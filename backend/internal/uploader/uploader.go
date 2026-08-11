// Package uploader 处理 PlayCanvas 游戏 zip 上传：解压解析清单 + 存储到自托管源。
//
// 正交意图：
//   1. ParsePlayCanvasZip —— 解压 zip 读 game.json，构造 RawGame
//   2. Storage —— 把 zip 存到 DATA_DIR/zips/<identifier>.zip（自托管源）
//
// 自托管源：admin 上传的 zip 存本地，server.go 暴露 /storage/zips/* 端点供下载。
// 这样 PlayCanvas 游戏的 zip 不依赖 dos-bin.zczc.cz，而是从本站直接下载。
package uploader

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/gaubee/dos.oweb.xin/backend/internal/model"
)

// GameManifest game.json 清单（与前端 zip-loader.ts 的 GameManifest 一致）。
type GameManifest struct {
	Title         string `json:"title"`
	Engine        string `json:"engine"` // 必须 "playcanvas"
	Entry         string `json:"entry"`
	EngineVersion string `json:"engineVersion,omitempty"`
	Assets        []struct {
		Path string `json:"path"`
		Type string `json:"type"`
		Name string `json:"name"`
	} `json:"assets,omitempty"`
}

// ParsePlayCanvasZip 解压 zip 字节，读 game.json，返回构造好的 RawGame。
// identifier 由调用方决定（用 title 或自定义），这里只负责解析内容。
func ParsePlayCanvasZip(zipBytes []byte) (*model.RawGame, *GameManifest, error) {
	// 计算 sha256 + filesize（整个 zip 文件）
	hash := sha256.Sum256(zipBytes)
	sha256Hex := hex.EncodeToString(hash[:])

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return nil, nil, fmt.Errorf("zip 格式错误: %w", err)
	}

	// 找 game.json
	var manifest *GameManifest
	for _, f := range zr.File {
		if filepath.Base(f.Name) == "game.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, nil, fmt.Errorf("打开 game.json 失败: %w", err)
			}
			defer rc.Close()
			body, err := io.ReadAll(rc)
			if err != nil {
				return nil, nil, fmt.Errorf("读 game.json 失败: %w", err)
			}
			var m GameManifest
			if err := json.Unmarshal(body, &m); err != nil {
				return nil, nil, fmt.Errorf("game.json 解析失败: %w", err)
			}
			if m.Engine != "playcanvas" {
				return nil, nil, fmt.Errorf("game.json engine 必须为 playcanvas，当前为 %q", m.Engine)
			}
			if m.Entry == "" {
				return nil, nil, fmt.Errorf("game.json 缺少 entry 字段")
			}
			manifest = &m
			break
		}
	}
	if manifest == nil {
		return nil, nil, fmt.Errorf("zip 内未找到 game.json")
	}

	// 验证 entry 文件存在
	entryFound := false
	for _, f := range zr.File {
		if filepath.Base(f.Name) == manifest.Entry || f.Name == manifest.Entry {
			entryFound = true
			break
		}
	}
	if !entryFound {
		return nil, nil, fmt.Errorf("入口文件 %s 不存在于 zip 中", manifest.Entry)
	}

	// 构造 RawGame（engine=playcanvas，自动加 HTML5 类型标签）
	g := &model.RawGame{
		Identifier: manifest.Title,
		Name: model.LocalizedName{
			ZhHans: manifest.Title,
		},
		Executable: manifest.Entry,
		SHA256:     sha256Hex,
		Filesize:   int64(len(zipBytes)),
		Engine:     "playcanvas",
		Types:      []string{"HTML5"},
	}
	return g, manifest, nil
}

// SaveZip 把 zip 字节存到 dataDir/zips/<identifier>.zip（自托管源）。
func SaveZip(zipBytes []byte, dataDir, identifier string) (string, error) {
	zipsDir := filepath.Join(dataDir, "zips")
	if err := os.MkdirAll(zipsDir, 0755); err != nil {
		return "", fmt.Errorf("创建 zips 目录失败: %w", err)
	}
	path := filepath.Join(zipsDir, identifier+".zip")
	if err := os.WriteFile(path, zipBytes, 0644); err != nil {
		return "", fmt.Errorf("写入 zip 失败: %w", err)
	}
	return path, nil
}
