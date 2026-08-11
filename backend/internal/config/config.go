// Package config 管理发布 hook 配置（持久化到 config.json）。
//
// 正交意图：
//   1. HookConfig —— hook 配置结构（commandHook + webHook）
//   2. Load/Save —— 从 DATA_DIR/config.json 原子读写
//
// 替代之前从环境变量 PUBLISH_HOOK 读取的方式（环境变量作为 fallback 初始值）。
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// HookConfig 发布 hook 配置。
type HookConfig struct {
	// 本地命令 hook（如 "bash deploy.sh"），空=不执行
	CommandHook string `json:"commandHook,omitempty"`
	// Webhook URL（发布时 POST 通知，body 含下载链接），空=不调用
	WebHook string `json:"webHook,omitempty"`
	// 后端外部可访问地址（如 https://admin.game.oweb.xin），用于拼接下载链接
	// 默认 localhost:PORT
	Host string `json:"host,omitempty"`
	// 发布时是否压缩 frontend/dist 并提供下载链接
	PackageDist bool `json:"packageDist,omitempty"`
}

// Manager 配置管理器（线程安全 + 原子写盘）。
type Manager struct {
	mu       sync.RWMutex
	data     HookConfig
	filePath string
}

// New 从 dataDir/config.json 加载配置。initialEnv 作为环境变量 fallback。
func New(dataDir string, initialEnv string) *Manager {
	m := &Manager{filePath: filepath.Join(dataDir, "config.json")}
	if err := m.load(); err != nil {
		// 文件不存在或解析失败，用环境变量初始化
		if initialEnv != "" {
			m.data.CommandHook = initialEnv
			_ = m.save()
		}
	}
	return m
}

// Get 返回配置副本。
func (m *Manager) Get() HookConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.data
}

// Set 更新配置并持久化。
func (m *Manager) Set(cfg HookConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data = cfg
	return m.save()
}

func (m *Manager) load() error {
	raw, err := os.ReadFile(m.filePath)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, &m.data)
}

func (m *Manager) save() error {
	data, err := json.MarshalIndent(m.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := m.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, m.filePath)
}
