#!/usr/bin/env bash
# 一键启动开发模式（三进程）：
#   Go 后端 (7780)  —— CMS API + admin 静态
#   frontend (5173) —— 公开站 PWA (Vite HMR)
#   admin (5174)    —— 管理后台 (Vite HMR)
#
# Ctrl+C 统一退出，按端口兜底清理无残留。
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

GO_ADDR="${GO_ADDR:-:7780}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"
ADMIN_DEV="${ADMIN_DEV:-1}"

cleanup() {
  echo
  echo "==> 停止服务"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  sleep 1
  # 按端口兜底
  lsof -ti:${GO_ADDR#:} | xargs kill -9 2>/dev/null || true
  lsof -ti:5173 | xargs kill -9 2>/dev/null || true
  lsof -ti:5174 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 装依赖
[[ ! -d frontend/node_modules ]] && (cd frontend && pnpm install) &> /dev/null &
[[ ! -d admin/node_modules ]] && (cd admin && pnpm install) &> /dev/null &
wait

echo "==> Go 后端 (http://localhost:${GO_ADDR#:})"
ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_DEV="$ADMIN_DEV" \
  go run ./backend/cmd/admin --addr="$GO_ADDR" &
PIDS+=($!)

echo "==> 公开站 (http://localhost:5173)"
(cd frontend && pnpm dev --port 5173) &
PIDS+=($!)

echo "==> 管理后台 (http://localhost:5174)"
(cd admin && pnpm dev --port 5174) &
PIDS+=($!)

echo
echo "开发模式已启动："
echo "  公开站 PWA:  http://localhost:5173"
echo "  管理后台:    http://localhost:5174  (密码: $ADMIN_PASSWORD)"
echo "  Go API:      http://localhost:${GO_ADDR#:}"
echo "  Ctrl+C 退出"
echo

# 轮询子进程，任一退出即收尾
while true; do
  alive=0
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then alive=1; fi
  done
  [[ $alive -eq 0 ]] && break
  sleep 1
done
echo "==> 有服务退出"
