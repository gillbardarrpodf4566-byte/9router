#!/usr/bin/env node
/**
 * Qoder 账号批量管理工具
 * 
 * 功能：
 * 1. 从 session 文件读取账号信息
 * 2. 检查账号额度和订阅状态
 * 3. 尝试激活 Pro Trial（如果支持）
 * 4. 批量导入到 9Router
 * 
 * 使用方法：
 * node scripts/qoder-batch-manager.js <command> [options]
 * 
 * Commands:
 *   check     - 检查所有账号的状态和额度
 *   activate  - 尝试激活 Pro Trial（需要具体的 API 端点）
 *   import    - 导入账号到 9Router
 *   all       - 执行所有步骤：检查 -> 激活 -> 导入
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE || "http://localhost:20127/api";
const SESSIONS_DIR = process.env.SESSIONS_DIR || "./qoder-sessions";
const QODER_OPENAPI_BASE = "https://openapi.qoder.sh";
const QODER_USERINFO_URL = `${QODER_OPENAPI_BASE}/api/v1/userinfo`;
const QODER_QUOTA_USAGE_URL = `${QODER_OPENAPI_BASE}/api/v2/quota/usage`;

// 从你提供的账号列表（只包含有 session 的）
const accountsMetadata = [
  { email: "qedyqungirq@outlook.com", displayName: "Iriana Aryani", sessionFile: "qedyqungirq@outlook.com.json" },
  { email: "uaovfmsjxg@outlook.com", displayName: "Rafi Najmudin", sessionFile: "uaovfmsjxg@outlook.com.json" },
  { email: "uenxfdroboko@outlook.com", displayName: "Wulan Samosir", sessionFile: "uenxfdroboko@outlook.com.json" },
  { email: "uiidshlektjp@outlook.com", displayName: "Yani Widodo", sessionFile: "uiidshlektjp@outlook.com.json" },
  { email: "uthscnyewo@outlook.com", displayName: "Gading Manullang", sessionFile: "uthscnyewo@outlook.com.json" },
  { email: "vaahfeuqvfu@outlook.com", displayName: "Mariadi Mandala", sessionFile: "vaahfeuqvfu@outlook.com.json" },
  { email: "vqnhcokhugsy@outlook.com", displayName: "Liman Utami", sessionFile: "vqnhcokhugsy@outlook.com.json" },
  { email: "vswofbrcqesq@outlook.com", displayName: "Ganjaran Widiastuti", sessionFile: "vswofbrcqesq@outlook.com.json" },
  { email: "vzdfxjnzwrsv@outlook.com", displayName: "Vivi Hariyah", sessionFile: "vzdfxjnzwrsv@outlook.com.json" },
  { email: "winmilrqkya@outlook.com", displayName: "Vega Wibowo", sessionFile: "winmilrqkya@outlook.com.json" },
  { email: "wkabzfckrptw@outlook.com", displayName: "Garang Wibowo", sessionFile: "wkabzfckrptw@outlook.com.json" },
  { email: "wzzxhziwgxsy@outlook.com", displayName: "Parman Saputra", sessionFile: "wzzxhziwgxsy@outlook.com.json" },
  { email: "xfctphgqpozi@outlook.com", displayName: "Silvia Widiastuti", sessionFile: "xfctphgqpozi@outlook.com.json" },
  { email: "xhvxsczfcvd@outlook.com", displayName: "Kiandra Gunawan", sessionFile: "xhvxsczfcvd@outlook.com.json" },
  { email: "xjrindxeidt@outlook.com", displayName: "Winda Mustofa", sessionFile: "xjrindxeidt@outlook.com.json" },
  { email: "xoldmdzvrzht@outlook.com", displayName: "Wani Winarno", sessionFile: "xoldmdzvrzht@outlook.com.json" },
  { email: "yxdecaorgimj@outlook.com", displayName: "Yosef Widiastuti", sessionFile: "yxdecaorgimj@outlook.com.json" },
  { email: "zjdngkmyem@outlook.com", displayName: "Ikin Safitri", sessionFile: "zjdngkmyem@outlook.com.json" },
  { email: "zjeoyqfxlkc@outlook.com", displayName: "Kamaria Pertiwi", sessionFile: "zjeoyqfxlkc@outlook.com.json" },
  { email: "zohntlwhup@outlook.com", displayName: "Jarwa Manullang", sessionFile: "zohntlwhup@outlook.com.json" },
  { email: "zriipgowwxqx@outlook.com", displayName: "Lasmanto Putra", sessionFile: "zriipgowwxqx@outlook.com.json" },
  { email: "zvjknwipoznq@outlook.com", displayName: "Sabar Pradipta", sessionFile: "zvjknwipoznq@outlook.com.json" },
  { email: "zvuxeqboicdw@outlook.com", displayName: "Jasmani Prakasa", sessionFile: "zvuxeqboicdw@outlook.com.json" },
  { email: "zzpkytnwkhb@outlook.com", displayName: "Daruna Narpati", sessionFile: "zzpkytnwkhb@outlook.com.json" },
];

function parseSessionFile(sessionPath) {
  try {
    const content = fs.readFileSync(sessionPath, 'utf8');
    const session = JSON.parse(content);
    
    // 尝试多种可能的字段名
    const accessToken = session.access_token || session.accessToken || session.token || session.dt;
    const refreshToken = session.refresh_token || session.refreshToken || session.rt;
    const userId = session.user_id || session.userId || session.id;
    const machineId = session.machine_id || session.machineId || session.mid || "";
    const email = session.email;
    const name = session.name || session.displayName || session.display_name;
    
    if (!accessToken) {
      throw new Error("未找到访问令牌（access_token）");
    }
    
    return {
      accessToken,
      refreshToken,
      userId,
      machineId,
      email,
      name,
      raw: session,
    };
  } catch (error) {
    throw new Error(`解析失败: ${error.message}`);
  }
}

async function checkAccountQuota(accessToken, email) {
  try {
    // 获取用户信息
    const userinfoRes = await fetch(QODER_USERINFO_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Go-http-client/2.0',
      },
    });
    
    const userinfo = userinfoRes.ok ? await userinfoRes.json() : {};
    
    // 获取额度信息
    const quotaRes = await fetch(QODER_QUOTA_USAGE_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Go-http-client/2.0',
      },
    });
    
    const quota = quotaRes.ok ? await quotaRes.json() : {};
    
    return {
      email: email || userinfo.email || 'unknown',
      name: userinfo.name || userinfo.username || '',
      userId: userinfo.user_id || userinfo.id || '',
      organizationId: userinfo.organization_id || '',
      subscription: userinfo.subscription || quota.subscription || 'unknown',
      quotaUsed: quota.used || 0,
      quotaTotal: quota.total || 0,
      quotaRemaining: quota.remaining || (quota.total - quota.used) || 0,
      hasTrial: quota.has_trial || false,
      trialExpires: quota.trial_expires_at || null,
      status: quotaRes.ok ? 'active' : 'inactive',
    };
  } catch (error) {
    return {
      email,
      error: error.message,
      status: 'error',
    };
  }
}

async function activateProTrial(accessToken, email) {
  console.log(`⚠️  Pro Trial 激活功能需要具体的 API 端点`);
  console.log(`   账号 ${email} 跳过激活步骤`);
  console.log(`   请访问 https://qoder.com 手动激活 Pro Trial\n`);
  
  // TODO: 如果你知道激活 API 端点，可以在这里实现
  // 例如：
  // const response = await fetch('https://openapi.qoder.sh/api/v1/trial/activate', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${accessToken}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({ plan: 'pro' }),
  // });
  
  return { success: false, message: 'API endpoint not implemented' };
}

async function loginToDashboard() {
  const password = process.env.DASHBOARD_PASSWORD;
  
  if (!password) {
    throw new Error("请设置环境变量 DASHBOARD_PASSWORD");
  }

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error(`登录失败: ${response.status}`);
  }

  return response.headers.get("set-cookie");
}

async function importToRouter(account, sessionData, cookie) {
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

  return await response.json();
}

// ===== Commands =====

async function commandCheck() {
  console.log("🔍 检查账号状态和额度\n");
  
  const results = [];
  
  for (const account of accountsMetadata) {
    const sessionPath = path.join(SESSIONS_DIR, account.sessionFile);
    
    if (!fs.existsSync(sessionPath)) {
      console.log(`⏭️  ${account.email}: session 文件不存在`);
      continue;
    }
    
    try {
      const sessionData = parseSessionFile(sessionPath);
      const quota = await checkAccountQuota(sessionData.accessToken, account.email);
      
      results.push({ account, quota });
      
      console.log(`✅ ${account.email}`);
      console.log(`   订阅: ${quota.subscription || 'unknown'}`);
      console.log(`   额度: ${quota.quotaRemaining}/${quota.quotaTotal} 剩余`);
      console.log(`   状态: ${quota.status}`);
      if (quota.hasTrial) {
        console.log(`   试用: 已激活 (到期: ${quota.trialExpires || 'unknown'})`);
      }
      console.log('');
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ ${account.email}: ${error.message}\n`);
    }
  }
  
  // 汇总
  console.log("📊 汇总:");
  const active = results.filter(r => r.quota.status === 'active').length;
  const withQuota = results.filter(r => r.quota.quotaRemaining > 0).length;
  const withTrial = results.filter(r => r.quota.hasTrial).length;
  
  console.log(`   总计: ${results.length}`);
  console.log(`   活跃: ${active}`);
  console.log(`   有额度: ${withQuota}`);
  console.log(`   已激活试用: ${withTrial}`);
  
  return results;
}

async function commandActivate() {
  console.log("🎁 激活 Pro Trial\n");
  console.log("⚠️  注意: 此功能需要 Qoder API 的具体激活端点");
  console.log("   如果你知道 API 端点，请修改脚本中的 activateProTrial 函数\n");
  
  for (const account of accountsMetadata) {
    const sessionPath = path.join(SESSIONS_DIR, account.sessionFile);
    
    if (!fs.existsSync(sessionPath)) continue;
    
    try {
      const sessionData = parseSessionFile(sessionPath);
      await activateProTrial(sessionData.accessToken, account.email);
    } catch (error) {
      console.error(`❌ ${account.email}: ${error.message}`);
    }
  }
}

async function commandImport() {
  console.log("📥 导入账号到 9Router\n");
  
  const cookie = await loginToDashboard();
  console.log("✅ Dashboard 登录成功\n");
  
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  
  for (const account of accountsMetadata) {
    const sessionPath = path.join(SESSIONS_DIR, account.sessionFile);
    
    if (!fs.existsSync(sessionPath)) {
      console.log(`⏭️  ${account.email}: session 文件不存在`);
      skippedCount++;
      continue;
    }
    
    try {
      const sessionData = parseSessionFile(sessionPath);
      await importToRouter(account, sessionData, cookie);
      console.log(`✅ ${account.email} 导入成功`);
      successCount++;
    } catch (error) {
      console.error(`❌ ${account.email}: ${error.message}`);
      failCount++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📊 导入结果:`);
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failCount}`);
  console.log(`   ⏭️  跳过: ${skippedCount}`);
}

async function commandAll() {
  console.log("🚀 执行完整流程: 检查 -> 激活 -> 导入\n");
  
  await commandCheck();
  console.log("\n" + "=".repeat(60) + "\n");
  
  await commandActivate();
  console.log("\n" + "=".repeat(60) + "\n");
  
  await commandImport();
}

// ===== Main =====

async function main() {
  const command = process.argv[2];
  
  if (!command || !['check', 'activate', 'import', 'all'].includes(command)) {
    console.log("Qoder 账号批量管理工具");
    console.log("\n用法:");
    console.log("  node scripts/qoder-batch-manager.js <command>\n");
    console.log("命令:");
    console.log("  check     - 检查所有账号的状态和额度");
    console.log("  activate  - 尝试激活 Pro Trial");
    console.log("  import    - 导入账号到 9Router");
    console.log("  all       - 执行所有步骤\n");
    console.log("环境变量:");
    console.log("  DASHBOARD_PASSWORD  - 9Router Dashboard 密码（import 命令需要）");
    console.log("  SESSIONS_DIR        - Session 文件目录 (默认: ./qoder-sessions)\n");
    process.exit(1);
  }
  
  // 检查 sessions 目录
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error(`❌ Session 目录不存在: ${SESSIONS_DIR}`);
    console.error(`   请创建目录并放入 session 文件: mkdir -p ${SESSIONS_DIR}`);
    process.exit(1);
  }
  
  try {
    switch (command) {
      case 'check':
        await commandCheck();
        break;
      case 'activate':
        await commandActivate();
        break;
      case 'import':
        await commandImport();
        break;
      case 'all':
        await commandAll();
        break;
    }
  } catch (error) {
    console.error("\n❌ 错误:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("未捕获的错误:", error);
    process.exit(1);
  });
}
