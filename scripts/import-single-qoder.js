#!/usr/bin/env node
/**
 * Import a single Qoder account via device token (dt-...)
 * Usage: DASHBOARD_PASSWORD=your-password node scripts/import-single-qoder.js
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:20127";
const PASSWORD = process.env.DASHBOARD_PASSWORD;

if (!PASSWORD) {
  console.error("❌ Error: DASHBOARD_PASSWORD environment variable required");
  console.error("Usage: DASHBOARD_PASSWORD=your-password node scripts/import-single-qoder.js");
  process.exit(1);
}

// Account data from user
const accountData = {
  email: "uenxfdroboko@outlook.com",
  _name: "Wulan Samosir",
  _uid: "01a012af-4f57-7682-822c-75f1e81e1a3e",
  added_at: 1788313132287,
  expire_date: "2026-10-02",
  machine_code: "660d2717148b5aea27",
  machine_id: "b1aab6a2-b198-4115-a485-fa52f7df9ce0",
  machine_token: "P1gAMS7Ljcw-pBM2Tolj4rbdNdIRWSc0K3iV6gzKB_SONHKPb94ncaR1g0tdbdk4znDCholxOdp-AaqOw1atY5P1",
  machine_type: "24cde55b1415db8892",
  user_info_json: '{"id":"01a012af-4f57-7682-822c-75f1e81e1a3e","name":"Wulan Samosir","token":"dt-BdcN35eMfnnrUmoU3Pv2fAs3","refreshToken":"drt-LZ8oYOnUozYpBi3fZqu0ua82","expireTime":"1790905044000","refreshTokenExpireTime":"1819417044000","email":"uenxfdroboko@outlook.com","avatarUrl":"https://qoder.com/users/01a012af-4f57-7682-822c-75f1e81e1a3e/default/avatars","status":2,"whitelist":3,"userType":"personal_professional_trial","privacyPolicyAgreed":true,"isPrivacyPolicyModifiable":false,"isQuotaExceeded":false,"userTag":"Pro Trial","isSubAccount":false,"quota":0}',
  user_type: "personal_professional_trial"
};

async function login() {
  const response = await fetch(`${DASHBOARD_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD })
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }

  const cookies = response.headers.get("set-cookie");
  if (!cookies) {
    throw new Error("No authentication cookie received");
  }

  return cookies.split(";")[0]; // Extract first cookie
}

async function importAccount(cookie) {
  let userInfo;
  try {
    userInfo = JSON.parse(accountData.user_info_json);
  } catch (err) {
    throw new Error(`Invalid user_info_json: ${err.message}`);
  }

  const accessToken = userInfo.token; // dt-...
  const refreshToken = userInfo.refreshToken; // drt-...
  const userId = userInfo.id;
  const displayName = userInfo.name;
  const email = userInfo.email;
  const expireTime = parseInt(userInfo.expireTime, 10);
  const machineId = accountData.machine_id;

  if (!accessToken || !accessToken.startsWith("dt-")) {
    throw new Error("Invalid device token (must start with dt-)");
  }

  // Calculate expires_in (seconds from now)
  const nowMs = Date.now();
  const expiresInSeconds = Math.max(0, Math.floor((expireTime - nowMs) / 1000));

  console.log(`\n📦 Importing account: ${displayName} (${email})`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Token: ${accessToken.slice(0, 10)}...`);
  console.log(`   Machine ID: ${machineId}`);
  console.log(`   Expires: ${new Date(expireTime).toISOString()} (in ${Math.floor(expiresInSeconds / 86400)} days)`);
  console.log(`   User Type: ${accountData.user_type}`);

  if (expiresInSeconds < 86400) {
    console.warn(`⚠️  Warning: Token expires in less than 1 day!`);
  }

  // Prepare OAuth-style payload (mimicking device flow completion)
  const payload = {
    provider: "qoder",
    authType: "oauth",
    connectionName: displayName || email.split("@")[0],
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresInSeconds,
      _qoderUserId: userId,
      _qoderMachineId: machineId,
      _qoderName: displayName,
      _qoderEmail: email,
      _qoderOrganizationId: userInfo.organizationId || ""
    }
  };

  const response = await fetch(`${DASHBOARD_URL}/api/providers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Import failed: ${response.status} - ${JSON.stringify(result)}`);
  }

  return result;
}

async function testConnection(cookie, connectionId) {
  console.log(`\n🧪 Testing connection...`);
  
  const response = await fetch(`${DASHBOARD_URL}/api/providers/${connectionId}/test`, {
    method: "POST",
    headers: { Cookie: cookie }
  });

  const result = await response.json();
  
  if (result.valid) {
    console.log(`✅ Connection test passed`);
  } else {
    console.log(`❌ Connection test failed: ${result.error || "unknown error"}`);
  }

  return result;
}

async function main() {
  try {
    console.log("🔐 Logging in to 9Router Dashboard...");
    const cookie = await login();
    console.log("✅ Login successful");

    const result = await importAccount(cookie);
    console.log(`\n✅ Account imported successfully!`);
    console.log(`   Connection ID: ${result.id}`);
    console.log(`   Name: ${result.name}`);
    console.log(`   Status: ${result.testStatus || "unknown"}`);

    // Test the connection
    await testConnection(cookie, result.id);

    console.log(`\n🎉 Done! Account "${result.name}" is ready to use.`);
    console.log(`\n📊 View in Dashboard: ${DASHBOARD_URL}/dashboard/providers`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
