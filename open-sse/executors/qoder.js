/**
 * QoderExecutor — sends OpenAI-format chat requests to Qoder's COSY-signed
 * inference endpoint at api3.qoder.sh, then unwraps Qoder's `{statusCodeValue,
 * body}` SSE envelope back into plain OpenAI SSE for the rest of the pipeline.
 *
 * Differences vs the previous placeholder:
 *   - URL is api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation
 *     with `&Encode=1` so we can ship the body through the WAF-bypass
 *     encoder.
 *   - Authentication is COSY (RSA + AES + MD5 + ~17 Cosy-* headers), not
 *     a static HMAC.
 *   - The request shape Qoder expects is non-trivial (chat_context with
 *     mirrored modelConfig, business block with stable IDs, system text
 *     hoisted out of the messages array). All ported from the reference.
 *   - Model identifier is one of the canonical Qoder keys (auto / ultimate /
 *     performance / efficient / lite + frontier "*model" ids); the
 *     translator layer feeds us "qoder/<key>" so we strip the prefix.
 *   - Per-model `model_config` is fetched live from /algo/api/v2/model/list
 *     and cached. Sending the wrong block silently downgrades to a
 *     different model upstream, so a missing entry is a hard error.
 */

import { qoderEncodeBody } from "../shared/qoder/encoding.js";
import { buildCosyHeaders } from "../shared/qoder/cosy.js";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { SSE_DONE } from "../utils/sseConstants.js";
import { FETCH_CONNECT_TIMEOUT_MS, DEFAULT_RETRY_CONFIG, resolveRetryEntry } from "../config/runtimeConfig.js";
import {
  QODER_CHAT_URL_ENCODED,
  QODER_CHAT_BASE_ALT,
  QODER_CHAT_SIG_PATH,
  QODER_MODEL_MAP,
  QODER_GATEWAY_ERROR_STATUSES,
  QODER_GATEWAY_ERROR_PATTERNS,
} from "../shared/qoder/constants.js";
import { getQoderModelConfig, resolveQoderModels, isQoderPat, resolveQoderCredentials } from "../services/qoderModels.js";

/**
 * Hoist role:"system" messages out of the messages array (Qoder rejects
 * system in messages) and flatten any multipart content arrays.
 */
function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], systemText: "" };
  }
  const systemParts = [];
  const out = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const text = extractText(msg.content);
    if (msg.role === "system") {
      if (text) systemParts.push(text);
      continue;
    }
    const cloned = { ...msg };
    cloned.content = text;
    out.push(cloned);
  }
  return { messages: out, systemText: systemParts.join("\n\n") };
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (item && typeof item === "object") {
        if (item.type === "text" && typeof item.text === "string") {
          parts.push(item.text);
        } else if (typeof item.text === "string") {
          parts.push(item.text);
        }
      }
    }
    return parts.join("\n");
  }
  return String(content);
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      return m.content;
    }
  }
  return "";
}

function stableHash(prefix, ...parts) {
  const h = createHash("sha256");
  h.update(prefix);
  for (const p of parts) {
    h.update("\0");
    h.update(String(p ?? ""));
  }
  return h.digest("hex").slice(0, 16);
}

function stableChatRecordId(model, messages, tools, maxTokens) {
  const h = createHash("sha256");
  h.update("qoder-record\0");
  h.update(String(model));
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    if (m.role) { h.update("\0"); h.update(m.role); }
    if (typeof m.content === "string" && m.content) {
      h.update("\0"); h.update(m.content);
    }
  }
  if (tools) {
    h.update("\0");
    try { h.update(JSON.stringify(tools)); } catch {}
  }
  h.update(`\0mt=${maxTokens}`);
  return h.digest("hex").slice(0, 16);
}

function truncate(s, n) {
  return s && s.length > n ? `${s.slice(0, n)}...` : s || "";
}

/**
 * Map the OpenAI-style request body into the exact shape Qoder expects.
 */
