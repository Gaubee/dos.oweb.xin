#!/bin/sh
# 意图：容器启动自愈——数据挂载点为空时，从镜像内种子数据拷入
# 背景（2026-08-14）：1Panel 等面板常用 bind mount / 预建空卷，不会触发 Docker
# 命名卷的首次自动拷贝，空挂载直接遮蔽镜像内数据，导致 games.json 缺失拒启。
set -e

DATA_DIR="${DATA_DIR:-/app/frontend/public}"

if [ ! -f "$DATA_DIR/games.json" ]; then
    echo "entrypoint: $DATA_DIR 为空，从镜像种子数据拷入..."
    cp -a /app/seed/public/. "$DATA_DIR/"
fi

if [ ! -e /app/frontend/dist/index.html ] && [ -e /app/seed/dist/index.html ]; then
    echo "entrypoint: /app/frontend/dist 为空，从镜像种子数据拷入..."
    cp -a /app/seed/dist/. /app/frontend/dist/
fi

exec ./dos-admin "$@"
