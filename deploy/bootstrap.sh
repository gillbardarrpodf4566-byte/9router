#!/usr/bin/env bash
# 9Router 一键部署引导脚本 — 在宝塔服务器上以 root 运行
#
# 完整用法（带域名和密码）:
#   curl -fsSL https://raw.githubusercontent.com/gillbardarrpodf4566-byte/9router/master/deploy/bootstrap.sh | bash -s -- --domain your-domain.com --password 你的登录密码
#
# 最简用法（无域名、密码自动生成，脚本结束会打印）:
#   curl -fsSL https://raw.githubusercontent.com/gillbardarrpodf4566-byte/9router/master/deploy/bootstrap.sh | bash
#
# 重复运行安全：已存在的 .env 不会被覆盖
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/gillbardarrpodf4566-byte/9router/master"
DIR="/www/wwwroot/9router"
DOMAIN=""
PASSWORD=""

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)   DOMAIN="${2:?}"; shift 2 ;;
    --password) PASSWORD="${2:?}"; shift 2 ;;
    *) shift ;;
  esac
done

[ "$(id -u)" = "0" ] || { echo "请用 root 运行"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "未检测到 Docker，请先在宝塔软件商店安装「Docker管理器」"; exit 1; }
command -v curl   >/dev/null 2>&1 || { echo "未检测到 curl"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "未检测到 openssl"; exit 1; }

echo "==> 1/4 下载部署文件到 $DIR"
mkdir -p "$DIR"
curl -fsSL "$REPO_RAW/deploy/deploy.sh"      -o "$DIR/deploy.sh"
curl -fsSL "$REPO_RAW/docker-compose.yml"    -o "$DIR/docker-compose.yml"
curl -fsSL "$REPO_RAW/deploy/.env.example"   -o "$DIR/.env.template"
chmod +x "$DIR/deploy.sh"

echo "==> 2/4 生成 .env（随机密钥）"
if [ -f "$DIR/.env" ]; then
  echo "    .env 已存在，跳过生成（保留原密码/密钥）"
else
  JWT_VAL=$(openssl rand -base64 48)
  AKS_VAL=$(openssl rand -base64 32)
  MIS_VAL=$(openssl rand -base64 32)
  [ -n "$PASSWORD" ] || PASSWORD=$(openssl rand -base64 12)
  sed \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_VAL/" \
    -e "s/^INITIAL_PASSWORD=.*/INITIAL_PASSWORD=$PASSWORD/" \
    -e "s/^API_KEY_SECRET=.*/API_KEY_SECRET=$AKS_VAL/" \
    -e "s/^MACHINE_ID_SALT=.*/MACHINE_ID_SALT=$MIS_VAL/" \
    -e "s|https://your-domain.com|https://${DOMAIN:-your-domain.com}|g" \
    "$DIR/.env.template" > "$DIR/.env"
  rm -f "$DIR/.env.template"
  chmod 600 "$DIR/.env"
fi

echo "==> 3/4 放行 GitHub Actions 的 SSH 登录"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
if ! grep -qF "9router-actions-deploy" ~/.ssh/authorized_keys; then
  echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHFTG7/+JLzR7llzLDIj8JHZQ9ztGR0CDTbkNGF6UWFl 9router-actions-deploy" >> ~/.ssh/authorized_keys
  echo "    已写入公钥"
else
  echo "    公钥已存在，跳过"
fi

echo "==> 4/4 首次部署（拉镜像 + 启动容器）"
cd "$DIR"
bash deploy.sh

IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "==================== 部署完成 ===================="
echo " 仪表盘地址:  http://${IP:-165.154.147.155}:20128"
echo " 登录密码:    $PASSWORD   （请妥善保存，也记录在 $DIR/.env）"
if [ -n "$DOMAIN" ]; then
  echo " 域名 $DOMAIN: 请先在域名解析处添加 A 记录指向 ${IP:-165.154.147.155}，"
  echo " 再按 deploy/DEPLOY-AUTO.md 第 4 步配置 HTTPS（或等 DNS 生效后告诉我域名，我来配）"
fi
echo "==================================================="
echo " 最后一步: 在 GitHub 仓库加 4 个 Secrets（见 deploy/DEPLOY-AUTO.md 2.3），"
echo " 之后每次 git push origin master 即全自动部署。"
