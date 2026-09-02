# Qoder 账号导入和 Pro Trial 激活指南

本指南说明如何批量管理 Qoder 账号，包括检查状态、激活 Pro Trial 和导入到 9Router。

---

## 📋 前提条件

1. **9Router 正在运行**
   ```bash
   npm run dev
   ```

2. **有 Qoder 账号的 session 文件**
   - Session 文件包含访问令牌（access_token）
   - 格式为 JSON

3. **环境变量设置**
   ```bash
   export DASHBOARD_PASSWORD="你的9Router密码"  # 导入时需要
   export SESSIONS_DIR="./qoder-sessions"       # 可选，默认值
   ```

---

## 🚀 快速开始

### 1. 准备 Session 文件

```bash
# 创建目录
mkdir -p qoder-sessions

# 复制 session 文件到目录
cp /path/to/sessions/*.json qoder-sessions/
```

### 2. 检查账号状态

```bash
node scripts/qoder-batch-manager.js check
```

这会显示：
- ✅ 每个账号的订阅状态
- 💰 剩余额度
- 🎁 是否已激活 Pro Trial
- 📊 汇总统计

### 3. 激活 Pro Trial

⚠️ **重要**: Qoder Pro Trial 激活通常需要：
- 在 Qoder 官网手动激活
- 或使用特定的激活 API（需要你提供端点）

```bash
# 当前脚本会提示手动激活
node scripts/qoder-batch-manager.js activate
```

**手动激活步骤**：
1. 访问 https://qoder.com
2. 用每个账号登录
3. 在账户设置中激活 Pro Trial
4. 重新运行 `check` 命令验证

### 4. 导入到 9Router

```bash
# 设置密码
export DASHBOARD_PASSWORD="your_password"

# 导入
node scripts/qoder-batch-manager.js import
```

### 5. 一键执行所有步骤

```bash
node scripts/qoder-batch-manager.js all
```

会依次执行：检查 → 激活 → 导入

---

## 📝 Session 文件格式

脚本支持多种 session 文件格式。至少需要包含访问令牌：

### 格式 1: 标准格式
```json
{
  "access_token": "dt-xxxxxxxxxxxxxxxx",
  "refresh_token": "rt-xxxxxxxxxxxxxxxx",
  "user_id": "01a00e41-xxxx-xxxx",
  "machine_id": "xxxx-xxxx-xxxx",
  "email": "example@outlook.com",
  "name": "User Name"
}
```

### 格式 2: 简化格式
```json
{
  "token": "dt-xxxxxxxxxxxxxxxx",
  "userId": "01a00e41-xxxx-xxxx",
  "email": "example@outlook.com"
}
```

### 格式 3: 缩写格式
```json
{
  "dt": "dt-xxxxxxxxxxxxxxxx",
  "rt": "rt-xxxxxxxxxxxxxxxx",
  "id": "01a00e41-xxxx-xxxx",
  "email": "example@outlook.com"
}
```

脚本会自动识别这些字段名的变体。

---

## 🎁 关于 Pro Trial

### Qoder Pro Trial 说明

- **时长**: 通常 7-14 天
- **额度**: 根据 Qoder 政策而定
- **激活**: 需要在官网或通过 API 激活
- **限制**: 每个账号通常只能激活一次

### 检查 Pro Trial 状态

```bash
node scripts/qoder-batch-manager.js check
```

输出示例：
```
✅ example@outlook.com
   订阅: free
   额度: 0/0 剩余
   状态: active
   试用: 未激活

✅ another@outlook.com
   订阅: pro_trial
   额度: 5000/10000 剩余
   状态: active
   试用: 已激活 (到期: 2026-09-01T00:00:00Z)
```

### 如何激活 Pro Trial

#### 方法 1: 手动激活（最可靠）

1. 访问 https://qoder.com
2. 登录账号
3. 进入 Settings / Account
4. 点击 "Activate Pro Trial" 或类似按钮
5. 完成激活流程

#### 方法 2: 自动化激活（需要 API）

如果你知道 Qoder 的激活 API 端点，可以修改脚本：

编辑 `scripts/qoder-batch-manager.js` 中的 `activateProTrial` 函数：

```javascript
async function activateProTrial(accessToken, email) {
  try {
    const response = await fetch('https://openapi.qoder.sh/api/v1/trial/activate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Go-http-client/2.0',
      },
      body: JSON.stringify({
        plan: 'pro',
        // 其他必需参数
      }),
    });
    
    if (!response.ok) {
      throw new Error(`激活失败: ${response.status}`);
    }
    
    console.log(`✅ ${email} Pro Trial 激活成功`);
    return { success: true };
  } catch (error) {
    console.error(`❌ ${email} 激活失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}
```

#### 方法 3: 使用 Puppeteer 自动化（最灵活）

如果没有 API 但想自动化，可以用浏览器自动化：

```bash
npm install puppeteer
```

然后创建自动化脚本访问网页并点击激活按钮。

---

## 🔍 故障排除

### Q: Session 文件解析失败

**A**: 检查 JSON 格式是否正确：
```bash
# 验证 JSON 格式
cat qoder-sessions/example@outlook.com.json | jq .
```

如果格式特殊，修改 `parseSessionFile` 函数的字段映射。

### Q: 账号显示 "registered_unbound"

**A**: 这表示账号已注册但未绑定订阅。需要：
1. 检查账号是否有效
2. 激活 Pro Trial
3. 或购买付费订阅

### Q: 额度为 0

**A**: 原因可能是：
1. 未激活 Pro Trial
2. Trial 已过期
3. 免费额度已用完

解决方法：
```bash
# 检查详细状态
node scripts/qoder-batch-manager.js check

