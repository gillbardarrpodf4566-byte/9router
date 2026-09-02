// 逐个测试 Qoder 模型是否可用
const API = "http://localhost:20127/v1/chat/completions";

const models = [
  "qd/auto", "qd/ultimate", "qd/performance", "qd/efficient", "qd/lite",
  "qd/qmodel_preview", "qd/qmodel_latest", "qd/qmodel", "qd/qmodel_38max",
  "qd/kmodel_latest", "qd/kmodel", "qd/gm51model",
  "qd/dmodel", "qd/dfmodel", "qd/mmodel", "qoder-free",
];

async function testModel(model) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), 45000);
  const started = Date.now();
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      try { msg = JSON.parse(text).error?.message || msg; } catch {}
      return { model, ok: false, ms, info: `HTTP ${res.status}: ${msg}` };
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
  const results = [];
  for (const m of models) {
    const r = await testModel(m);
    results.push(r);
    console.log(`${r.ok ? "✅" : "❌"} ${r.model.padEnd(20)} ${String(r.ms).padStart(6)}ms  ${r.info}`);
  }
  const okCount = results.filter(r => r.ok).length;
  console.log(`\n可用: ${okCount}/${results.length}`);
})();
