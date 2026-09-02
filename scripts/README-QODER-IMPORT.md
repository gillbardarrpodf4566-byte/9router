# 批量导入 Qoder 账号指南

本指南说明如何将多个 Qoder 账号批量导入到 9Router。

## 📋 前提条件

1. **9Router 正在运行**
   ```bash
   npm run dev
   # 或
   npm start
   ```

2. **已设置 Dashboard 密码**
   - 访问 http://localhost:20127
   - 首次访问会提示设置管理员密码

3. **有 Qoder 账号的访问令牌（Access Token）**

---

## 方法 1: 从 Session 文件导入（推荐）

如果你有 Qoder 账号的 session 文件（JSON 格式），这是最简单的方法。

### 步骤：

1. **创建 session 目录**
   ```bash
   mkdir -p qoder-sessions
   ```

2. **复制 session 文件**
   ```bash
   # 将所有 session 文件复制到 qoder-sessions/ 目录
   # 例如：
   cp /path/to/sessions/qedyqungirq@outlook.com.json qoder-sessions/
   cp /path/to/sessions/uaovfmsjxg@outlook.com.json qoder-sessions/
   # ... 等等
   ```

3. **设置环境变量**
   ```bash
   # Linux/Mac
   export DASHBOARD_PASSWORD="你的Dashboard密码"
   
   # Windows (PowerShell)
   $env:DASHBOARD_PASSWORD="你的Dashboard密码"
   
   # Windows (CMD)
   set DASHBOARD_PASSWORD=你的Dashboard密码
   ```

4. **运行导入脚本**
   ```bash
   node scripts/import-qoder-from-sessions.js
   ```

### Session 文件格式示例

脚本期望的 session 文件格式（需要包含访问令牌）：

```json
{
  "access_token": "dt-xxxxxxxxxxxxxxxx",
  "refresh_token": "rt-xxxxxxxxxxxxxxxx",
  "user_id": "01a00e41-0591-766d-a4cb-b935701413db",
  "machine_id": "xxxx-xxxx-xxxx-xxxx",
  "email": "example@outlook.com",
  "name": "User Name",
  "expires_at": 1234567890
}
```

**注意**: 如果你的 session 文件格式不同，可能需要修改脚本中的 `parseSessionFile` 函数。

---

## 方法 2: 手动提供访问令牌

如果你已经有每个账号的访问令牌（不需要 session 文件）：

### 步骤：

1. **编辑脚本**

   打开 `scripts/import-qoder-accounts.js`，填写 `accountsWithTokens` 数组：

   ```javascript
   const accountsWithTokens = [
     {
       email: "qedyqungirq@outlook.com",
       displayName: "Iriana Aryani",
       accessToken: "dt-xxxxxxxxxxxx",  // Qoder 设备令牌
       userId: "01a00e41-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
       machineId: "optional-machine-id",  // 可选
     },
     {
       email: "uaovfmsjxg@outlook.com",
       displayName: "Rafi Najmudin",
       accessToken: "dt-xxxxxxxxxxxx",
       userId: "01a00e42-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
     },
     // ... 添加更多账号
   ];
   ```

2. **设置环境变量**
   ```bash
   export DASHBOARD_PASSWORD="你的Dashboard密码"
   ```

3. **运行脚本**
   ```bash
   node scripts/import-qoder-accounts.js
   ```

---

## 方法 3: 通过 Dashboard UI 手动导入（最安全）

如果你不想使用脚本，或者需要更多控制：

### 步骤：

1. **访问 Dashboard**
   ```
   http://localhost:20127/dashboard
   ```

2. **进入 Providers 页面**

3. **对每个账号执行**：
   - 点击 "Connect Qoder"
   - 选择 OAuth 或 API Key 方式
   - 如果是 OAuth：
     - 获取设备码
     - 在浏览器中访问验证 URL
     - 输入设备码并授权
   - 如果是 API Key：
     - 输入 Personal Access Token (pt-...)

---

## ❓ 常见问题

### Q: 我只有邮箱和密码，没有访问令牌怎么办？

**A**: Qoder 使用 OAuth 设备流程，不支持直接用密码登录。你需要：

