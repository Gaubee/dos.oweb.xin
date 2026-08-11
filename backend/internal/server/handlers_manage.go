// handlers_manage.go —— featured/mirrors/publish handlers。
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/gaubee/dos.oweb.xin/backend/internal/model"
)

// ———— Featured ————

func (s *Server) handleGetFeatured(c *gin.Context) {
	c.JSON(http.StatusOK, s.store.GetFeatured())
}

func (s *Server) handleSetFeatured(c *gin.Context) {
	var f model.Featured
	if err := c.ShouldBindJSON(&f); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 解析失败: " + err.Error()})
		return
	}
	s.store.SetFeatured(f)
	c.JSON(http.StatusOK, f)
}

// ———— Mirrors ————

func (s *Server) handleGetMirrors(c *gin.Context) {
	c.JSON(http.StatusOK, s.store.GetMirrors())
}

func (s *Server) handleAdminGetMirrors(c *gin.Context) {
	c.JSON(http.StatusOK, s.store.GetMirrors())
}

func (s *Server) handleSetMirrors(c *gin.Context) {
	var m model.MirrorConfig
	if err := c.ShouldBindJSON(&m); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 解析失败: " + err.Error()})
		return
	}
	s.store.SetMirrors(m)
	c.JSON(http.StatusOK, m)
}

// ———— Publish ————

// POST /api/admin/publish  触发发布（写数据 + 执行 hook）。
// 串行执行，若已有任务在跑返回 409。
func (s *Server) handlePublish(c *gin.Context) {
	// 30 分钟超时（构建可能慢）
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Minute)
	defer cancel()

	if err := s.builder.Publish(ctx); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, s.builder.Status())
}

// GET /api/admin/publish/status  当前构建状态。
func (s *Server) handlePublishStatus(c *gin.Context) {
	c.JSON(http.StatusOK, s.builder.Status())
}

// GET /api/admin/publish/logs  SSE 实时日志流 + 历史日志。
func (s *Server) handlePublishLogs(c *gin.Context) {
	// 检查是否支持 SSE
	if strings.Contains(c.Request.Header.Get("Accept"), "text/event-stream") {
		s.sseLogs(c)
		return
	}
	// 非 SSE：返回历史日志快照
	c.JSON(http.StatusOK, gin.H{"logs": s.builder.LogHistory(), "status": s.builder.Status()})
}

func (s *Server) sseLogs(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")

	// 先推送历史日志
	for _, line := range s.builder.LogHistory() {
		writeSSE(c.Writer, line)
	}
	// 推送当前状态快照
	status := s.builder.Status()
	statusBytes, _ := json.Marshal(status)
	fmt.Fprintf(c.Writer, "event: status\ndata: %s\n\n", statusBytes)
	c.Writer.Flush()

	// 订阅实时日志
	ch, unsub := s.builder.Subscribe()
	defer unsub()

	// 客户端断开时退出
	notify := c.Writer.CloseNotify()
	for {
		select {
		case line, ok := <-ch:
			if !ok {
				return
			}
			writeSSE(c.Writer, line)
			c.Writer.Flush()
		case <-notify:
			return
		}
	}
}

// writeSSE 写一行 SSE data。
func writeSSE(w gin.ResponseWriter, line any) {
	data, _ := json.Marshal(line)
	fmt.Fprintf(w, "data: %s\n\n", data)
}
