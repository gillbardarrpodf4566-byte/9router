# 9Router 自动化部署(GitHub Actions → Docker + 宝塔)

**流程**: `git push` 到 `master` → GitHub Actions 构建 Docker 镜像并推送到 GHCR → SSH 登录服务器 → `docker compose pull && up -d` 重启容器。

服务器(165.154.147.155)只负责拉镜像,不做构建,1.6G 空闲内存够用。

```
┌─────────────┐   push    ┌──────────────────┐   image    ┌──────────────┐
│  本地/任意机  │ ────────▶ │ GitHub Actions    │ ─────────▶ │  GHCR 镜像仓库 │
└─────────────┘           │  构建 linux/amd64 │            └──────────────┘
                          └────────┬─────────┘   ssh deploy │
                                   │                        ▼
                                   └─────────▶ ┌────────────────────────┐
                                               │ 165.154.147.155 (宝塔)   │
                                               │ Nginx :80/:443 (HTTPS)  │
                                               │   └─▶ 127.0.0.1:20128  │
                                               │       └─▶ docker:9router │
                                               └────────────────────────┘
```

---

## 第 1 步:推送代码,触发首次镜像构建

改完工作流后先推一次,让 Actions 把 `latest` 镜像构建出来(约 5-10 分钟):

```bash
git push origin master
```

到仓库 → **Actions** 标签页确认 `Build and Deploy` 工作流:
- `build-and-push` 必须成功(失败就看日志修)。
- 首次推送如果还没配好 SSH secrets,`deploy` 步骤会失败——**正常**,配完 secrets 后重推即可。

## 第 2 步:GitHub 侧一次性配置

### 2.1 把 GHCR 包设为公开(服务器免登录拉镜像)

仓库 → **Settings** → **Packages** → 选择 `9router` → **Package settings** → **Visibility** → **Public**。

### 2.2 生成部署用 SSH 密钥对(在你的本地电脑执行)

```bash
ssh-keygen -t ed25519 -f 9router-deploy -N ""
# 生成两个文件: 9router-deploy(私钥) 和 9router-deploy.pub(公钥)
```

把**公钥**追加到服务器:

```bash
cat 9router-deploy.pub | ssh root@165.154.147.155 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh'
```

### 2.3 配置仓库 Secrets

仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**,添加:

| Secret | 值 |
|---|---|
| `DEPLOY_HOST` | `165.154.147.155` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_DIR` | `/www/wwwroot/9router` |
| `DEPLOY_SSH_KEY` | 本地 `9router-deploy` 文件的**完整内容**(包含 `-----BEGIN OPENSSH PRIVATE KEY-----` 首尾两行) |

> ⚠️ 私钥只进 Secrets,不要提交到仓库、不要发到聊天里。

## 第 3 步:服务器侧一次性配置(165.154.147.155)

### 3.1 确认 Docker 可用

```bash
docker version && docker compose version
```

### 3.2 创建部署目录并放入 3 个文件

```bash
mkdir -p /www/wwwroot/9router && cd /www/wwwroot/9router
```

从本仓库复制以下文件到 `/www/wwwroot/9router/`:

| 文件 | 来源 |
|---|---|
| `deploy.sh` | 本仓库 `deploy/deploy.sh` |
| `.env` | 本仓库 `deploy/.env.example` 复制并改名 `.env`,按注释填写 |
| `docker-compose.yml` | 本仓库根目录的 `docker-compose.yml`(headroom 已默认注释) |

```bash
chmod 600 .env
chmod +x deploy.sh
```

`.env` 里必须改的:
- `JWT_SECRET`:`openssl rand -base64 48` 生成
- `INITIAL_PASSWORD`:你的仪表盘初始密码
- `API_KEY_SECRET`、`MACHINE_ID_SALT`:也各生成一个随机串
- `BASE_URL` / `NEXT_PUBLIC_BASE_URL`:填你的 `https://你的域名`

### 3.3 手动部署一次,验证环境

```bash
cd /www/wwwroot/9router
bash deploy.sh
```

预期:拉下镜像、容器 running、健康检查返回 OK。再看日志确认:

```bash
docker logs 9router --tail 50
```

此时用 `http://165.154.147.155:20128` 应能直接访问(验证后按第 4 步收口,不要再对外暴露该端口)。

## 第 4 步:域名 + HTTPS(宝塔面板)

1. **建站**:宝塔 → 网站 → 添加站点 → 填域名,PHP 版本选「**纯静态**」。
2. **证书**:站点 → SSL → **Let's Encrypt** → 申请证书(需域名 DNS 已解析到 165.154.147.155)→ 勾选自动续签。
3. **反向代理**:站点 → 反向代理 → 添加:
   - 代理名称:`9router`
   - 目标URL:`http://127.0.0.1:20128`
   - 发送域名:`$host`
4. **补 SSE 参数**(关键,否则流式响应会卡住):站点 → 设置 → **配置文件**,找到宝塔生成的 `location /` 反代块,在 `proxy_pass` 附近补上:

   ```nginx
   proxy_buffering off;
   proxy_cache off;
   proxy_read_timeout 300s;
   ```

   并在 `server {` 块内加:

   ```nginx
   client_max_body_size 50M;
   ```

   完整参考见 `deploy/nginx-9router.conf`。保存后面板会提示重启 Nginx。
5. **防火墙**:宝塔 → 安全 → 放行 `80`、`443`;**云服务商控制台的安全组**同样只放行 80/443,不要放行 20128。

完成后访问 `https://你的域名`,用 `INITIAL_PASSWORD` 登录。

## 日常使用

| 操作 | 命令/位置 |
|---|---|
| 自动部署 | `git push origin master`,然后看仓库 Actions |
| 手动重新部署 | 服务器 `cd /www/wwwroot/9router && bash deploy.sh` |
| 查看日志 | `docker logs -f 9router` |
| 重启 | `docker compose restart` |
| 数据位置 | Docker 卷 `9router-data`(挂载到容器 `/app/data`,含数据库、账号、配置) |
| 备份 | `docker run --rm -v 9router-data:/data -v /www/backup:/out alpine tar czf /out/9router-data-$(date +%F).tar.gz -C /data .` |

## 更新 compose 配置时

如果以后修改了仓库里的 `docker-compose.yml`(比如开启 headroom、改端口),
需要**手动把新文件重新复制到服务器** `/www/wwwroot/9router/` 再执行 `bash deploy.sh`
——Actions 只跑 `deploy.sh`,不会自动同步 compose 文件。

## 故障排查

- **Actions 构建失败**:几乎总是代码/依赖问题,看 build 步骤日志;与服务器无关。
- **deploy 步骤 SSH 失败**:核对三个 Secrets;服务器上 `tail /var/log/secure` 看拒绝原因;确认密钥是 ed25519 且完整(含 BEGIN/END 行)。
- **拉镜像 401/unauthorized**:GHCR 包被设回私有。改回 Public,或按 `deploy.sh` 顶部注释在 `.env` 配 `GHCR_USER`/`GHCR_TOKEN`。
- **容器起来了但 502**:Nginx 反代没配好或 20128 端口没映射;`docker compose ps` + `curl http://127.0.0.1:20128/api/health` 逐层确认。
- **流式响应卡住/一次性蹦出全部内容**:Nginx 忘了 `proxy_buffering off`。
- **内存告急**:1.6G 空闲跑着容器 + Nginx 偏紧。别开 headroom,别在同一台机器再跑其他大服务;必要时加 swap:
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  ```