async function buildQoderRequestBody({ model, body, credentials, log, proxyOptions, signal }) {
  const qoderKey = String(model || "").replace(/^qoder\//, "");
  
  // Fetch model config from dynamic API instead of relying on static QODER_MODEL_MAP.
  // This allows support for new Qoder models (e.g., qmodel_latest) without code changes.
  let modelConfig = await getQoderModelConfig(credentials, qoderKey, { log, proxyOptions, signal });
  if (!modelConfig) {
    // Try a forced refresh once before giving up — the cache may simply
    // not be populated yet on first ever call for this credential.
    const refreshed = await resolveQoderModels(credentials, { forceRefresh: true, log, proxyOptions, signal });
    const retried = refreshed?.rawConfigs.get(qoderKey);
    if (!retried) {
      throw new Error(
        `qoder: model_config for "${qoderKey}" not yet known (run a model list fetch or check upstream connectivity)`,
      );
    }
    modelConfig = { ...retried, key: qoderKey };
  }

  const { messages, systemText } = normalizeMessages(body.messages || []);
  const tools = body.tools;
  const isReasoning = !!modelConfig.is_reasoning;
  const maxOutputTokens = Number(modelConfig.max_output_tokens) || 0;

  let maxTokens = 32_768;
  if (maxOutputTokens > 0) maxTokens = maxOutputTokens;
  if (typeof body.max_tokens === "number" && body.max_tokens > 0 && body.max_tokens < maxTokens) {
    maxTokens = body.max_tokens;
  }
  if (typeof body.max_completion_tokens === "number" && body.max_completion_tokens > 0 && body.max_completion_tokens < maxTokens) {
    maxTokens = body.max_completion_tokens;
  }

  const lastUser = lastUserText(messages);
  const psd = credentials.providerSpecificData || {};
  const sessionId = stableHash("qoder-session", psd.userId, qoderKey);
  const recordId = stableChatRecordId(qoderKey, messages, tools, maxTokens);

  return {
    qoderKey,
    payload: {
      request_id: uuidv4(),
      request_set_id: recordId,
      chat_record_id: recordId,
      session_id: sessionId,
      stream: true,
      chat_task: "FREE_INPUT",
      is_reply: true,
      is_retry: false,
      source: 1,
      version: "3",
      session_type: "qodercli",
      agent_id: "agent_common",
      task_id: "common",
      code_language: "",
      chat_prompt: "",
      image_urls: null,
      aliyun_user_type: "",
      system: systemText,
      messages,
      tools: Array.isArray(tools) ? tools : [],
      parameters: { max_tokens: maxTokens },
      chat_context: {
        chatPrompt: "",
        imageUrls: null,
        extra: {
          context: [],
          modelConfig: { key: qoderKey, is_reasoning: isReasoning },
          originalContent: lastUser,
        },
        features: [],
        text: lastUser,
      },
      model_config: modelConfig,
      business: {
        product: "cli",
        version: "1.0.0",
        type: "agent",
        stage: "start",
        id: uuidv4(),
        name: truncate(lastUser, 30),
        begin_at: Date.now(),
      },
    },
    modelConfig,
  };
}

/**
 * Check if a qoder error message indicates a billing/quota block.
 * Signatures: code 112 (quota exhausted), code 10605 (queue throttle), pricingUrl field.
 */
function isBillingBlock(inner) {
  if (!inner || typeof inner !== "string") return false;
  const lowerMsg = inner.toLowerCase();
  // Match: {"code":"112",...}, {"code":"10605",...}, or pricingUrl field
  return /\"code\"\s*:\s*\"(112|10605)\"/.test(inner) || lowerMsg.includes("pricingurl");
}

/**
 * Check if a qoder envelope frame is a transient gateway/upstream failure.
 *
 * Qoder's edge wraps the real inference call, so an upstream timeout arrives as
 * an HTTP 200 SSE frame like:
 *   {statusCodeValue:504, body:'{"code":"504","message":"upstream model timeout"}'}
 * Left as-is this reads as a *successful* stream to chatCore — no retry, no
 * account failover, no cooldown, and the request is logged as OK.
 *
 * Billing blocks are checked first by the caller: they are actionable and must
 * keep their 403 → combo-fallback path, so they take precedence here.
 *
 * Gated on statusVal !== 200 so a normal completion whose *text* happens to
 * mention "gateway timeout" is never mistaken for a failure.
 */
function isGatewayError(statusVal, inner) {
  if (statusVal === 200) return false;
  if (QODER_GATEWAY_ERROR_STATUSES.includes(statusVal)) return true;
  if (!inner || typeof inner !== "string") return false;
  return QODER_GATEWAY_ERROR_PATTERNS.some((pattern) => pattern.test(inner));
}

/**
 * Pull a human-readable message out of a qoder envelope `body`. The body is
 * usually a JSON string like {"code":"504","message":"upstream model timeout"};
 * surfacing the inner message keeps chatCore's `[504]: <msg>` readable instead
 * of dumping raw JSON at the client.
 */
function extractUpstreamMessage(inner, statusVal) {
  if (inner && typeof inner === "string") {
    try {
      const parsed = JSON.parse(inner);
      const msg = parsed?.message || parsed?.error?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    } catch { /* not JSON — fall through to the raw body */ }
    if (inner.trim()) return inner.trim();
  }
  return `qoder upstream error (${statusVal})`;
}

/**
 * Peek the first SSE frame to detect billing/gateway errors before piping.
 * Returns { isBilling, isGatewayError, statusVal?, message?, consumed, upstreamDone } —
 * `consumed` is every byte read so far (including the peeked line) so the caller can
 * re-process it and nothing is dropped from the stream.
 */
async function peekFirstQoderFrame(reader, decoder) {
  let consumed = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return { isBilling: false, isGatewayError: false, consumed, upstreamDone: true };

    consumed += decoder.decode(value, { stream: true });
    const nl = consumed.indexOf("\n");
    if (nl === -1) continue; // need a full line first

    const line = consumed.slice(0, nl).replace(/\r$/, "").trim();
    if (!line.startsWith("data:")) continue;

    const data = line.slice(5).trimStart();
    if (data === "[DONE]") return { isBilling: false, isGatewayError: false, consumed };

    let envelope;
    try { envelope = JSON.parse(data); } catch { return { isBilling: false, isGatewayError: false, consumed }; }

    const statusVal = typeof envelope.statusCodeValue === "number" ? envelope.statusCodeValue : 200;
    const inner = typeof envelope.body === "string" ? envelope.body : "";

    // Billing blocks take precedence (more specific/actionable → force combo fallback).
    if (statusVal !== 200 && isBillingBlock(inner)) {
      return {
        isBilling: true,
        isGatewayError: false,
        statusVal,
        message: inner || `qoder billing block (${statusVal})`,
      };
    }

    // Gateway errors are transient network/path issues — will be surfaced as HTTP error
    // below so base.js retry + chatCore failover/cooldown trigger.
    if (isGatewayError(statusVal, inner)) {
      return {
        isBilling: false,
        isGatewayError: true,
        statusVal,
        message: extractUpstreamMessage(inner, statusVal),
      };
    }

    return { isBilling: false, isGatewayError: false, consumed };
  }
}