# 手动激活 Pro Trial（访问官网）
```

### Q: Token 已过期

**A**: Qoder token 通常 30 天有效期。需要：
1. 重新登录获取新 token
2. 更新 session 文件
3. 重新导入

### Q: 导入后显示 "unknown" 状态

**A**: 这是正常的。9Router 会在第一次使用时验证连接。在 Dashboard 中手动测试：
1. 访问 http://localhost:20127/dashboard/providers
2. 找到 Qoder 连接
3. 点击 "Test" 按钮

---

## 📊 批量操作示例

### 示例 1: 检查并导出有额度的账号

```bash
# 检查所有账号
node scripts/qoder-batch-manager.js check > check-results.txt

# 筛选有额度的账号
grep "额度:" check-results.txt | grep -v "0/0"
```

### 示例 2: 只导入有 Pro Trial 的账号

修改脚本，在 `commandImport` 函数中添加过滤：

```javascript
// 先检查账号状态
const sessionData = parseSessionFile(sessionPath);
const quota = await checkAccountQuota(sessionData.accessToken, account.email);

// 只导入有试用或有额度的账号
if (quota.hasTrial || quota.quotaRemaining > 0) {
  await importToRouter(account, sessionData, cookie);
  console.log(`✅ ${account.email} 导入成功`);
} else {
  console.log(`⏭️  ${account.email}: 无额度，跳过`);
}
```

### 示例 3: 导出账号列表到 CSV

```bash
# 添加到脚本末尾
node scripts/qoder-batch-manager.js check | \
  grep -E "^✅|订阅:|额度:" | \
  paste - - - | \
  sed 's/✅ //; s/   订阅: /,/; s/   额度: /,/' > accounts.csv
```

---

## 🛡️ 安全建议

1. **保护 Session 文件**
   - 包含敏感的访问令牌
   - 不要提交到 Git（已在 .gitignore 中）
   - 使用完后删除

2. **定期更新 Token**
   - Qoder token 约 30 天有效期
   - 设置提醒及时更新

3. **环境变量**
   - 不要硬编码密码
   - 使用 `.env` 文件或临时环境变量

4. **清理**
   ```bash
   # 导入完成后清理
   rm -rf qoder-sessions/
   unset DASHBOARD_PASSWORD
   ```

---

## 🤔 常见问题

### Q: 我只有邮箱密码，怎么获取 session？

**A**: Qoder 使用 OAuth，不能用密码直接登录。你需要：
1. 通过浏览器登录 Qoder
2. 使用浏览器开发者工具导出 session/token
3. 或使用 Puppeteer 自动化登录并提取 token

### Q: 24 个账号都需要手动激活 Pro Trial 吗？

**A**: 如果没有 API：
- 是的，需要手动激活
- 或使用浏览器自动化工具（Puppeteer）
- 每个账号约 1-2 分钟

如果有 API 端点，可以批量激活。

### Q: Session 文件格式不对怎么办？

**A**: 发一个示例 session 文件给我，我可以帮你调整解析逻辑。或者自己修改 `parseSessionFile` 函数。

### Q: 激活失败怎么办？

**A**: 可能的原因：
- 账号已激活过 Pro Trial（每个账号通常只能激活一次）
- 账号未通过验证（需要邮箱验证等）
- 地区限制
- Qoder 政策变更

---

## 📞 获取帮助

如果遇到问题：

1. **查看详细日志**
   ```bash
   node scripts/qoder-batch-manager.js check 2>&1 | tee log.txt
   ```

2. **测试单个账号**
   - 先用一个账号测试
   - 确认流程正常后再批量处理

3. **检查 Qoder API**
   ```bash
   # 测试 API 可访问性
   curl https://openapi.qoder.sh/api/v1/userinfo \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **提供错误信息**
   - Session 文件格式（脱敏后）
   - 完整的错误消息
   - 执行的命令

---

## 📚 相关文档

- [Qoder 官网](https://qoder.com)
- [9Router Providers 文档](../README.md)
- [Session 导入脚本](./import-qoder-from-sessions.js)
- [批量管理脚本](./qoder-batch-manager.js)

---

## ✅ 完整工作流程

```bash
# 1. 准备环境
mkdir -p qoder-sessions
cp /path/to/sessions/*.json qoder-sessions/
export DASHBOARD_PASSWORD="your_password"

# 2. 检查账号状态
node scripts/qoder-batch-manager.js check

# 3. 激活 Pro Trial（手动或自动）
# 手动：访问 https://qoder.com 逐个激活
# 自动：修改脚本后运行
node scripts/qoder-batch-manager.js activate

# 4. 再次检查确认激活成功
node scripts/qoder-batch-manager.js check

# 5. 导入到 9Router
node scripts/qoder-batch-manager.js import

# 6. 验证导入结果
curl http://localhost:20127/api/providers | jq '.connections[] | select(.provider == "qoder")'

# 7. 清理
rm -rf qoder-sessions/
unset DASHBOARD_PASSWORD
```

---

祝你成功导入和激活！🎉

有任何问题随时告诉我！
