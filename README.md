# game.oweb.xin

中文 DOS 游戏在线游玩平台 + 管理后台。复刻自 [rwv/chinese-dos-games-web](https://github.com/rwv/chinese-dos-games-web)。

PWA 公开站（game.oweb.xin）+ Go 管理后台（admin.game.oweb.xin）双工程架构。

## 特性

- 🎮 **1898 款**经典中文 DOS 游戏，浏览器内实时运行（emularity + DOSBox）
- ⚡ **PWA**：离线可用，外壳 precache + games.json SWR + 封面/emularity CacheFirst
- 🔌 **动态镜像池 + 熔断器**：多源并发嗅探，不可用节点自动熔断 + 定时恢复
- 💾 **本地游戏库**：IndexedDB (Dexie)，下载一次永久离线可玩，断点续传
- 🛠 **Go 管理后台**：游戏 CRUD / 封面上传 / 推荐配置 / 镜像管理 / 一键发布
- 📦 **构建管线**：CMS 改数据 → 发布 → 执行 hook（构建+部署自定义）

## 架构

```
┌── admin.game.oweb.xin (Go 单二进制) ──────────────────────┐
│  Admin SPA (React) + CMS API (Gin) + HMAC 鉴权            │
│  ↓ POST /api/admin/publish                                │
│  写数据 (games/featured/mirrors.json) → 执行 PUBLISH_HOOK │
└───────────────────────────────────────────────────────────┘
                            │ hook 执行（你自定义：build + deploy）
                            ▼
┌── game.oweb.xin (纯静态 PWA) ─────────────────────────────┐
│  Service Worker (autoUpdate)                              │
│   外壳 precache | games.json SWR | covers CacheFirst      │
│                                                           │
│  动态镜像池 + 熔断器 (读 mirrors.json)                    │
│   并发嗅探→选可用→失败累计→自动关闭→定时恢复探测         │
│                                                           │
│  Dexie 本地游戏库 (IndexedDB)                             │
└───────────────────────────────────────────────────────────┘
```

## 工程结构

```
├── frontend/          公开站 PWA (React + Vite + vite-plugin-pwa)
├── admin/             管理后台 SPA (React + Vite)
├── backend/           Go 管理后端 (Gin)
│   ├── cmd/admin/     入口
│   └── internal/
│       ├── model/     领域模型
│       ├── store/     JSON 文件存储 (原子写盘)
│       ├── auth/      HMAC cookie 鉴权
│       ├── server/    Gin 路由 + API
│       └── builder/   发布管线 + SSE
├── dev.sh             一键开发（三进程）
└── build.sh           一键构建
```

## 快速开始

### 开发模式

```bash
./dev.sh
# 公开站:   http://localhost:5173
# 管理后台: http://localhost:5174  (默认密码: admin)
# Go API:   http://localhost:7780
```

### 生产构建

```bash
./build.sh
# 产出: dos-admin (二进制) + frontend/dist/ (公开站)
```

## 部署

### Docker（管理后台，推荐）

镜像由 GitHub Actions 自动构建并发布到 ghcr.io（`master` → `latest`，`v*` tag → 版本号）：

```bash
cp .env.example .env   # ADMIN_PASSWORD 必填，缺失时 compose 直接报错拒启
docker compose pull && docker compose up -d
```

本地源码构建（不使用 CI 镜像）：`docker compose up -d --build`

1Panel 部署：容器 → 编排 → 创建，粘贴 docker-compose.yml 内容，`.env` 与 compose 同目录
（`/opt/1panel/docker/compose/<编排名>/.env`），至少配置 `ADMIN_PASSWORD`。

### game.oweb.xin（公开站）
`frontend/dist/` 部署到任意静态主机（Cloudflare Pages / nginx），需 SPA fallback。

### admin.game.oweb.xin（管理后台）
```bash
# 环境变量
export ADMIN_PASSWORD=你的密码
export ADMIN_SECRET=随机密钥
export PUBLISH_HOOK='bash deploy.sh'   # 发布 hook（构建+部署公开站）
export DATA_DIR=./frontend/public

./dos-admin --addr=:7780
```

**PUBLISH_HOOK 示例**（你自定义构建+部署逻辑）：
```bash
#!/usr/bin/env bash
# deploy.sh
set -e
cd frontend && pnpm build
rsync -a --delete dist/ /var/www/game.oweb.xin/
```

## 管理 API

```
公开:  GET /api/games /api/games/:id /api/featured /api/mirrors
鉴权:  POST /api/admin/login
       CRUD /api/admin/games (+ cover 上传)
       PUT  /api/admin/featured /api/admin/mirrors
       POST /api/admin/publish (触发发布)
       GET  /api/admin/publish/status | /publish/logs (SSE)
```

## 关键设计

### 动态镜像池 + 熔断
镜像源由 CMS 管理（mirrors.json），前端运行时加载。连续失败 3 次的镜像自动熔断（5 分钟后半开探测恢复），健康状态持久化到 localStorage。你的游戏和 dos 游戏可共用同一套镜像池。

### 发布管线
Go 后端只负责写数据 + 执行 hook，不假设构建/部署方式。管理员在 admin 后台改数据 → 点"发布" → 后端写 games/featured/mirrors.json 到 `frontend/public/` → 执行 `PUBLISH_HOOK`（你完全自定义）。SSE 实时推送构建日志。

### PWA 缓存策略
- 外壳（js/css/html）：Precache（随构建更新）
- games/featured/mirrors.json：StaleWhileRevalidate（发布后重载生效）
- covers/：CacheFirst（30天，封面版本化 `?v=` 解决失效）
- emularity/：CacheFirst（含 5.3MB dosbox-sync.js，首次后离线）

## 鸣谢
- [rwv/chinese-dos-games](https://github.com/rwv/chinese-dos-games) — 游戏数据
- [dreamlayers/em-dosbox](https://github.com/dreamlayers/em-dosbox) — DOSBox Emscripten 移植
- [db48x/emularity](https://github.com/db48x/emularity) — 浏览器模拟器加载器
