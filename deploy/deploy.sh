#!/usr/bin/env bash
# 9Router 服务器端部署脚本 — 由 GitHub Actions 在 master 推送后自动执行
# 也可在服务器上手动运行: cd /www/wwwroot/9router && bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

# GHCR 包当前为私有，每次部署前用 .env 中的凭据登录。
# （若之后把包改为 Public 可删除此段；GHCR_TOKEN 缺失时跳过登录直接尝试匿名拉取）
if [ -f .env ] && grep -q '^GHCR_TOKEN=' .env; then
  set -a; source .env; set +a
  if [ -n "${GHCR_TOKEN:-}" ] && [ -n "${GHCR_USER:-}" ]; then
    echo "--- 登录 GHCR ---"
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null \
      && echo "    登录成功" || echo "    登录失败（token 可能过期），继续尝试拉取"
  fi
fi

docker compose pull
docker compose up -d

# 清理旧镜像，避免磁盘占满
docker image prune -f

echo "--- 当前容器状态 ---"
docker compose ps
echo "--- 健康检查 ---"
sleep 3
curl -sf http://127.0.0.1:20128/api/health && echo " OK" || echo "（应用可能还在启动中，稍后用 docker logs 9router 查看）"
