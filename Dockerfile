# Multi-stage Dockerfile：构建 frontend + admin + Go 二进制 → 单镜像
#
# 用法：
#   docker build -t dos-oweb-xin .
#   docker run -p 7780:7780 -e ADMIN_PASSWORD=xxx dos-oweb-xin
#
# 产物：
#   /app/dos-admin        Go 二进制（含 admin SPA + API + 封面 + 自托管 zip）
#   /app/frontend/public  游戏数据（games.json + covers + emularity）
#   /app/frontend/dist    公开站 PWA 产物（如需单独部署）

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
FROM golang:1.26-slim AS go-builder
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
    bash ca-certificates nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Go 二进制
COPY --from=go-builder /app/dos-admin ./dos-admin

# 前端数据（games.json + covers + emularity）
COPY frontend/public ./frontend/public

# 前端构建产物（供 PackageDist 打包用）
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Admin SPA 产物（Go 运行时也可从磁盘读）
COPY --from=admin-builder /app/admin/dist ./admin/dist

# 迁移脚本（首次启动时执行）
COPY backend/cmd/migrate-types ./backend/cmd/migrate-types
COPY backend/cmd/gen-blurhash ./backend/cmd/gen-blurhash

ENV ADMIN_ADDR=:7780
ENV DATA_DIR=/app/frontend/public
ENV ADMIN_DIST=/app/admin/dist
EXPOSE 7780

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -sf http://localhost:7780/api/games || exit 1

ENTRYPOINT ["./dos-admin"]
CMD ["--addr=:7780"]
