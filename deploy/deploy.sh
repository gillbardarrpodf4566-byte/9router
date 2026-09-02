#!/usr/bin/env bash
# 9Router 服务器端部署脚本 — 由 GitHub Actions 在 master 推送后自动执行
# 也可在服务器上手动运行: cd /www/wwwroot/9router && bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

# 镜像是 GHCR 公开包时可直接拉取。若拉取报 401/unauthorized，
# 在 .env 中设置 GHCR_USER/GHCR_TOKEN 并取消下面两行注释:
# set -a; source .env; set +a
# echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

docker compose pull
docker compose up -d

# 清理旧镜像，避免磁盘占满
docker image prune -f

echo "--- 当前容器状态 ---"
docker compose ps
echo "--- 健康检查 ---"
sleep 3
curl -sf http://127.0.0.1:20128/api/health && echo " OK" || echo "（应用可能还在启动中，稍后用 docker logs 9router 查看）"
