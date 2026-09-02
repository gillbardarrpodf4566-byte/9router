# 9Router 宝塔服务器部署指南

## 📋 部署准备

### 服务器要求
- **操作系统**: Linux（Ubuntu 20.04+ / CentOS 7+）
- **内存**: 至少 2GB RAM（推荐 4GB+）
- **磁盘**: 至少 10GB 可用空间
- **宝塔面板**: 7.9.0+

### 本地准备
- 已安装 Git
- 9Router 项目代码
- 服务器 SSH 访问权限

---

## 🚀 部署步骤

### 第一步：宝塔环境配置

#### 1.1 安装必要软件

登录宝塔面板 → **软件商店**，安装以下软件：

✅ **Nginx** 1.20+  
✅ **PM2 管理器** 4.0+  
✅ **Node.js 版本管理器**（安装 Node.js 18.17+ 或 20+）

#### 1.2 安装 Node.js

1. 打开 **软件商店** → 搜索 **"Node.js 版本管理器"**
2. 点击 **设置** → 选择安装 **Node.js 20.x**（推荐）
3. 验证安装：
   ```bash
   node -v  # 应显示 v20.x.x
   npm -v   # 应显示 10.x.x
   ```

---

### 第二步：上传代码

#### 方式 1: Git 克隆（推荐）

1. 登录服务器 SSH：
   ```bash
   ssh root@your-server-ip
   ```

2. 创建项目目录：
   ```bash
   mkdir -p /www/wwwroot/9router
   cd /www/wwwroot/9router
   ```

3. 上传代码（选择一种方式）：

   **方式 A: 从本地上传**
   ```bash
   # 在本地项目目录执行
   cd G:/project/9router
   
   # 打包代码（排除 node_modules）
   tar -czf 9router.tar.gz \
     --exclude=node_modules \
     --exclude=.next \
     --exclude=.git \
     --exclude=*.log \
     --exclude=sessions \
     --exclude=qoder-sessions \
     .
   
   # 上传到服务器
   scp 9router.tar.gz root@your-server-ip:/www/wwwroot/9router/
   
   # 在服务器解压
   ssh root@your-server-ip
   cd /www/wwwroot/9router
   tar -xzf 9router.tar.gz
   rm 9router.tar.gz
   ```

   **方式 B: 从 Git 仓库**
   ```bash
   # 如果项目在 GitHub/GitLab
   cd /www/wwwroot/9router
   git clone https://github.com/your-username/9router.git .
   ```

#### 方式 2: 宝塔文件管理器上传

1. 打开宝塔面板 → **文件**
2. 进入 `/www/wwwroot/` 目录
3. 新建文件夹 `9router`
4. 选中文件夹 → **上传** → 选择本地打包好的文件

---

### 第三步：配置环境变量

1. 在服务器创建 `.env` 文件：
   ```bash
   cd /www/wwwroot/9router
   nano .env
   ```

2. 填入以下配置：
   ```env
   # 生产环境配置
   NODE_ENV=production
   
   # 服务端口（内部端口，Nginx 会反向代理）
   PORT=20127
   
   # 管理员密码（务必修改！）
   INITIAL_PASSWORD=your-secure-password-here
   
   # 数据库路径（生产环境使用绝对路径）
   DB_PATH=/www/wwwroot/9router/data/db.sqlite
   
   # JWT 密钥（生成强密钥）
   JWT_SECRET=your-very-long-random-secret-key-here
   
   # MITM 证书目录
   MITM_DIR=/www/wwwroot/9router/data/mitm
   
   # 可选：Google Analytics
   # NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
   ```

3. 生成强密钥：
   ```bash
   # 生成 JWT_SECRET
   openssl rand -base64 48
   
   # 生成 INITIAL_PASSWORD
   openssl rand -base64 24
   ```

4. 保存并退出（`Ctrl+O` → `Enter` → `Ctrl+X`）

5. 创建数据目录：
   ```bash
   mkdir -p /www/wwwroot/9router/data
   mkdir -p /www/wwwroot/9router/data/mitm
   chmod 755 /www/wwwroot/9router/data
   ```

---

### 第四步：安装依赖并构建

```bash
cd /www/wwwroot/9router

# 安装依赖（使用淘宝镜像加速）
npm install --registry=https://registry.npmmirror.com

# 构建生产版本
npm run build
```

**注意事项**：
- 如果构建失败提示内存不足，增加交换分区：
  ```bash
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  ```

