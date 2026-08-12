// Command gen-lqip 为所有有封面的游戏生成 CSS-only LQIP 整数（替代 blurhash）。
//
// 用法：go run ./backend/cmd/gen-lqip
// 读取 frontend/public/games.json + frontend/public/covers/，
// 为每个有 coverFilename 的游戏计算 20bit blobhash，写入 lqip 字段，删除 coverBlurhash。
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/gaubee/dos.oweb.xin/backend/internal/blobhash"
)

func main() {
	dataDir := filepath.Join("frontend", "public")
	gamesPath := filepath.Join(dataDir, "games.json")

	raw, err := os.ReadFile(gamesPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取 games.json 失败: %v\n", err)
		os.Exit(1)
	}

	var data struct {
		Games map[string]map[string]any `json:"games"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		fmt.Fprintf(os.Stderr, "解析失败: %v\n", err)
		os.Exit(1)
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	generated, failed := 0, 0

	for id, g := range data.Games {
		cf, _ := g["coverFilename"].(string)
		if cf == "" {
			continue
		}

		wg.Add(1)
		go func(id, coverFile string, gm map[string]any) {
			defer wg.Done()
			realName := coverFile
			if idx := indexOf(coverFile, '?'); idx > 0 {
				realName = coverFile[:idx]
			}
			coverPath := filepath.Join(dataDir, "covers", id, realName)

			lqip, err := blobhash.FromFile(coverPath)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failed++
				fmt.Fprintf(os.Stderr, "✗ %s: %v\n", id, err)
				return
			}
			gm["lqip"] = lqip
			delete(gm, "coverBlurhash") // 删除旧的 blurhash 字段
			data.Games[id] = gm
			generated++
		}(id, cf, g)
	}
	wg.Wait()

	out, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "序列化失败: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(gamesPath, out, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "写入失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("完成：生成 lqip %d，失败 %d\n", generated, failed)
}

func indexOf(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}
