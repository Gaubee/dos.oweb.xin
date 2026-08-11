// handlers_auth.go —— 登录/登出/会话 handlers。
package server

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type loginRequest struct {
	Password string `json:"password" binding:"required"`
}

func (s *Server) handleLogin(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password 字段必填"})
		return
	}
	if !s.auth.VerifyPassword(req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "密码错误"})
		return
	}
	token, err := s.auth.IssueToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "签发 token 失败"})
		return
	}
	s.auth.SetCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleLogout(c *gin.Context) {
	s.auth.ClearCookie(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleSession(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"authed": true})
}
