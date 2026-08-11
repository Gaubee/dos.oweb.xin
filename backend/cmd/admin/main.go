// Command admin 是 dos.oweb.xin 管理后端入口。
//
// 正交意图：
//   1. 加载配置（环境变量）
//   2. 装配依赖（store + auth + builder + server）
//   3. 启动 HTTP 服务
//
// 单二进制：运行时从磁盘读 admin/dist 托管 admin SPA；
// dev 模式 admin 由独立 Vite 服务（5174），Go 只管 API。
//
// 环境变量：
//   ADMIN_ADDR=:7780              监听地址
//   ADMIN_PASSWORD=admin          管理密码（必填）
//   ADMIN_SECRET=<random>         HMAC 密钥（留空则启动时随机生成，重启会话失效）
//   DATA_DIR=./frontend/public    数据目录（games/featured/mirrors.json + covers）
//   PUBLISH_HOOK=                 发布 hook（可选，如 "bash deploy.sh"）
//   ADMIN_DIST=./admin/dist       admin SPA 产物目录
//   ADMIN_DEV=0                   1=开发模式（cookie 不要求 HTTPS）
package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"log"
	"os"
	"path/filepath"

	"github.com/gaubee/dos.oweb.xin/backend/internal/auth"
	"github.com/gaubee/dos.oweb.xin/backend/internal/builder"
	"github.com/gaubee/dos.oweb.xin/backend/internal/config"
	"github.com/gaubee/dos.oweb.xin/backend/internal/server"
	"github.com/gaubee/dos.oweb.xin/backend/internal/store"
)

func main() {
	addr := flag.String("addr", getEnv("ADMIN_ADDR", ":7780"), "HTTP 监听地址")
	dev := flag.Bool("dev", os.Getenv("ADMIN_DEV") == "1", "开发模式（cookie 不要求 HTTPS）")
	flag.Parse()

	dataDir := getEnv("DATA_DIR", "frontend/public")
	dataDir, _ = filepath.Abs(dataDir)
	adminDist := getEnv("ADMIN_DIST", "admin/dist")
	adminDist, _ = filepath.Abs(adminDist)
	workDir, _ := filepath.Abs(".") // 项目根（go run 的 CWD）

	password := getEnv("ADMIN_PASSWORD", "admin")
	secretStr := os.Getenv("ADMIN_SECRET")
	if secretStr == "" {
		// 随机生成，进程重启所有会话失效（单管理员可接受）
		b := make([]byte, 32)
		rand.Read(b)
		secretStr = hex.EncodeToString(b)
		log.Println("⚠ ADMIN_SECRET 未设置，使用随机密钥（重启后需重新登录）")
	}
	hookEnv := os.Getenv("PUBLISH_HOOK") // 环境变量作为初始 fallback

	// 装配
	st, err := store.New(dataDir)
	if err != nil {
		log.Fatalf("加载数据失败 (%s): %v", dataDir, err)
	}
	log.Printf("已加载 %d 款游戏 (数据目录: %s)", st.Total(), dataDir)

	cfgMgr := config.New(dataDir, hookEnv)
	a := auth.New(password, []byte(secretStr), !*dev)
	b := builder.New(st, cfgMgr, workDir, *addr)

	srv := server.New(server.Config{
		Store:     st,
		Auth:      a,
		Builder:   b,
		ConfigMgr: cfgMgr,
		AdminDist: adminDist,
		Dev:       *dev,
	})

	cfg := cfgMgr.Get()
	if cfg.CommandHook != "" || cfg.WebHook != "" {
		log.Printf("发布 hook: %s", cfg.CommandHook)
		if cfg.WebHook != "" {
			log.Printf("发布 webHook: %s", cfg.WebHook)
		}
	} else {
		log.Println("未配置 hook，可在管理后台发布设置页配置")
	}

	r := srv.Router()
	log.Printf("管理后端启动于 %s (dev=%v)", *addr, *dev)
	if err := r.Run(*addr); err != nil {
		log.Fatalf("服务退出: %v", err)
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
