// Command hide-no-cover 把无封面的游戏标记为下架（hidden=true）。
// 用法：go run ./backend/cmd/hide-no-cover
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	gamesPath := filepath.Join("frontend", "public", "games.json")
	raw, err := os.ReadFile(gamesPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取失败: %v\n", err)
		os.Exit(1)
	}

	var data struct {
		Games map[string]map[string]any `json:"games"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		fmt.Fprintf(os.Stderr, "解析失败: %v\n", err)
		os.Exit(1)
	}

	count := 0
	for id, g := range data.Games {
		cf, _ := g["coverFilename"].(string)
		if cf == "" {
			g["hidden"] = true
			data.Games[id] = g
			count++
		}
	}

	out, _ := json.MarshalIndent(data, "", "  ")
	if err := os.WriteFile(gamesPath, out, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "写入失败: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("完成：%d 款无封面游戏已标记为下架\n", count)
}
