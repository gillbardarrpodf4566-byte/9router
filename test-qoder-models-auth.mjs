// 测试 Qoder 模型（带认证）
const API = "http://localhost:20127/v1/chat/completions";
const AUTH_API = "http://localhost:20127/api/auth/login";
const PASSWORD = process.env.DASHBOARD_PASSWORD || "change-me";

const models = [
  "qd/auto", "qd/ultimate", "qd/performance", "qd/efficient", "qd/lite",
  "qd/qmodel_preview", "qd/qmodel_latest", "qd/qmodel", "qd/qmodel_38max",
  "qd/kmodel_latest", "qd/kmodel", "qd/gm51model",
  "qd/dmodel", "qd/dfmodel", "qd/mmodel", "qoder-free",
];

async function login() {
  const res = await fetch(AUTH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const cookies = res.headers.get("set-cookie");
  if (!cookies) throw new Error("Login failed");
  return cookies.split(";")[0]; // Extract auth_token
}

async function testModel(model, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), 45000);
  const started = Date.now();
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookie,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        stream: false,
        max_tokens: 20,
      }),
      signal: ctrl.signal,
    });
    const ms = Date.now() - started;
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 160).replace(/\s+/g, " ");
      try { 
        const j = JSON.parse(text);
        msg = j.error?.message || j.error?.type || msg; 
      } catch {}
      return { model, ok: false, ms, info: `${res.status}: ${msg}` };
    }
    let reply = "";
    try {
      const j = JSON.parse(text);
      reply = j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 120);
    } catch {
      reply = text.slice(0, 120);
    }
    return { model, ok: true, ms, info: String(reply).slice(0, 80).replace(/\s+/g, " ") };
  } catch (e) {
    return { model, ok: false, ms: Date.now() - started, info: e.message === "timeout" ? "timeout 45s" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  console.log("🔐 登录中...");
  const cookie = await login();
  console.log("✅ 登录成功\n");
  
  console.log("🧪 测试 Qoder 模型...\n");
  const results = [];
  
  for (const m of models) {
    const r = await testModel(m, cookie);
    results.push(r);
    const icon = r.ok ? "✅" : "❌";
    const time = String(r.ms).padStart(6);
    console.log(`${icon} ${m.padEnd(20)} ${time}ms  ${r.info}`);
  }
  
  console.log("\n" + "=".repeat(70));
  const okCount = results.filter(r => r.ok).length;
  console.log(`\n📊 结果: ${okCount}/${results.length} 个模型可用\n`);
  
  if (okCount > 0) {
    console.log("✅ 可用的模型:");
    results.filter(r => r.ok).forEach(r => console.log(`   - ${r.model}`));
  }
  
  if (okCount < results.length) {
    console.log("\n❌ 不可用的模型:");
    results.filter(r => !r.ok).forEach(r => console.log(`   - ${r.model}: ${r.info}`));
  }
})();
