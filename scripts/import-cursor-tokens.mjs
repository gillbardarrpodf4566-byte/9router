/**
 * 批量导入 Cursor IDE 的访问令牌到 9Router
 * 
 * 使用说明:
 * 1. 在 Cursor IDE 中登录账号
 * 2. 找到本地存储的 state.vscstate 文件
 *    - Windows: %APPDATA%\Cursor\User\globalStorage\state.vscstate
 *    - macOS: ~/Library/Application Support/Cursor/User/globalStorage/state.vscstate
 *    - Linux: ~/.config/Cursor/User/globalStorage/state.vscstate
 * 3. 复制 JSON 文件内容到 cursor-tokens.json
 * 4. 运行：DASHBOARD_PASSWORD=你的密码 node scripts/import-cursor-tokens.mjs
 */

import fs from "fs/promises";
import Database from "better-sqlite3";
import crypto from "crypto";
import os from "os";

// 配置
const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:20128";
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

if (!DASHBOARD_PASSWORD) {
  console.error("❌ 请设置环境变量 DASHBOARD_PASSWORD");
  console.error("   例如：DASHBOARD_PASSWORD=your-password node import-cursor-tokens.mjs");
  process.exit(1);
}

// Cursor state.vscstate 格式示例：
/*
{
  "cursorAuth/accessToken": "gh_xxx",
  "storage.serviceMachineId": "xxx-xxx-xxx",
  ...
}
*/

async function loginToDashboard(password) {
  const res = await fetch(`${DASHBOARD_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`登录失败：${error}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || "登录失败");
  }

  return res.headers.get("set-cookie") || "";
}

async function getCursorTokensFromStateFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const state = JSON.parse(content);
    
    const accessToken = state["cursorAuth/accessToken"];
    const machineId = state["storage.serviceMachineId"];

    if (!accessToken) {
      console.warn("⚠️  未找到 cursorAuth/accessToken");
      return null;
    }

    console.log(`✅ 找到 Cursor token: ${accessToken.slice(0, 8)}...${accessToken.slice(-4)}`);
    console.log(`📱 机器 ID: ${machineId || "未知"}`);

    return {
      accessToken,
      machineId,
      email: state["githubName"] || state["email"] || "unknown",
    };
  } catch (e) {
    console.error(`❌ 读取 state.vscstate 失败：${e.message}`);
    return null;
  }
}

async function importConnectionTo9Router(tokenInfo, authCookie) {
  // 构造 Cursor provider connection 的数据
  const connectionData = {
    name: "Cursor IDE",
    email: tokenInfo.email,
    authType: "api_key",
    isActive: true,
    priority: 50,
    data: JSON.stringify({
      authType: "api_key",
      accessToken: tokenInfo.accessToken,
      displayName: "Cursor IDE",
      providerSpecificData: {
        authMethod: "cursor_ide",
        machineId: tokenInfo.machineId,
        clientVersion: "3.12.17",
      },
    }),
  };

  const res = await fetch(`${DASHBOARD_URL}/api/providers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify(connectionData),
  });

  if (res.ok) {
    console.log(`✅ Cursor IDE 连接已创建 (${tokenInfo.email})`);
    return true;
  } else {
    const error = await res.text();
    console.error(`❌ 创建失败：${error}`);
    return false;
  }
}

async function main() {
  console.log("━━━━━━━━━ Cursor Token 批量导入 ━━━━━━━━━\n");

  // 1. 尝试从默认位置读取
  const homeDir = os.homedir();
  const windowsPath = `${process.env.APPDATA}\\Cursor\\User\\globalStorage\\state.vscstate`;
  const macPath = `${homeDir}/Library/Application Support/Cursor/User/globalStorage/state.vscstate`;
  const linuxPath = `${homeDir}/.config/Cursor/User/globalStorage/state.vscstate`;

  const possiblePaths = [
    windowsPath,
    macPath,
    linuxPath,
    "./cursor-tokens.json", // 备用：手动 JSON 文件
  ];

  let tokenInfo = null;

  for (const path of possiblePaths) {
    try {
      await fs.access(path);
      console.log(`📂 尝试读取：${path}`);
      tokenInfo = await getCursorTokensFromStateFile(path);
      if (tokenInfo) break;
    } catch (e) {
      // 文件不存在，继续下一个
    }
  }

  if (!tokenInfo) {
    console.log("\n❌ 未找到任何有效的 Cursor token");
    console.log("\n👉 请通过以下方式之一获取 token:");
    console.log("   1. 使用状态文件：将 state.vscstate 中的 cursorAuth/accessToken 复制到 cursor-tokens.json");
    console.log("   2. 直接从 Cursor IDE 导出 API Key（如果有）");
    console.log("   3. 手动在 Dashboard → Providers → Cursor 页面添加");
    process.exit(1);
  }

  // 2. 登录 Dashboard
  console.log("\n🔐 登录 Dashboard...");
  let authCookie;
  try {
    authCookie = await loginToDashboard(DASHBOARD_PASSWORD);
    console.log("✅ 登录成功");
  } catch (e) {
    console.error(`❌ 登录失败：${e.message}`);
    process.exit(1);
  }

  // 3. 导入到 9Router
  console.log("\n📤 导入到 9Router...");
  const success = await importConnectionTo9Router(tokenInfo, authCookie);

  if (success) {
    console.log("\n✓✓✓ 导入完成！请在 Dashboard 中刷新并测试连接 ✓✓✓");
  } else {
    console.log("\n⚠️⚠️⚠️ 部分导入失败，请检查错误信息 ⚠️⚠️⚠️");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n❌ 执行错误:", e);
  process.exit(1);
});