1. 通过 Dashboard UI 手动完成 OAuth 流程获取令牌
2. 或者使用 Qoder 官方 CLI 工具登录并导出令牌
3. 或者如果你有有效的 session 文件，使用方法 1

### Q: Session 文件格式不匹配怎么办？

**A**: 编辑 `scripts/import-qoder-from-sessions.js` 中的 `parseSessionFile` 函数，根据你的实际 session 文件格式调整字段映射。

### Q: 导入后显示 "unknown" 状态？

**A**: 这是正常的。导入后 9Router 会在第一次使用时验证连接。你可以在 Dashboard 的 Providers 页面手动测试每个连接。

### Q: 某些账号导入失败？

**A**: 可能的原因：
- 访问令牌已过期（Qoder token 通常 30 天有效期）
- Session 文件格式不正确
- 网络连接问题
- 账号已被禁用

查看脚本输出的错误信息以确定具体原因。

### Q: 如何批量测试导入的连接？

**A**: 在 Dashboard 的 Providers 页面：
1. 选择所有 Qoder 连接
2. 点击 "Test" 批量测试
3. 或使用 API: `POST /api/providers/test-batch`

---

## 🔧 高级选项

### 自定义 API 端点

```bash
export API_BASE="http://your-custom-host:port/api"
node scripts/import-qoder-from-sessions.js
```

### 自定义 Session 目录

```bash
export SESSIONS_DIR="/path/to/your/sessions"
node scripts/import-qoder-from-sessions.js
```

### 设置优先级和默认模型

编辑脚本中的 `createQoderConnection` 函数，修改 payload：

```javascript
const payload = {
  // ...
  priority: 5,  // 1-10, 数字越大优先级越高
  defaultModel: "qoder/ultimate",  // 默认使用的模型
  globalPriority: 1,  // 全局优先级
};
```

---

## 📊 验证导入结果

### 通过 Dashboard

访问 http://localhost:20127/dashboard/providers 查看所有连接

### 通过 API

```bash
curl http://localhost:20127/api/providers | jq '.connections[] | select(.provider == "qoder")'
```

### 测试连接

```bash
# 获取第一个 Qoder 连接的 ID
CONNECTION_ID=$(curl -s http://localhost:20127/api/providers | jq -r '.connections[] | select(.provider == "qoder") | .id' | head -1)

# 测试连接
curl -X POST "http://localhost:20127/api/providers/${CONNECTION_ID}/test"
```

---

## 🛡️ 安全提示

1. **不要提交 session 文件到 Git**
   - `qoder-sessions/` 目录已在 `.gitignore` 中
   
2. **使用环境变量存储密码**
   - 不要硬编码密码在脚本中

3. **导入后删除 session 文件**
   ```bash
   rm -rf qoder-sessions/
   ```

4. **定期更新访问令牌**
   - Qoder token 通常 30 天过期
   - 在 Dashboard 中及时更新过期的连接

---

## 📞 需要帮助？

如果遇到问题：

1. 检查 9Router 日志: `npm run dev` 的控制台输出
2. 查看 Dashboard 的 Network 标签页（浏览器开发者工具）
3. 检查脚本的详细错误信息
4. 确认 Qoder API 是否可访问: `curl https://api3.qoder.sh`

---

## 示例：完整导入流程

```bash
# 1. 启动 9Router
npm run dev

# 2. 准备 session 文件
mkdir -p qoder-sessions
cp /path/to/sessions/*.json qoder-sessions/

# 3. 设置密码
export DASHBOARD_PASSWORD="your_password"

# 4. 导入
node scripts/import-qoder-from-sessions.js

# 5. 验证
curl http://localhost:20127/api/providers | grep qoder

# 6. 清理
rm -rf qoder-sessions/
unset DASHBOARD_PASSWORD
```

---

## 📝 注意事项

- **所有账号状态显示为 `registered_unbound`** 意味着这些账号已注册但可能未绑定到有效的 Qoder 付费订阅
- **Session 文件必须包含有效的访问令牌** - 仅有邮箱密码是不够的
- **导入不会验证令牌有效性** - 第一次使用时才会验证
- **建议小批量测试** - 先导入 2-3 个账号测试成功后再批量导入

祝你导入顺利！ 🎉
