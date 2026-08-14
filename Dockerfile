# Multi-stage Dockerfile：构建 frontend + admin + Go 二进制 → 单镜像
#
# 用法：
#   docker build -t dos-oweb-xin .
#   docker run -p 7780:7780 -e ADMIN_PASSWORD=xxx dos-oweb-xin
#   CI 自动构建推送：ghcr.io/gaubee/game.oweb.xin（.github/workflows/docker-publish.yml）
#
# 产物：
#   /app/dos-admin        Go 二进制（含 admin SPA + API + 封面 + 自托管 zip）
#   /app/seed/            种子数据（public 游戏数据 + dist PWA 产物）
#   /app/frontend/public  运行时数据目录（entrypoint 从 seed 自愈拷入后可被挂载卷覆盖）

# —— Stage 1: 构建 frontend (PWA) ——
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# —— Stage 2: 构建 admin SPA ——
FROM node:22-slim AS admin-builder
WORKDIR /app/admin
COPY admin/package.json admin/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY admin/ ./
RUN pnpm build

# —— Stage 3: 构建 Go 二进制 ——
FROM golang:1.26 AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY backend/ ./backend/
# admin dist 嵌入 Go 二进制（可选，运行时也可从磁盘读）
COPY --from=admin-builder /app/admin/dist ./admin/dist
RUN CGO_ENABLED=0 go build -o dos-admin ./backend/cmd/admin

# —— Stage 4: 运行时 ——
FROM debian:bookworm-slim AS runtime
WORKDIR /app

# 安装最小运行时依赖（bash for hooks，ca-certificates for HTTPS）
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

# Go 二进制
COPY --from=go-builder /app/dos-admin ./dos-admin

# 种子数据：挂载点（/app/frontend/public、/app/frontend/dist）为空时，
# 由 docker-entrypoint.sh 启动自愈拷入（bind mount / 预建卷场景）
COPY frontend/public /app/seed/public
COPY --from=frontend-builder /app/frontend/dist /app/seed/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Admin SPA 产物（Go 运行时也可从磁盘读）
COPY --from=admin-builder /app/admin/dist ./admin/dist

# 迁移脚本（首次启动时执行）
COPY backend/cmd/migrate-types ./backend/cmd/migrate-types
COPY backend/cmd/gen-lqip ./backend/cmd/gen-lqip
COPY backend/cmd/hide-no-cover ./backend/cmd/hide-no-cover

ENV ADMIN_ADDR=:7780
ENV DATA_DIR=/app/frontend/public
ENV ADMIN_DIST=/app/admin/dist
EXPOSE 7780

# 无外部工具可用时不设 HEALTHCHECK（compose 用 service_started 依赖）

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["--addr=:7780"]
