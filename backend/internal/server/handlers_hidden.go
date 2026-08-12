// handlers_hidden.go —— 批量下架/上架。
package server

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// PUT /api/admin/games/batch-hidden  批量下架/上架。
// body: {"ids": ["id1","id2"], "hidden": true}
func (s *Server) handleBatchHidden(c *gin.Context) {
	var req struct {
		IDs    []string `json:"ids"`
		Hidden bool     `json:"hidden"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 解析失败: " + err.Error()})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids 不能为空"})
		return
	}
	s.store.SetHidden(req.IDs, req.Hidden)
	c.JSON(http.StatusOK, gin.H{"ok": true, "count": len(req.IDs), "hidden": req.Hidden})
}
