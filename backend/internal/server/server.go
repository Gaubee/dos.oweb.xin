// Package server 装配 Gin 路由，提供 CMS API 与 admin SPA 静态托管。
//
// 正交意图：
//   1. Server —— 路由装配 + 依赖注入（store + auth + builder）
//   2. CORS —— 允许 game.oweb.xin 跨域读取公开 API
//   3. SPA fallback —— admin 前端 history 模式
//
// 路由分组：
//   /api/*              公开接口（games/featured/mirrors）
//   /api/admin/login    登录（无需鉴权）
//   /api/admin/*        管理接口（HMAC cookie 鉴权）
//   /*                  admin SPA 静态托管 + fallback
package server

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/gaubee/dos.oweb.xin/backend/internal/auth"
	"github.com/gaubee/dos.oweb.xin/backend/internal/builder"
	"github.com/gaubee/dos.oweb.xin/backend/internal/config"
	"github.com/gaubee/dos.oweb.xin/backend/internal/store"
)

type Server struct {
	store     *store.Store
	auth      *auth.Auth
	builder   *builder.Builder
	configMgr *config.Manager
	adminDist string
	dev       bool
}

type Config struct {
	Store     *store.Store
	Auth      *auth.Auth
	Builder   *builder.Builder
	ConfigMgr *config.Manager
	AdminDist string
	Dev       bool
}

func New(cfg Config) *Server {
	return &Server{
		store:     cfg.Store,
		auth:      cfg.Auth,
		builder:   cfg.Builder,
		configMgr: cfg.ConfigMgr,
		adminDist: cfg.AdminDist,
		dev:       cfg.Dev,
	}
}

func (s *Server) Router() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())

	// 公开 API
	api := r.Group("/api")
	{
		api.GET("/games", s.handleListGames)
		api.GET("/games/:identifier", s.handleGetGame)
		api.GET("/featured", s.handleGetFeatured)
		api.GET("/mirrors", s.handleGetMirrors)
	}

	// 登录（无需鉴权）
	r.POST("/api/admin/login", s.handleLogin)
	r.POST("/api/admin/logout", s.handleLogout)

	// 管理接口（需鉴权）
	admin := r.Group("/api/admin", s.auth.Middleware())
	{
		admin.GET("/session", s.handleSession)
		admin.GET("/games", s.handleAdminListGames)
		admin.POST("/games", s.handleAddGame)
		admin.PUT("/games/:identifier", s.handleUpdateGame)
		admin.DELETE("/games/:identifier", s.handleDeleteGame)
		admin.POST("/games/:identifier/cover", s.handleUploadCover)
		admin.PUT("/featured", s.handleSetFeatured)
		admin.GET("/mirrors", s.handleAdminGetMirrors)
		admin.PUT("/mirrors", s.handleSetMirrors)
		admin.POST("/games/upload", s.handleUploadGame)
		admin.GET("/hook", s.handleGetHook)   // 发布 hook 配置
		admin.PUT("/hook", s.handleSetHook)   // 更新 hook 配置
		admin.POST("/publish", s.handlePublish)
		admin.GET("/publish/status", s.handlePublishStatus)
		admin.GET("/publish/logs", s.handlePublishLogs) // SSE
	}

	// admin SPA 静态托管（含 fallback）
	s.mountAdminSPA(r)
	// 封面图静态托管（DATA_DIR/covers，admin 和 frontend 统一数据源）
	s.mountCovers(r)
	// 自托管 zip 源（PlayCanvas 游戏下载）
	s.mountStorage(r)
	// 发布产物下载（受 token 保护）
	s.mountDownloads(r)
	return r
}

// corsMiddleware 允许跨域（game.oweb.xin 调 admin API 时需要）。
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", c.Request.Header.Get("Origin"))
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// mountAdminSPA 托管 admin 前端 SPA。
func (s *Server) mountAdminSPA(r *gin.Engine) {
	if s.adminDist == "" {
		return
	}
	if _, err := os.Stat(s.adminDist); err != nil {
		return // 目录不存在，跳过（dev 模式 admin 由 Vite 服务）
	}
	r.Static("/assets", s.adminDist+"/assets")
	// NoRoute fallback 到 index.html（SPA history 模式）
	r.NoRoute(func(c *gin.Context) {
		// API 路径返回 404 JSON
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.File(s.adminDist + "/index.html")
	})
	r.GET("/", func(c *gin.Context) {
		c.File(s.adminDist + "/index.html")
	})
}

// mountStorage 暴露自托管 zip 源 /storage/zips/<identifier>.zip。
// PlayCanvas 游戏上传后 zip 存在 DATA_DIR/zips/，这里提供下载端点。
// 支持 Range（分片下载）、CORS（跨域），与 dos-bin.zczc.cz 行为一致。
func (s *Server) mountStorage(r *gin.Engine) {
	zipsDir := s.store.DataDir() + "/zips"
	r.GET("/storage/zips/:identifier", func(c *gin.Context) {
		id := c.Param("identifier")
		// 安全校验：防止路径穿越
		if strings.Contains(id, "..") || strings.Contains(id, "/") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "非法路径"})
			return
		}
		// 同时支持带/不带 .zip 后缀
		if !strings.HasSuffix(id, ".zip") {
			id += ".zip"
		}
		path := zipsDir + "/" + id
		// 用 c.File 会自动处理 Range + Last-Modified
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Headers", "Range")
		c.File(path)
	})
}

// mountCovers 托管封面图静态文件 /covers/<identifier>/<filename>。
// 封面存 DATA_DIR/covers/（= frontend/public/covers），admin 和 frontend 统一数据源。
func (s *Server) mountCovers(r *gin.Engine) {
	coversDir := s.store.DataDir() + "/covers"
	// /*filepath 通配：匹配 /covers/仙剑奇侠传/cover.png 这类含中文的多层路径
	r.GET("/covers/*filepath", func(c *gin.Context) {
		rel := c.Param("filepath") // 形如 /仙剑奇侠传/cover.png
		// 路径穿越校验
		if strings.Contains(rel, "..") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "非法路径"})
			return
		}
		c.Header("Cache-Control", "public, max-age=604800")
		c.File(coversDir + rel)
	})
}

// mountDownloads 受 token 保护的发布产物下载端点。
// GET /storage/downloads/:filename?token=<sha256>
// token 必须匹配最近一次发布的 sha256。
func (s *Server) mountDownloads(r *gin.Engine) {
	downloadsDir := s.store.DataDir() + "/downloads"
	r.GET("/storage/downloads/:filename", func(c *gin.Context) {
		filename := c.Param("filename")
		token := c.Query("token")

		// 安全校验
		if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "非法路径"})
			return
		}

		// token 验证（必须是最近发布的 sha256）
		expectedToken, _ := s.builder.DownloadToken()
		if expectedToken == "" || token != expectedToken {
			c.JSON(http.StatusForbidden, gin.H{"error": "无效或过期的下载 token"})
			return
		}

		path := downloadsDir + "/" + filename
		c.Header("Access-Control-Allow-Origin", "*")
		c.File(path)
	})
}