- 构建完成后验证：
  ```bash
  ls -la .next/  # 应该看到 standalone 目录
  ```

---

### 第五步：配置 PM2 管理进程

#### 5.1 创建 PM2 配置文件

```bash
cd /www/wwwroot/9router
nano ecosystem.config.js
```

内容：
```javascript
module.exports = {
  apps: [{
    name: '9router',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 20127',
    cwd: '/www/wwwroot/9router',
    instances: 1,
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 20127
    },
    error_file: '/www/wwwroot/9router/logs/error.log',
    out_file: '/www/wwwroot/9router/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
}
```

保存退出。

#### 5.2 创建日志目录

```bash
mkdir -p /www/wwwroot/9router/logs
```

#### 5.3 使用宝塔 PM2 管理器

1. 打开宝塔面板 → **软件商店** → **PM2 管理器** → **设置**
2. 点击 **添加项目**：
   - **项目名称**: 9router
   - **启动文件路径**: `/www/wwwroot/9router/ecosystem.config.js`
   - **项目路径**: `/www/wwwroot/9router`
3. 点击 **保存并启动**

#### 5.4 或使用命令行启动

```bash
cd /www/wwwroot/9router
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 5.5 验证服务运行

```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs 9router

# 测试服务
curl http://localhost:20127/api/health
# 应返回: {"ok":true}
```

---

### 第六步：配置 Nginx 反向代理

#### 6.1 创建网站

1. 打开宝塔面板 → **网站** → **添加站点**
2. 填写信息：
   - **域名**: `9router.yourdomain.com`（或你的域名）
   - **根目录**: `/www/wwwroot/9router`（不会实际使用，只是占位）
   - **PHP版本**: 纯静态
   - 其他保持默认
3. 点击 **提交**

#### 6.2 配置反向代理

1. 找到刚创建的网站 → 点击 **设置**
2. 选择 **反向代理** → **添加反向代理**
3. 填写配置：
   - **代理名称**: 9router
   - **目标URL**: `http://127.0.0.1:20127`
   - **发送域名**: `$host`
   - **内容替换**: 留空
4. 点击 **提交**

#### 6.3 手动优化 Nginx 配置（推荐）

点击网站 **设置** → **配置文件**，在 `location / {` 块之前添加：

```nginx
# WebSocket 支持（如果未来需要）
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

# 日志
access_log /www/wwwlogs/9router.log;
error_log /www/wwwlogs/9router.error.log;

# 限流（防止滥用）
limit_req_zone $binary_remote_addr zone=9router_limit:10m rate=20r/s;
limit_conn_zone $binary_remote_addr zone=9router_conn:10m;

server {
    # ... 宝塔生成的 server 配置 ...
    
    # 客户端最大请求体（支持大模型请求）
    client_max_body_size 50M;
    
    # 超时配置
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    
    location / {
        limit_req zone=9router_limit burst=10 nodelay;
        limit_conn 9router_conn 10;
        
        proxy_pass http://127.0.0.1:20127;
        proxy_http_version 1.1;
        
        # 保留真实 IP
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        
        # 禁用缓冲（SSE 流式响应）
        proxy_buffering off;
        proxy_cache off;
    }
    
    # 健康检查端点（可选）
    location = /health {
        access_log off;
        proxy_pass http://127.0.0.1:20127/api/health;
    }
}
```

保存后重启 Nginx：
```bash
nginx -t  # 检查配置
systemctl reload nginx
```

---

### 第七步：配置 SSL 证书（强烈推荐）

#### 方式 1: Let's Encrypt 免费证书（推荐）

1. 确保域名 DNS 已解析到服务器
2. 宝塔面板 → **网站** → 找到 9router 站点 → **设置**
3. 选择 **SSL** → **Let's Encrypt**
4. 勾选你的域名 → 点击 **申请**
5. 等待证书颁发（约 1-2 分钟）
6. 开启 **强制HTTPS**

#### 方式 2: 上传已有证书

1. 宝塔面板 → **网站** → **SSL** → **其他证书**
2. 粘贴证书内容（`.crt` 和 `.key`）
3. 保存并部署

---

### 第八步：安全加固

#### 8.1 配置防火墙

```bash
# 仅允许必要端口
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 22/tcp    # SSH
ufw allow 8888/tcp  # 宝塔面板（根据实际端口）

# 禁止直接访问应用端口
ufw deny 20127/tcp
ufw enable
```

