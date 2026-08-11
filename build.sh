#!/usr/bin/env bash
# 构建脚本：
#   1. frontend → frontend/dist（公开站 PWA）
#   2. admin → admin/dist（管理后台，供 Go embed 或静态托管）
#   3. Go → dos-admin 二进制（含 admin/dist）
#
# 部署：dos-admin 二进制 + frontend/dist 静态文件
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> 1/4 构建公开站 (frontend PWA)"
(cd frontend && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
(cd frontend && pnpm build)

echo "==> 2/4 构建管理后台 (admin SPA)"
(cd admin && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
(cd admin && pnpm build)

echo "==> 3/4 编译 Go 二进制"
go build -o dos-admin ./backend/cmd/admin

echo "==> 4/4 完成"
ls -lh dos-admin
echo
echo "产物："
echo "  dos-admin         Go 后端二进制（含 admin SPA）"
echo "  frontend/dist/    公开站静态文件（部署到 game.oweb.xin）"
echo
echo "运行: ./dos-admin --addr=:7780"
