// Command migrate-types 数据迁移：type(string) → types([]string) + 所有 DOS 游戏加 "DOS" 标签。
// 同时 tags → keywords（改名）。
//
// 用法：go run ./backend/cmd/migrate-types
// 幂等：可重复运行（已有 types 的跳过 type 迁移，已有 DOS 的不重复加）。
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

	migratedType, addedDOS, renamedTags := 0, 0, 0
	for id, g := range data.Games {
		// 1. type → types
		if oldType, ok := g["type"]; ok {
			if _, hasTypes := g["types"]; !hasTypes {
				g["types"] = []string{fmt.Sprint(oldType)}
				migratedType++
			}
			delete(g, "type")
		}

		// 2. 确保 types 数组里含 "DOS"（engine 不是 playcanvas 的都是 DOS 游戏）
		engine, _ := g["engine"].(string)
		if engine != "playcanvas" {
			types, _ := g["types"].([]string)
			if types == nil {
				types = []string{}
			}
			hasDOS := false
			for _, t := range types {
				if t == "DOS" {
					hasDOS = true
					break
				}
			}
			if !hasDOS {
				types = append(types, "DOS")
				g["types"] = types
				addedDOS++
			}
		}

		// 3. tags → keywords（改名）
		if oldTags, ok := g["tags"]; ok {
			if _, hasKeywords := g["keywords"]; !hasKeywords {
				g["keywords"] = oldTags
				renamedTags++
			}
			delete(g, "tags")
		}

		data.Games[id] = g
	}

	out, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "序列化失败: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(gamesPath, out, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "写入失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("迁移完成：type→types %d 条，加 DOS 标签 %d 条，tags→keywords %d 条\n", migratedType, addedDOS, renamedTags)
}
