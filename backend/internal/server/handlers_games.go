// handlers_games.go —— 游戏数据 CRUD + 封面上传 handlers。
//
// 公开接口（/api/*）：列表/详情（只读）
// 管理接口（/api/admin/*）：增删改 + 封面上传
package server

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lithammer/fuzzysearch/fuzzy"

	"github.com/gaubee/dos.oweb.xin/backend/internal/blobhash"
	"github.com/gaubee/dos.oweb.xin/backend/internal/pinyin"

	"github.com/gaubee/dos.oweb.xin/backend/internal/model"
)

// ———— 公开接口 ————

// GET /api/games?q=  游戏列表（可带搜索关键词）。
// 返回全量（1898 条），前端本地分页/筛选。q 非空时做服务端过滤。
func (s *Server) handleListGames(c *gin.Context) {
	q := strings.ToLower(strings.TrimSpace(c.Query("q")))
	all := s.store.ListGames()
	if q != "" {
		filtered := make([]model.RawGame, 0)
		for _, g := range all {
			if matchSearch(g, q) {
				filtered = append(filtered, g)
			}
		}
		c.JSON(http.StatusOK, gin.H{"total": len(filtered), "games": filtered})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": len(all), "games": all})
}

// GET /api/games/:identifier  单游戏详情。
func (s *Server) handleGetGame(c *gin.Context) {
	id := c.Param("identifier")
	g, ok := s.store.GetGame(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "游戏不存在", "identifier": id})
		return
	}
	c.JSON(http.StatusOK, g)
}

// matchSearch 模糊匹配：拼音（原文/全拼/首字母）+ fuzzy（Levenshtein 容错）。
// 与前端 Fuse.js 行为对齐（threshold≈0.3 的模糊匹配）。
func matchSearch(g model.RawGame, q string) bool {
	// 拼音匹配（原文子串 / 全拼子串 / 首字母子串）
	if pinyin.Match(g.Identifier, q) || pinyin.Match(g.Name.ZhHans, q) {
		return true
	}
	if g.Name.ZhHant != "" && pinyin.Match(g.Name.ZhHant, q) {
		return true
	}
	// 英文名：fuzzy 模糊匹配（容错拼写，如 "sord" 匹配 "sword"）
	if g.Name.En != "" && fuzzy.Match(q, strings.ToLower(g.Name.En)) {
		return true
	}
	return false
}

// ———— 管理接口 ————

// GET /api/admin/games  管理列表（与公开列表一致，但路径在鉴权组下）。
func (s *Server) handleAdminListGames(c *gin.Context) {
	s.handleListGames(c)
}

// POST /api/admin/games  新增游戏。
func (s *Server) handleAddGame(c *gin.Context) {
	var g model.RawGame
	if err := c.ShouldBindJSON(&g); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 解析失败: " + err.Error()})
		return
	}
	if err := s.store.AddGame(g); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, g)
}

// PUT /api/admin/games/:identifier  更新游戏。
func (s *Server) handleUpdateGame(c *gin.Context) {
	id := c.Param("identifier")
	var g model.RawGame
	if err := c.ShouldBindJSON(&g); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 解析失败: " + err.Error()})
		return
	}
	if err := s.store.UpdateGame(id, g); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, g)
}

// DELETE /api/admin/games/:identifier  删除（下架）游戏。
func (s *Server) handleDeleteGame(c *gin.Context) {
	id := c.Param("identifier")
	if err := s.store.DeleteGame(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// POST /api/admin/games/:identifier/cover  上传封面（multipart/form-data, field=file）。
// 写入 frontend/public/covers/<identifier>/<coverFilename>，回填 coverFilename 带 ?v= 版本。
func (s *Server) handleUploadCover(c *gin.Context) {
	id := c.Param("identifier")
	if _, ok := s.store.GetGame(id); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "游戏不存在"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 file 字段: " + err.Error()})
		return
	}

	// 固定用 cover.png（前端 coverUrl 派生规则 = /covers/<id>/<coverFilename>）
	coverName := "cover.png"
	if ext := filepath.Ext(file.Filename); ext != "" {
		coverName = "cover" + ext
	}

	coverDir := filepath.Join(s.store.DataDir(), "covers", id)
	if err := c.SaveUploadedFile(file, filepath.Join(coverDir, coverName)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存封面失败: " + err.Error()})
		return
	}

	// 回填 coverFilename 带 ?v=<timestamp>（解决前端 CacheFirst 缓存失效）
	versioned := fmt.Sprintf("%s?v=%d", coverName, time.Now().Unix())
	g, _ := s.store.GetGame(id)
	g.CoverFilename = versioned

	// 计算 LQIP 整数（CSS-only 占位）
	coverPath := filepath.Join(coverDir, coverName)
	if lqip, err := blobhash.FromFile(coverPath); err == nil {
		g.Lqip = lqip
	} else {
		fmt.Fprintf(os.Stderr, "⚠ 计算 LQIP 失败 %s: %v\n", id, err)
	}

	_ = s.store.UpdateGame(id, g)

	c.JSON(http.StatusOK, gin.H{
		"ok":            true,
		"coverFilename": versioned,
		"lqip":          g.Lqip,
		"coverUrl":      fmt.Sprintf("/covers/%s/%s", id, coverName),
	})
}