/**
 * Wrap the upstream's `{statusCodeValue, body}` SSE envelope into plain
 * OpenAI SSE chunks the rest of the chatCore pipeline understands.
 *
 * Each upstream line looks like:
 *   data: {"statusCodeValue":200,"body":"{\"choices\":[{\"delta\":{...}}]}"}
 * The inner body is an OpenAI streaming chunk (or "[DONE]"). We unwrap it
 * and re-emit as `data: <inner>\n\n`. Errors become a synthetic OpenAI error
 * chunk + [DONE].
 *
 * Critical: Qoder's SSE often keeps the socket open after the terminal
 * [DONE]/error frame (agent keepalive). Non-streaming clients drain via
 * response.text() which hangs until the socket closes — so on terminal
 * events we cancel the upstream reader and close our stream immediately.
 *
 * NEW: Peek first frame to detect billing blocks (code 112/10605/pricingUrl).
 * If detected, return 403 response so chatCore marks connection unavailable
 * and triggers combo fallback instead of leaking error text into chat.
 */
async function wrapQoderSSE(response, model, log = null) {
  if (!response.ok || !response.body) return response;

  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  // Peek first frame to detect billing/gateway errors before piping.
  const peek = await peekFirstQoderFrame(reader, decoder);
  if (peek?.isBilling) {
    // Billing block detected — return 403 so chatCore marks connection unavailable
    // and triggers combo failover (rate limit cooldown + quota exhaustion).
    await reader.cancel().catch(() => {});
    return new Response(
      JSON.stringify({ error: { message: peek.message, code: peek.statusVal } }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (peek?.isGatewayError) {
    // Transient gateway/upstream failure — surface as real HTTP error (502/503/504)
    // so base.js retry + chatCore failover/cooldown trigger. The message is already
    // extracted in peek.message for a readable client error.
    await reader.cancel().catch(() => {});
    return new Response(
      JSON.stringify({
        error: {
          message: `upstream ${peek.statusVal} · ${peek.message}`,
          code: `gateway_${peek.statusVal}_error`,
        },
      }),
      { status: peek.statusVal, headers: { "Content-Type": "application/json" } }
    );
  }

  // Normal flow: re-process every byte the peek consumed, then continue.
  let buffer = peek.consumed || "";
  const upstreamDrained = peek.upstreamDone === true;
  const encoder = new TextEncoder();
  let doneEmitted = false;
  // Tracks whether any real content frame went out. An error frame after this
  // point is mid-stream: response headers are already committed, so the status
  // can no longer be changed and failover is impossible — but it must not be
  // silently logged as a success either.
  let contentEmitted = false;

  // Process one already-extracted SSE line (no trailing newline).
  const processLine = (line, controller) => {
    const trimmed = line.replace(/\r$/, "").trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("data:")) return;
    if (doneEmitted) return;

    const data = trimmed.slice(5).trimStart();
    if (data === "[DONE]") {
      controller.enqueue(encoder.encode(SSE_DONE));
      doneEmitted = true;
      return;
    }

    let envelope;
    try { envelope = JSON.parse(data); } catch { return; }
    const statusVal = typeof envelope.statusCodeValue === "number" ? envelope.statusCodeValue : 200;
    const inner = typeof envelope.body === "string" ? envelope.body : "";
    if (statusVal !== 200) {
      const msg = inner || `upstream status ${statusVal}`;
      // An error frame after content has started is mid-stream: response headers
      // are already committed, so the status can no longer be changed and neither
      // retry nor failover is possible. Log it so a truncated request is never
      // silently recorded as a clean success.
      if (contentEmitted) {
        log?.warn?.("QODER", `mid-stream upstream error ${statusVal} on ${model} (response already committed, no failover possible): ${truncate(msg, 200)}`);
      }
      const errChunk = JSON.stringify({
        id: `qoder-error-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: { content: `\n[qoder error ${statusVal}: ${truncate(msg, 200)}]` }, finish_reason: "stop" }],
      });
      controller.enqueue(encoder.encode(`data: ${errChunk}\n\n`));
      controller.enqueue(encoder.encode(SSE_DONE));
      doneEmitted = true;
      return;
    }
    if (!inner) return;
    if (inner === "[DONE]") {
      controller.enqueue(encoder.encode(SSE_DONE));
      doneEmitted = true;
      return;
    }
    // Strip embedded newlines so the SSE frame stays a single event.
    const sanitized = inner.replace(/\r?\n/g, "");
    controller.enqueue(encoder.encode(`data: ${sanitized}\n\n`));
    contentEmitted = true;
  };

  const stream = new ReadableStream({
    // Use start()+loop (not pull): a pull that buffers a partial line without
    // enqueueing would never be re-invoked, hanging consumers like .text().
    async start(controller) {
      try {
        // Drain whatever the peek already pulled off the socket first.
        let nlSeed;
        while ((nlSeed = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nlSeed);
          buffer = buffer.slice(nlSeed + 1);
          processLine(line, controller);
          if (doneEmitted) {
            await reader.cancel().catch(() => {});
            controller.close();
            return;
          }
        }
        if (upstreamDrained) {
          // Peek hit end-of-stream: flush any trailing partial line.
          buffer += decoder.decode();
          if (buffer.length > 0) {
            processLine(buffer, controller);
            buffer = "";
          }
        }

        while (!doneEmitted && !upstreamDrained) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (buffer.length > 0) {
              processLine(buffer, controller);
              buffer = "";
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            processLine(line, controller);
            if (doneEmitted) {
              // Terminal frame received — drop upstream keepalive and end.
              await reader.cancel().catch(() => {});
              controller.close();
              return;
            }
          }
        }
      } catch {
        // fall through to terminal [DONE] + close
      } finally {
        if (!doneEmitted) {
          try {
            controller.enqueue(encoder.encode(SSE_DONE));
            doneEmitted = true;
          } catch { /* already closed */ }
        }
        try { controller.close(); } catch { /* already closed */ }
        await reader.cancel().catch(() => {});
      }
    },
    cancel() {
      return reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export class QoderExecutor extends BaseExecutor {
  constructor() {
    super("qoder", PROVIDERS.qoder);
  }

  buildUrl(credentials) {
    // Job-token (jt-...) traffic must hit api2.qoder.sh — api3 rejects jt-
    // with "Login expired" (403). Device tokens (dt-...) stay on api3.
    const raw = credentials?.apiKey || credentials?.accessToken;
    if (typeof raw === "string" && !raw.startsWith("pt-") && (raw.startsWith("jt-") || (credentials?.accessToken || "").startsWith("jt-"))) {
      return `${QODER_CHAT_BASE_ALT}/algo${QODER_CHAT_SIG_PATH}?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1`;
    }
    return QODER_CHAT_URL_ENCODED;
  }

  // Override execute entirely — Qoder needs:
  //   - body built from translated chat completion payload
  //   - body encoded with QoderEncodeBody before signing
  //   - COSY headers built from the *encoded* body bytes
  //   - response stream re-wrapped from {statusCodeValue, body} to OpenAI SSE
  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    // PAT (pt-...) → exchange for short-lived job token + resolve userId so
    // downstream COSY signing + catalog fetch work. Device tokens (dt-...) and
    // job tokens (jt-...) skip this and are used directly.
    const rawToken = credentials?.apiKey || credentials?.accessToken;
    if (isQoderPat(rawToken)) {
      try {
        credentials = await resolveQoderCredentials(credentials, proxyOptions, signal);
      } catch (err) {
        log?.error?.("QODER", `PAT exchange failed: ${err.message}`);
        const fakeResp = new Response(
          JSON.stringify({ error: { message: `qoder PAT exchange failed: ${err.message}` } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
        return { response: fakeResp, url: this.buildUrl(credentials), headers: {}, transformedBody: body };
      }
    }

    const url = this.buildUrl(credentials);
    const psd = credentials?.providerSpecificData || {};
    if (!psd.userId) {
      // No user id → no way to sign. Surface a 401 so the dashboard nudges
      // the user back to OAuth.
      const fakeResp = new Response(
        JSON.stringify({ error: { message: "qoder credential is missing userId; reconnect the account" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }
    if (!credentials?.accessToken) {
      // Same shape as the userId guard — clean 401 so chatCore reports
      // "reconnect" rather than bubbling cosy.js's synchronous throw as 500.
      const fakeResp = new Response(
        JSON.stringify({ error: { message: "qoder credential is missing accessToken; reconnect the account" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    let qoderKey;
    let payload;
    try {
      ({ qoderKey, payload } = await buildQoderRequestBody({ model, body, credentials, log, proxyOptions, signal }));
    } catch (err) {
      const fakeResp = new Response(
        JSON.stringify({ error: { message: err.message } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    const plainBody = Buffer.from(JSON.stringify(payload), "utf8");
    const encodedBodyStr = qoderEncodeBody(plainBody);
    const encodedBodyBuf = Buffer.from(encodedBodyStr, "latin1");

    const modelSource = (payload.model_config && payload.model_config.source) || "system";
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...this.config.retry };
    const timeoutMs = this.config?.timeoutMs || FETCH_CONNECT_TIMEOUT_MS;

    // Qoder's edge reports transient gateway failures (504 "upstream model
    // timeout") *inside* an HTTP 200 SSE frame. wrapQoderSSE converts those into
    // a real error Response. We retry them here because this executor overrides
    // base.execute() and therefore never reaches base.js's own retry loop. Every
    // Qoder account shares the same congested upstream pool, so a same-account
    // retry after a short delay is at least as useful as failing over.
    let attempt = 0;
    for (;;) {
      // COSY headers carry a Cosy-Date timestamp that the MD5 signature covers,
      // so each attempt must be signed fresh — a replayed signature can be rejected.
      let cosyHeaders;
      try {
        cosyHeaders = buildCosyHeaders(
          encodedBodyBuf,
          url,
          {
            userId: psd.userId,
            authToken: credentials.accessToken,
            name: credentials.displayName || "",
            email: credentials.email || "",
            machineId: psd.machineId || "",
          },
        );
      } catch (err) {
        // cosy.js throws synchronously on missing userId/authToken — surface
        // as 401 so chatCore prompts re-auth instead of returning a 500.
        const fakeResp = new Response(
          JSON.stringify({ error: { message: `qoder cosy signing failed: ${err.message}` } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
        return { response: fakeResp, url, headers: {}, transformedBody: body };
      }

      const headers = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Model-Key": qoderKey,
        "X-Model-Source": modelSource,
        // gzip triggers signature validation on Qoder's CDN; force identity.
        "Accept-Encoding": "identity",
        ...cosyHeaders,
      };

      // Abort if upstream doesn't return response headers within connect timeout.
      const connectCtrl = new AbortController();
      const connectTimer = setTimeout(() => connectCtrl.abort(new Error("fetch connect timeout")), timeoutMs);
      const mergedSignal = signal ? AbortSignal.any([signal, connectCtrl.signal]) : connectCtrl.signal;

      let response;
      try {
        response = await proxyAwareFetch(
          url,
          { method: "POST", headers, body: encodedBodyBuf, signal: mergedSignal },
          proxyOptions,
        );
      } finally {
        clearTimeout(connectTimer);
      }

      if (!response.ok) {
        // Pass error response through unchanged so chatCore can capture it.
        return { response, url, headers, transformedBody: payload };
      }

      const wrapped = await wrapQoderSSE(response, `qoder/${qoderKey}`, log);
      if (wrapped.ok) return { response: wrapped, url, headers, transformedBody: payload };

      // Non-2xx from wrapQoderSSE = billing block (403) or gateway failure (502/503/504).
      // Only statuses present in retryConfig get retried; 403 falls through to
      // chatCore so the account is marked unavailable and combo fallback runs.
      const { attempts, delayMs } = resolveRetryEntry(retryConfig[wrapped.status]);
      if (signal?.aborted || attempt >= attempts) {
        return { response: wrapped, url, headers, transformedBody: payload };
      }

      attempt++;
      log?.debug?.("RETRY", `qoder upstream ${wrapped.status} retry ${attempt}/${attempts} after ${delayMs / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (signal?.aborted) {
        return { response: wrapped, url, headers, transformedBody: payload };
      }
    }
  }

  // Qoder device tokens don't refresh through OAuth — the upstream returns
  // 403 for our flow. Surfacing failure via 401-on-chat is enough; the
  // dashboard tells users to re-login when their token expires (~30 days).
  async refreshCredentials() {
    return null;
  }

  needsRefresh() {
    return false;
  }
}

export default QoderExecutor;

// Internals exposed for unit tests. Not part of the public API — callers
// should import QoderExecutor and use its public methods.
export const __test__ = {
  normalizeMessages,
  wrapQoderSSE,
  buildQoderRequestBody,
  isBillingBlock,
  isGatewayError,
  extractUpstreamMessage,
  peekFirstQoderFrame,
};
