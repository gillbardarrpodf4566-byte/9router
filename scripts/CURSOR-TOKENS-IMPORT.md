# Cursor IDE Token 批量导入指南

## 功能说明

这个脚本可以自动从本地 Cursor IDE 中提取访问令牌，并批量导入到 9Router Dashboard 中。

## 使用方法

### 方式一：自动检测（推荐）

1. **确保 Cursor IDE 已登录账号**
2. **运行脚本**：
   ```bash
   # Windows (PowerShell)
   $env:DASHBOARD_PASSWORD="你的密码"; node scripts/import-cursor-tokens.mjs

   # Linux/Mac
   DASHBOARD_PASSWORD=你的密码 node scripts/import-cursor-tokens.mjs
   ```

脚本会自动查找以下位置的 Cursor state.vscstate 文件：
- `C:\Users\<你>\AppData\Roaming\Cursor\User\globalStorage\state.vscstate`
- `~/Library/Application Support/Cursor/User/globalStorage/state.vscstate`
- `~/.config/Cursor/User/globalStorage/state.vscstate`

### 方式二：手动 JSON 文件

如果你无法自动检测到 token，可以手动提取并保存为 `cursor-tokens.json`：

```json
{
  "cursorAuth/accessToken": "gh_xxxxxxxx",
  "storage.serviceMachineId": "abc-def-ghi-jkl-mno",
  "githubName": "your-github-name"
}
```

然后运行脚本即可。

## 原理说明

Cursor IDE 的 OAuth token 存储在本地 SQLite 文件 `state.vscstate` 中，主要字段：

| 字段名 | 说明 | 示例 |
|--------|------|------|
| `cursorAuth/accessToken` | Bearer token | `gh_xxxxxxxx` |
| `storage.serviceMachineId` | 机器 ID | `abc-def-ghi-jkl-mno` |
| `githubName` | GitHub 用户名（可选） | `your-github-name` |

脚本会：
1. 读取 token 信息
2. 登录 9Router Dashboard
3. 创建 Cursor provider connection
4. 保存到数据库

## 注意事项

⚠️ **安全警告**：
- Token 只在脚本执行时临时使用
- 脚本不会上传 token 到任何远程服务器
- 建议执行完导入后立即关闭脚本

🔒 **Token 有效期**：
- Cursor token 通常长期有效（与浏览器 Cookie 类似）
- 不需要定期刷新
- 如果 Token 失效，重新登录 Cursor IDE 后再次运行脚本即可

## 验证导入成功

在 9Router Dashboard 中：
1. 打开 **Providers → Cursor** 页面
2. 应该能看到刚导入的连接
3. 点击 **Test Connection** 验证是否有效

## Troubleshooting

### 找不到 token

确保 Cursor IDE 已登录且网络正常。可以尝试：
```bash
# 查看本地文件是否存在
ls "%APPDATA%\Cursor\User\globalStorage\state.vscstate"
```

### 导入失败

检查：
1. DASHBOARD_PASSWORD 是否正确
2. 网络连接是否正常
3. Cursor 账号是否有权限

可以在 Browser DevTools Console 查看详细错误信息。

## 高级用法

### 导入多个账号

如果需要在同一台机器上管理多个 Cursor 账号，可以：

1. 备份每个账号的 `state.vscstate` 文件
2. 修改脚本中的路径或创建多个 JSON 文件
3. 每次运行不同的配置

### API Key 替代方案

如果不希望直接读取本地文件，也可以：

1. 在 Cursor IDE 中使用第三方集成（如 Codeium、GitHub Copilot）
2. 通过它们的 dashboard 获取 API key
3. 手动添加到 9Router

## 相关资源

- [Cursor 官方文档](https://docs.cursor.com/)
- [9Router Cursor Provider](../open-sse/providers/registry/cursor.js)
- [Qoder Token 导入脚本](./import-qoder-from-sessions.js)