或在宝塔面板 → **安全** → 开放端口 `80, 443, 22, 8888`，禁止 `20127`

#### 8.2 修改数据库和文件权限

```bash
cd /www/wwwroot/9router
chown -R www:www data/
chmod 700 data/
chmod 600 .env
```

#### 8.3 定期备份

1. 宝塔面板 → **计划任务** → **添加任务**
2. 任务类型：备份数据库 + 备份目录
3. 备份路径：`/www/wwwroot/9router/data`
4. 执行周期：每天凌晨 3 点

---

## 🔧 常用运维命令

### PM2 管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs 9router
pm2 logs 9router --lines 100

# 重启服务
pm2 restart 9router

# 停止服务
pm2 stop 9router

# 启动服务
pm2 start 9router

# 删除进程
pm2 delete 9router

# 监控面板
pm2 monit
```

### 更新代码

```bash
cd /www/wwwroot/9router

# 备份当前版本
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  --exclude=node_modules \
  --exclude=.next \
  .

# 拉取新代码（Git）
git pull

# 或上传新文件后...

# 重新安装依赖（如果 package.json 变化）
npm install

# 重新构建
npm run build

# 重启服务
pm2 restart 9router
```

### 查看日志

```bash
# 应用日志
pm2 logs 9router

# Nginx 访问日志
tail -f /www/wwwlogs/9router.log

# Nginx 错误日志
tail -f /www/wwwlogs/9router.error.log

# 系统日志
journalctl -u nginx -f
```

---

## 🐛 故障排查

### 问题 1: 服务无法启动

```bash
# 检查端口占用
netstat -tlnp | grep 20127

# 检查 PM2 日志
pm2 logs 9router --err

# 手动启动测试
cd /www/wwwroot/9router
npm run start
```

### 问题 2: 502 Bad Gateway

```bash
# 检查 9Router 服务是否运行
pm2 status
curl http://localhost:20127/api/health

# 检查 Nginx 配置
nginx -t

# 查看 Nginx 错误日志
tail -n 50 /www/wwwlogs/9router.error.log
```

### 问题 3: 内存不足

```bash
# 查看内存使用
free -h

# 增加 PM2 重启阈值
pm2 start ecosystem.config.js --max-memory-restart 2G

# 或减少实例数（ecosystem.config.js 中 instances: 1）
```

### 问题 4: 数据库锁定

```bash
# 检查数据库文件权限
ls -la /www/wwwroot/9router/data/

# 修复权限
chown -R www:www /www/wwwroot/9router/data/
chmod 755 /www/wwwroot/9router/data/
```

---

## 📊 性能优化

### 1. 启用 Gzip 压缩

在 Nginx 配置中添加（通常宝塔已启用）：
```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

### 2. 配置浏览器缓存

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```

### 3. 启用 HTTP/2

宝塔面板 → 网站 → 设置 → SSL → 开启 **HTTP/2**

---

## ✅ 部署检查清单

部署完成后，验证以下项目：

- [ ] 服务运行正常：`pm2 status` 显示 `online`
- [ ] 健康检查通过：`curl http://localhost:20127/api/health` 返回 `{"ok":true}`
- [ ] 域名可访问：打开 `https://yourdomain.com`
- [ ] SSL 证书有效：浏览器显示绿色锁
- [ ] 登录功能正常：访问 `/dashboard`，使用 `.env` 中的密码登录
- [ ] Qoder 连接正常：Dashboard → Providers → 查看 Qoder 状态
- [ ] API 测试通过：`curl https://yourdomain.com/api/v1/models`
- [ ] 日志正常写入：`ls -la /www/wwwroot/9router/logs/`
- [ ] 防火墙配置正确：无法直接访问 `:20127` 端口
- [ ] 数据持久化：重启服务后 Dashboard 数据不丢失

---

## 📞 需要帮助？

如果遇到问题：

1. 检查 PM2 日志：`pm2 logs 9router`
2. 检查 Nginx 日志：`tail -f /www/wwwlogs/9router.error.log`
3. 检查系统资源：`htop` 或 `top`
4. 提供错误信息以便诊断

---

**部署成功后，你的 9Router 将运行在：**
- 🌐 **生产地址**: `https://yourdomain.com`
- 🎛️ **管理面板**: `https://yourdomain.com/dashboard`
- 🔌 **API 端点**: `https://yourdomain.com/v1`

祝部署顺利！🎉
