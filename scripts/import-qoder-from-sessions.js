#!/usr/bin/env node
/**
 * 从 Qoder session 文件批量导入账号到 9Router
 * 
 * 使用方法：
 * 1. 将你的 session 文件放到 ./qoder-sessions/ 目录下
 * 2. 设置环境变量: export DASHBOARD_PASSWORD="你的密码"
 * 3. 运行: node scripts/import-qoder-from-sessions.js
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE || "http://localhost:20127/api";
const SESSIONS_DIR = process.env.SESSIONS_DIR || "./qoder-sessions";

// 从你提供的账号列表
const accountsMetadata = [
  { email: "qedyqungirq@outlook.com", displayName: "Iriana Aryani", sessionFile: "sessions\\qedyqungirq@outlook.com.json" },
  { email: "uaovfmsjxg@outlook.com", displayName: "Rafi Najmudin", sessionFile: "sessions\\uaovfmsjxg@outlook.com.json" },
  { email: "uenxfdroboko@outlook.com", displayName: "Wulan Samosir", sessionFile: "sessions\\uenxfdroboko@outlook.com.json" },
  { email: "uiidshlektjp@outlook.com", displayName: "Yani Widodo", sessionFile: "sessions\\uiidshlektjp@outlook.com.json" },
  { email: "uthscnyewo@outlook.com", displayName: "Gading Manullang", sessionFile: "sessions\\uthscnyewo@outlook.com.json" },
  { email: "vaahfeuqvfu@outlook.com", displayName: "Mariadi Mandala", sessionFile: "sessions\\vaahfeuqvfu@outlook.com.json" },
  { email: "vqnhcokhugsy@outlook.com", displayName: "Liman Utami", sessionFile: "sessions\\vqnhcokhugsy@outlook.com.json" },
  { email: "vswofbrcqesq@outlook.com", displayName: "Ganjaran Widiastuti", sessionFile: "sessions\\vswofbrcqesq@outlook.com.json" },
  { email: "vzdfxjnzwrsv@outlook.com", displayName: "Vivi Hariyah", sessionFile: "sessions\\vzdfxjnzwrsv@outlook.com.json" },
  { email: "winmilrqkya@outlook.com", displayName: "Vega Wibowo", sessionFile: "sessions\\winmilrqkya@outlook.com.json" },
  { email: "wkabzfckrptw@outlook.com", displayName: "Garang Wibowo", sessionFile: "sessions\\wkabzfckrptw@outlook.com.json" },
  { email: "wzzxhziwgxsy@outlook.com", displayName: "Parman Saputra", sessionFile: "sessions\\wzzxhziwgxsy@outlook.com.json" },
  { email: "xfctphgqpozi@outlook.com", displayName: "Silvia Widiastuti", sessionFile: "sessions\\xfctphgqpozi@outlook.com.json" },
  { email: "xhvxsczfcvd@outlook.com", displayName: "Kiandra Gunawan", sessionFile: "sessions\\xhvxsczfcvd@outlook.com.json" },
  { email: "xjrindxeidt@outlook.com", displayName: "Winda Mustofa", sessionFile: "sessions\\xjrindxeidt@outlook.com.json" },
  { email: "xoldmdzvrzht@outlook.com", displayName: "Wani Winarno", sessionFile: "sessions\\xoldmdzvrzht@outlook.com.json" },
  { email: "yxdecaorgimj@outlook.com", displayName: "Yosef Widiastuti", sessionFile: "sessions\\yxdecaorgimj@outlook.com.json" },
  { email: "zjdngkmyem@outlook.com", displayName: "Ikin Safitri", sessionFile: "sessions\\zjdngkmyem@outlook.com.json" },
  { email: "zjeoyqfxlkc@outlook.com", displayName: "Kamaria Pertiwi", sessionFile: "sessions\\zjeoyqfxlkc@outlook.com.json" },
  { email: "zohntlwhup@outlook.com", displayName: "Jarwa Manullang", sessionFile: "sessions\\zohntlwhup@outlook.com.json" },
  { email: "zriipgowwxqx@outlook.com", displayName: "Lasmanto Putra", sessionFile: "sessions\\zriipgowwxqx@outlook.com.json" },
  { email: "zvjknwipoznq@outlook.com", displayName: "Sabar Pradipta", sessionFile: "sessions\\zvjknwipoznq@outlook.com.json" },
  { email: "zvuxeqboicdw@outlook.com", displayName: "Jasmani Prakasa", sessionFile: "sessions\\zvuxeqboicdw@outlook.com.json" },
  { email: "zzpkytnwkhb@outlook.com", displayName: "Daruna Narpati", sessionFile: "sessions\\zzpkytnwkhb@outlook.com.json" },
];

function parseSessionFile(sessionPath) {
  try {
    const content = fs.readFileSync(sessionPath, 'utf8');
    const session = JSON.parse(content);
    
    // 尝试从 session 中提取令牌和用户信息
    // 根据 Qoder session 文件的实际格式调整
    const accessToken = session.access_token || session.accessToken || session.token;
    const refreshToken = session.refresh_token || session.refreshToken;
    const userId = session.user_id || session.userId;
    const machineId = session.machine_id || session.machineId || "";
    const email = session.email;
    const name = session.name || session.displayName;
    
    if (!accessToken) {
      throw new Error("Session 文件中未找到 access_token");
    }
    
    return {
      accessToken,
      refreshToken,
      userId,
      machineId,
      email,
      name,
    };
  } catch (error) {
    throw new Error(`解析 session 文件失败: ${error.message}`);
  }
}

async function loginToDashboard() {
  console.log("🔐 登录到 Dashboard...");
  
  const password = process.env.DASHBOARD_PASSWORD;
  
  if (!password) {
    console.error("❌ 请设置环境变量 DASHBOARD_PASSWORD");
    console.error("   例如: export DASHBOARD_PASSWORD='your_password'");
    process.exit(1);
  }

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`登录失败: ${response.status} - ${error}`);
  }

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("未获取到认证 cookie");
  }
  
  return setCookie;
}

async function createQoderConnection(account, sessionData, cookie) {
  console.log(`📝 导入账号: ${account.email} (${account.displayName})`);

  const payload = {
    provider: "qoder",
    authType: "oauth",
    accessToken: sessionData.accessToken,
    refreshToken: sessionData.refreshToken || null,
    email: sessionData.email || account.email,
    displayName: sessionData.name || account.displayName,
    name: sessionData.name || account.displayName,
    providerSpecificData: {
      authMethod: "device",
      userId: sessionData.userId || "",
      machineId: sessionData.machineId || "",
    },
    isActive: true,
    testStatus: "unknown",
    priority: 1,
  };

  const response = await fetch(`${API_BASE}/providers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookie,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  const result = await response.json();
  return result;
}

async function main() {
  console.log("🚀 开始批量导入 Qoder 账号\n");
  console.log(`📂 Session 目录: ${SESSIONS_DIR}\n`);

  // 检查 sessions 目录是否存在
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log(`⚠️  Session 目录不存在: ${SESSIONS_DIR}`);
    console.log("\n请执行以下步骤：");
    console.log(`1. 创建目录: mkdir -p ${SESSIONS_DIR}`);
    console.log(`2. 将你的 session 文件复制到该目录`);
    console.log("3. 重新运行此脚本\n");
    process.exit(1);
  }

  try {
    // 登录
    const cookie = await loginToDashboard();
    console.log("✅ 登录成功\n");

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const account of accountsMetadata) {
      const sessionFileName = path.basename(account.sessionFile);
      const sessionPath = path.join(SESSIONS_DIR, sessionFileName);

      // 检查 session 文件是否存在
      if (!fs.existsSync(sessionPath)) {
        console.log(`⏭️  跳过 ${account.email}: session 文件不存在`);
        skippedCount++;
        continue;
      }

      try {
        // 解析 session 文件
        const sessionData = parseSessionFile(sessionPath);
        
        // 创建连接
        await createQoderConnection(account, sessionData, cookie);
        console.log(`✅ ${account.email} 导入成功`);
        successCount++;
      } catch (error) {
        console.error(`❌ ${account.email} 导入失败: ${error.message}`);
        failCount++;
      }
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n📊 导入完成:`);
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ❌ 失败: ${failCount}`);
    console.log(`   ⏭️  跳过: ${skippedCount}`);

  } catch (error) {
    console.error("\n❌ 错误:", error.message);
    process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main().catch(error => {
    console.error("未捕获的错误:", error);
    process.exit(1);
  });
}
