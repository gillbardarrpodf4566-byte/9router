/**
 * 批量导入 Qoder 账号到 9Router
 * 
 * 使用方法：
 * 1. 确保 9Router 服务正在运行 (npm run dev)
 * 2. 修改下面的 accounts 数据
 * 3. 运行: node scripts/import-qoder-accounts.js
 */

const accounts = [
  {
    "email": "qedyqungirq@outlook.com",
    "password": "5@dXfEyJRpILxE9",
    "display_name": "Iriana Aryani",
    "user_id": null,
  },
  {
    "email": "uaovfmsjxg@outlook.com",
    "password": "pl8&d6ajbhKxO",
    "display_name": "Rafi Najmudin",
    "user_id": null,
  },
  // ... 可以添加更多账号
];

const API_BASE = "http://localhost:20127/api";

/**
 * 由于 Qoder 使用 OAuth 设备流程，我们不能直接用密码登录。
 * 这个脚本需要你先通过其他方式获取每个账号的访问令牌。
 * 
 * 如果你有这些账号的访问令牌（access token），请使用下面的格式：
 */
const accountsWithTokens = [
  // {
  //   email: "example@outlook.com",
  //   displayName: "Example User",
  //   accessToken: "dt-...",  // Qoder 设备令牌
  //   userId: "01a00e41-...",  // Qoder 用户 ID
  //   machineId: "...",        // 可选
  // }
];

async function loginToDashboard() {
  console.log("🔐 登录到 Dashboard...");
  
  // 这里需要你的 Dashboard 管理员密码
  const password = process.env.DASHBOARD_PASSWORD || "";
  
  if (!password) {
    console.error("❌ 请设置环境变量 DASHBOARD_PASSWORD");
    process.exit(1);
  }

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`登录失败: ${response.status}`);
  }

  // 提取 cookie
  const setCookie = response.headers.get("set-cookie");
  return setCookie;
}

async function createQoderConnection(account, cookie) {
  console.log(`📝 导入账号: ${account.email} (${account.displayName})`);

  const payload = {
    provider: "qoder",
    authType: "oauth",
    accessToken: account.accessToken,
    email: account.email,
    displayName: account.displayName,
    name: account.displayName,
    providerSpecificData: {
      authMethod: "device",
      userId: account.userId,
      machineId: account.machineId || "",
    },
    isActive: true,
    testStatus: "active",
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
    throw new Error(`创建连接失败: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result;
}

async function main() {
  console.log("🚀 开始批量导入 Qoder 账号\n");

  // 检查是否有带令牌的账号
  if (accountsWithTokens.length === 0) {
    console.log("⚠️  没有找到带访问令牌的账号数据。");
    console.log("\n要导入 Qoder 账号，你需要：");
    console.log("1. 每个账号的访问令牌（access token，格式：dt-...）");
    console.log("2. 用户 ID（user_id）");
    console.log("\n你可以通过以下方式获取：");
    console.log("- 方式 1: 在 Dashboard 中手动完成 OAuth 流程");
    console.log("- 方式 2: 如果你有 session 文件，从中提取令牌");
    console.log("- 方式 3: 使用 Qoder CLI 工具获取令牌\n");
    return;
  }

  try {
    // 登录
    const cookie = await loginToDashboard();
    console.log("✅ 登录成功\n");

    // 批量导入
    let successCount = 0;
    let failCount = 0;

    for (const account of accountsWithTokens) {
      try {
        await createQoderConnection(account, cookie);
        console.log(`✅ ${account.email} 导入成功`);
        successCount++;
      } catch (error) {
        console.error(`❌ ${account.email} 导入失败:`, error.message);
        failCount++;
      }
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n📊 导入完成: 成功 ${successCount}, 失败 ${failCount}`);

  } catch (error) {
    console.error("❌ 错误:", error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { createQoderConnection };
