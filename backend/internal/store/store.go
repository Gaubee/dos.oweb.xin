// Package store 管理三份 JSON 数据的内存索引与原子持久化。
//
// 正交意图：
//   1. 三份数据（games/featured/mirrors）的内存存储 + RWMutex 并发保护
//   2. 原子写盘（tmp → rename，防写一半损坏）
//   3. CRUD 操作（games 增删改查，featured/mirrors 整体替换）
//
// 数据规模：games.json 614KB/1898 条，全量内存常驻零压力。
// 启动时从磁盘加载，运行期写操作立即落盘（保证持久性）。
package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/gaubee/dos.oweb.xin/backend/internal/model"
)

// Store 三份数据的统一存储。路径指向 frontend/public/ 下的 JSON 文件，
// 这样 pnpm build 会把它们打进 dist/。
type Store struct {
	mu       sync.RWMutex
	games    model.GamesFile
	featured model.Featured
	mirrors  model.MirrorConfig
	dataDir  string // = frontend/public
}

// New 从 dataDir 加载三份 JSON。文件不存在则初始化空结构（不报错，支持冷启动）。
func New(dataDir string) (*Store, error) {
	s := &Store{dataDir: dataDir}
	if err := s.loadAll(); err != nil {
		return nil, err
	}
	return s, nil
}

// —— 加载 ——

func (s *Store) loadAll() error {
	if err := s.loadJSON("games.json", &s.games); err != nil {
		return fmt.Errorf("加载 games.json: %w", err)
	}
	if s.games.Games == nil {
		s.games.Games = make(map[string]model.RawGame)
	}
	// featured/mirrors 可缺失，缺失用默认值
	if err := s.loadJSON("featured.json", &s.featured); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("加载 featured.json: %w", err)
	}
	if s.featured.Identifiers == nil {
		s.featured.Identifiers = []string{} // 空数组而非 null（JSON 序列化卫生）
	}
	if err := s.loadJSON("mirrors.json", &s.mirrors); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("加载 mirrors.json: %w", err)
	}
	if s.mirrors.Mirrors == nil {
		// 默认镜像池（与前端原静态配置一致）
		s.mirrors.Mirrors = []model.Mirror{
			{ID: "dos-bin", Name: "dos-bin.zczc.cz", BaseURL: "https://dos-bin.zczc.cz", Enabled: true, Weight: 100},
		}
	}
	return nil
}

func (s *Store) loadJSON(name string, v any) error {
	path := filepath.Join(s.dataDir, name)
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewDecoder(f).Decode(v)
}

// —— 持久化（原子写盘）——

// FlushAll 把三份数据原子写到 dataDir。发布时调用。
func (s *Store) FlushAll() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.writeJSON("games.json", s.games); err != nil {
		return fmt.Errorf("写 games.json: %w", err)
	}
	if err := s.writeJSON("featured.json", s.featured); err != nil {
		return fmt.Errorf("写 featured.json: %w", err)
	}
	if err := s.writeJSON("mirrors.json", s.mirrors); err != nil {
		return fmt.Errorf("写 mirrors.json: %w", err)
	}
	return nil
}

func (s *Store) writeJSON(name string, v any) error {
	path := filepath.Join(s.dataDir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	// 原子写：先写 tmp 再 rename，防写一半损坏
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// —— Games CRUD ——

// ListGames 返回全部游戏（map 副本，调用方可安全改）。
func (s *Store) ListGames() []model.RawGame {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]model.RawGame, 0, len(s.games.Games))
	for _, g := range s.games.Games {
		out = append(out, g)
	}
	return out
}

// GetGame 按 identifier 查。ok=false 表示不存在。
func (s *Store) GetGame(id string) (model.RawGame, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.games.Games[id]
	return g, ok
}

// AddGame 新增。identifier 冲突返回 error。
func (s *Store) AddGame(g model.RawGame) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if g.Identifier == "" {
		return fmt.Errorf("identifier 不能为空")
	}
	if _, exists := s.games.Games[g.Identifier]; exists {
		return fmt.Errorf("游戏 %s 已存在", g.Identifier)
	}
	s.games.Games[g.Identifier] = g
	return nil
}

// UpdateGame 全量更新。不存在返回 error。
func (s *Store) UpdateGame(id string, g model.RawGame) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.games.Games[id]; !exists {
		return fmt.Errorf("游戏 %s 不存在", id)
	}
	// identifier 不可变（它是 map key + 文件名 + 封面目录名的统一标识）
	g.Identifier = id
	s.games.Games[id] = g
	return nil
}

// DeleteGame 删除（下架）。不存在返回 error。
func (s *Store) DeleteGame(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.games.Games[id]; !exists {
		return fmt.Errorf("游戏 %s 不存在", id)
	}
	delete(s.games.Games, id)
	return nil
}

// Total 游戏总数。
func (s *Store) Total() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.games.Games)
}

// —— Featured ——

func (s *Store) GetFeatured() model.Featured {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// 返回副本
	ids := make([]string, len(s.featured.Identifiers))
	copy(ids, s.featured.Identifiers)
	return model.Featured{Identifiers: ids}
}

func (s *Store) SetFeatured(f model.Featured) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.featured = f
}

// —— Mirrors ——

func (s *Store) GetMirrors() model.MirrorConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m := make([]model.Mirror, len(s.mirrors.Mirrors))
	copy(m, s.mirrors.Mirrors)
	return model.MirrorConfig{Mirrors: m}
}

func (s *Store) SetMirrors(m model.MirrorConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mirrors = m
}

// DataDir 返回数据目录路径（封面写入用）。
func (s *Store) DataDir() string { return s.dataDir }
