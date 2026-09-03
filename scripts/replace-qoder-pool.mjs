/**
 * 清空线上 Qoder 账号池并导入新批次（ezqs_pro_trial_pool.json）
 *
 * 用法: node tmp-import-pool.mjs [--dry-run]
 *   --dry-run  只列出当前 qoder 连接和转换结果，不删除不导入
 */
import fs from "node:fs/promises";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://165.154.147.155:20128";
const POOL_FILE = process.env.POOL_FILE || "C:/Users/LT/Desktop/ezqs_pro_trial_pool.json";
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;
const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK_SIZE = 25;
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) : null;
const offsetIdx = process.argv.indexOf("--offset");
const OFFSET = offsetIdx > -1 ? Number(process.argv[offsetIdx + 1]) : 0;
const NO_CLEAN = process.argv.includes("--no-clean");

let AUTH_COOKIE = "";

async function login() {
  const res = await fetch(`${DASHBOARD_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: DASHBOARD_PASSWORD }),
  });
  if (!res.ok) throw new Error(`登录失败 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.success) throw new Error(`登录失败: ${data.error || "unknown"}`);
  AUTH_COOKIE = res.headers.get("set-cookie") || "";
  if (!AUTH_COOKIE.includes("auth_token")) throw new Error("登录响应中没有 auth_token cookie");
}

function authHeaders(extra = {}) {
  return { Cookie: AUTH_COOKIE, ...extra };
}

async function listQoderConnections() {
  const res = await fetch(`${DASHBOARD_URL}/api/providers`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET /api/providers -> ${res.status}: ${await res.text()}`);
  const { connections } = await res.json();
  return (connections || []).filter((c) => c.provider === "qoder");
}

async function deleteConnection(id, email) {
  const res = await fetch(`${DASHBOARD_URL}/api/providers/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    console.error(`  ❌ 删除失败 ${email}: ${res.status} ${await res.text()}`);
    return false;
  }
  console.log(`  🗑️  已删除 ${email} (${id})`);
  return true;
}

function transformPoolAccounts(raw) {
  return raw.accounts.map((a) => {
    const u = JSON.parse(a.user_info_json);
    return {
      email: a.email,
      name: a._name || u.name || "Qoder User",
      accessToken: u.token,
      refreshToken: u.refreshToken,
      userId: u.id,
      machineId: a.machine_id,
      expireTime: u.expireTime,
      priority: 50,
    };
  });
}

async function importChunk(accounts, chunkIndex) {
  const res = await fetch(`${DASHBOARD_URL}/api/providers/import-qoder-oauth`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ accounts }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`  ❌ 批次 ${chunkIndex} 导入失败 ${res.status}: ${text.slice(0, 300)}`);
    return { success: 0, failed: accounts.length };
  }
  const data = JSON.parse(text);
  const failed = (data.results || []).filter((r) => !r.success);
  for (const f of failed) console.error(`  ❌ ${f.email}: ${f.error}`);
  return { success: data.summary.success, failed: data.summary.failed };
}

async function main() {
  if (!DASHBOARD_PASSWORD) {
    console.error("❌ 请设置环境变量 DASHBOARD_PASSWORD");
    process.exit(1);
  }
  console.log(`目标: ${DASHBOARD_URL}  dry-run: ${DRY_RUN}\n`);

  // 0. 登录
  console.log("🔐 登录 Dashboard...");
  await login();
  console.log("✅ 登录成功\n");

  // 1. 当前 qoder 连接
  const existing = await listQoderConnections();
  console.log(`📋 当前线上 qoder 连接: ${existing.length} 个`);
  for (const c of existing) {
    console.log(`   - ${c.name || "(unnamed)"} <${c.email || "-"}> [${c.id}] active=${c.isActive}`);
  }
  if (DRY_RUN) return;

  // 2. 清空
  if (existing.length && !NO_CLEAN) {
    console.log(`\n🗑️  清空现有 ${existing.length} 个 qoder 连接...`);
    for (const c of existing) await deleteConnection(c.id, c.email || c.name || c.id);
    const after = await listQoderConnections();
    if (after.length) throw new Error(`清空后仍有 ${after.length} 个 qoder 连接，中止导入`);
    console.log("✅ 已全部清空\n");
  } else {
    console.log("（池已是空的）\n");
  }

  // 3. 读取并转换池文件
  const raw = JSON.parse(await fs.readFile(POOL_FILE, "utf-8"));
  const all = transformPoolAccounts(raw);
  const accounts = all.slice(OFFSET, LIMIT !== null ? OFFSET + LIMIT : undefined);
  console.log(`📦 池文件共 ${all.length} 个账号，本次导入第 ${OFFSET + 1}~${OFFSET + accounts.length} 个（共 ${accounts.length}）\n`);
  if (accounts.some((a) => !a.accessToken || !a.refreshToken)) {
    throw new Error("存在缺少 token/refreshToken 的账号，中止");
  }
  console.log(`📦 池文件共 ${accounts.length} 个账号，开始分批导入（每批 ${CHUNK_SIZE}）...\n`);

  let totalOk = 0, totalFail = 0;
  for (let i = 0; i < accounts.length; i += CHUNK_SIZE) {
    const chunk = accounts.slice(i, i + CHUNK_SIZE);
    const idx = i / CHUNK_SIZE + 1;
    process.stdout.write(`📤 批次 ${idx} (${chunk.length} 个)... `);
    const r = await importChunk(chunk, idx);
    totalOk += r.success;
    totalFail += r.failed;
    console.log(`成功 ${r.success} / 失败 ${r.failed}`);
    await new Promise((s) => setTimeout(s, 300));
  }

  // 4. 校验
  const final = await listQoderConnections();
  console.log(`\n━━━ 结果 ━━━`);
  console.log(`导入成功 ${totalOk} / 失败 ${totalFail}`);
  console.log(`线上 qoder 连接现为: ${final.length} 个`);
  if (totalFail > 0 || final.length !== existing.length + accounts.length) {
    console.error("⚠️ 数量不一致，请检查上方失败详情");
    process.exit(1);
  }
  console.log("✅ 导入完成，数量校验通过");
}

main().catch((e) => {
  console.error("\n❌ 执行错误:", e.message);
  process.exit(1);
});
