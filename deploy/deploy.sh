#!/usr/bin/env bash
# 9Router 服务器端部署脚本 — 由 GitHub Actions 在 master 推送后自动执行
# 也可在服务器上手动运行: cd /www/wwwroot/9router && bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

# GHCR 包是 Public 的，镜像匿名拉取，不需要 token（见 DEPLOY-AUTO.md 第 2.1 步）。
# 服务器上只要残留一份过期的 ghcr.io 登录，拉取就会报 error from registry: denied
# （Docker 会带着失效凭据去请求，不会退回匿名访问），所以失败时清掉登录再试一次。
if ! docker compose pull; then
  echo "--- 拉取失败，清除本机残留的 ghcr.io 登录后重试 ---"
  docker logout ghcr.io >/dev/null 2>&1 || true
  docker compose pull
fi
docker compose up -d

# 清理旧镜像，避免磁盘占满
docker image prune -f

echo "--- 当前容器状态 ---"
docker compose ps
echo "--- 健康检查 ---"
sleep 3
curl -sf http://127.0.0.1:20128/api/health && echo " OK" || echo "（应用可能还在启动中，稍后用 docker logs 9router 查看）"
