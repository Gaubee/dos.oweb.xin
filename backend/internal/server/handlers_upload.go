// handlers_upload.go —— PlayCanvas 游戏 zip 上传 handler。
package server

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/gaubee/dos.oweb.xin/backend/internal/uploader"
)

// POST /api/admin/games/upload  (multipart, field=file)
// 上传 PlayCanvas 游戏 zip，自动解压解析 game.json，构造 RawGame 入库 + zip 存自托管源。
func (s *Server) handleUploadGame(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 file 字段: " + err.Error()})
		return
	}
	// 限制 500MB
	if file.Size > 500*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "zip 文件过大（>500MB）"})
		return
	}

	// 读 zip 字节
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "打开上传文件失败: " + err.Error()})
		return
	}
	defer f.Close()
	zipBytes, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取上传文件失败: " + err.Error()})
		return
	}

	// 解析 zip → RawGame
	game, manifest, err := uploader.ParsePlayCanvasZip(zipBytes)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "解析失败: " + err.Error()})
		return
	}

	// identifier 去重：如果已存在，加后缀
	identifier := game.Identifier
	if _, exists := s.store.GetGame(identifier); exists {
		c.JSON(http.StatusConflict, gin.H{
			"error":      "游戏 " + identifier + " 已存在，请先删除或改名",
			"identifier": identifier,
		})
		return
	}

	// 存 zip 到自托管源
	zipPath, err := uploader.SaveZip(zipBytes, s.store.DataDir(), identifier)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 入库
	if err := s.store.AddGame(*game); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "入库失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"game":     game,
		"manifest": manifest,
		"zipPath":  zipPath,
		"zipUrl":   "/storage/zips/" + identifier + ".zip",
	})
}
