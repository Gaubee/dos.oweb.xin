// Package model 定义管理后端的领域模型，与 frontend/src/types/game.ts 的 RawGame 1:1 对应。
//
// 正交意图：
//   1. RawGame —— games.json 的游戏条目（13 字段）
//   2. Featured —— 推荐游戏列表
//   3. Mirror —— 游戏数据源配置
//
// 注意：派生字段（driveType/coverUrl/hasZip）是前端算的，后端不存不返回。
// cdrom/floppy 保持"存在即真值"语义（与前端 game-store.ts 的 toDTO 一致）。
package model

// LocalizedName 多语言游戏名。
type LocalizedName struct {
	ZhHans string `json:"zh-Hans"`
	ZhHant string `json:"zh-Hant,omitempty"`
	En     string `json:"en,omitempty"`
}

// RawGame games.json 单条游戏，json tag 与文件 1:1。
// 字段频率参考：identifier/name/executable/sha256/filesize 必填；
// type(1856) coverFilename(1300) img(99) cdrom(54) releaseYear(42) floppy(11) links(9) keymaps(3) cheats(2) 可选。
type RawGame struct {
	Identifier    string            `json:"identifier"`
	Name          LocalizedName     `json:"name"`
	Executable    string            `json:"executable"`
	SHA256        string            `json:"sha256"`
	Filesize      int64             `json:"filesize"`
	Engine        string            `json:"engine,omitempty"` // ""(默认dosbox) | "playcanvas"
	Types         []string          `json:"types,omitempty"`         // 游戏类型（多值，如 ["ACT","DOS"]）
	CoverFilename string            `json:"coverFilename,omitempty"`
	Lqip int `json:"lqip,omitempty"` // CSS-only LQIP 整数
	Keywords      []string          `json:"keywords,omitempty"`      // 搜索关键字（模糊搜索用，与类型不冲突）
	Img           string            `json:"img,omitempty"`
	Cdrom         string            `json:"cdrom,omitempty"`
	Floppy        string            `json:"floppy,omitempty"`
	ReleaseYear   int               `json:"releaseYear,omitempty"`
	Links         map[string]string `json:"links,omitempty"`
	Keymaps       map[string]string `json:"keymaps,omitempty"`
	Cheats        map[string]string `json:"cheats,omitempty"`
}

// GamesFile games.json 顶层结构。
type GamesFile struct {
	Games map[string]RawGame `json:"games"`
}

// Featured 推荐游戏列表（首页展示）。
type Featured struct {
	Identifiers []string `json:"identifiers"`
}

// Mirror 游戏数据源配置。zip URL = baseUrl + "/" + encodedIdentifier + ".zip"。
type Mirror struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
	Enabled bool   `json:"enabled"`
	// 权重：同延迟下优先级（默认 100）
	Weight int `json:"weight,omitempty"`
}

// MirrorConfig mirrors.json 结构。
type MirrorConfig struct {
	Mirrors []Mirror `json:"mirrors"`
}
