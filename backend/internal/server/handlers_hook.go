// handlers_hook.go —— 发布 hook 配置（commandHook + webHook）。
package server

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/gaubee/dos.oweb.xin/backend/internal/config"
)

// GET /api/admin/hook 返回当前 hook 配置。
func (s *Server) handleGetHook(c *gin.Context) {
	c.JSON(http.StatusOK, s.configMgr.Get())
}

// PUT /api/admin/hook 更新 hook 配置（持久化到 config.json）。
func (s *Server) handleSetHook(c *gin.Context) {
	var cfg config.HookConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 解析失败: " + err.Error()})
		return
	}
	if err := s.configMgr.Set(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}
