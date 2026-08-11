// Package auth 实现 HMAC-SHA256 cookie 鉴权（单管理员，无 JWT 依赖）。
//
// 正交意图：
//   1. 密码校验（constant-time 防时序攻击）
//   2. Token 签发/验证（base64(payload).base64(hmac)）
//   3. Gin 中间件（验 cookie 保护 /api/admin/*）
//
// Token 格式：base64url(json{exp}).base64url(hmac-sha256(payload, secret))
// Cookie 属性：HttpOnly + Secure(dev 可关) + SameSite=Strict
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	CookieName   = "dos_admin"
	TokenMaxAge  = 7 * 24 * 3600 // 7 天（秒）
	ContextKey   = "admin_authed"
)

// payload token 内部结构。
type payload struct {
	Exp int64 `json:"exp"`
}

// Auth 鉴权器。
type Auth struct {
	password string
	secret   []byte
	secure   bool // cookie Secure 标志（dev 下 false，允许 http）
}

// New 创建鉴权器。password 管理密码，secret HMAC 密钥，secure 控制 cookie Secure 标志。
func New(password string, secret []byte, secure bool) *Auth {
	return &Auth{password: password, secret: secret, secure: secure}
}

// VerifyPassword 常量时间校验密码。
func (a *Auth) VerifyPassword(input string) bool {
	return subtle.ConstantTimeCompare([]byte(input), []byte(a.password)) == 1
}

// IssueToken 签发 token（有效期 TokenMaxAge）。
func (a *Auth) IssueToken() (string, error) {
	p := payload{Exp: time.Now().Add(time.Duration(TokenMaxAge) * time.Second).Unix()}
	body, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding.EncodeToString(body)
	mac := hmac.New(sha256.New, a.secret)
	mac.Write([]byte(enc))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return enc + "." + sig, nil
}

// VerifyToken 验证 token 签名 + 过期。返回 nil 表示有效。
func (a *Auth) VerifyToken(token string) error {
	if token == "" {
		return errors.New("空 token")
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return errors.New("token 格式错误")
	}
	enc, sig := parts[0], parts[1]

	// 验签名（constant-time）
	mac := hmac.New(sha256.New, a.secret)
	mac.Write([]byte(enc))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
		return errors.New("签名不匹配")
	}

	// 验过期
	body, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil {
		return fmt.Errorf("payload 解码失败: %w", err)
	}
	var p payload
	if err := json.Unmarshal(body, &p); err != nil {
		return fmt.Errorf("payload 反序列化失败: %w", err)
	}
	if time.Now().Unix() > p.Exp {
		return errors.New("token 已过期")
	}
	return nil
}

// SetCookie 把 token 写入响应 cookie。
func (a *Auth) SetCookie(c *gin.Context, token string) {
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(CookieName, token, TokenMaxAge, "/", "", a.secure, true) // HttpOnly=true
}

// ClearCookie 清除 cookie。
func (a *Auth) ClearCookie(c *gin.Context) {
	c.SetCookie(CookieName, "", -1, "/", "", a.secure, true)
}

// Middleware 验证 cookie，保护 /api/admin/* 路由。
func (a *Auth) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(CookieName)
		if err != nil || a.VerifyToken(token) != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录或会话过期"})
			return
		}
		c.Set(ContextKey, true)
		c.Next()
	}
}
