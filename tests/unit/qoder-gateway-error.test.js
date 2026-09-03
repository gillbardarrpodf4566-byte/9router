/**
 * Unit tests for qoder upstream gateway-error detection.
 *
 * Qoder's edge wraps the real inference backend, so an upstream timeout reaches
 * us as an HTTP 200 SSE frame:
 *   data: {"statusCodeValue":504,"body":"{\"code\":\"504\",\"message\":\"upstream model timeout\"}"}
 *
 * Before this handling, wrapQoderSSE re-emitted that as assistant text with
 * finish_reason:"stop", so chatCore saw a *successful* stream: no retry, no
 * account failover, no cooldown, and the request was logged as OK. These tests
 * pin the corrected behaviour — a first-frame gateway error becomes a real
 * non-2xx Response — while non-gateway errors keep their old pass-through shape.
 */

import { describe, it, expect } from "vitest";
import { __test__ as qoderExecutorInternals } from "../../open-sse/executors/qoder.js";

const { isGatewayError, isBillingBlock, extractUpstreamMessage, wrapQoderSSE } = qoderExecutorInternals;

function makeResponse(lines, { status = 200 } = {}) {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(body, { status });
}

function frame(statusCodeValue, body) {
  return `data: ${JSON.stringify({ statusCodeValue, body })}\n\n`;
}

async function drain(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  return buf + decoder.decode();
}

describe("isGatewayError", () => {
  it("detects the reported qmodel_38max failure (504 upstream model timeout)", () => {
    expect(isGatewayError(504, '{"code":"504","message":"upstream model timeout"}')).toBe(true);
  });

  it.each([502, 503, 504])("detects gateway status %i regardless of body", (status) => {
    expect(isGatewayError(status, "")).toBe(true);
    expect(isGatewayError(status, "anything")).toBe(true);
  });

  it("detects timeout wording on a non-gateway status code", () => {
    expect(isGatewayError(500, '{"message":"upstream model timeout"}')).toBe(true);
    expect(isGatewayError(500, '{"message":"Gateway Timeout"}')).toBe(true);
  });

  it("returns false for a 200 frame even if the model output mentions a timeout", () => {
    // Guards against aborting a healthy completion whose *text* contains the phrase.
    const chunk = JSON.stringify({ choices: [{ delta: { content: "a gateway timeout happens when..." } }] });
    expect(isGatewayError(200, chunk)).toBe(false);
  });

  it("returns false for non-gateway server errors", () => {
    expect(isGatewayError(500, "Internal server error")).toBe(false);
    expect(isGatewayError(400, "Bad request")).toBe(false);
  });

  it("returns false for billing blocks — those keep the 403 combo-fallback path", () => {
    expect(isBillingBlock('{"code":"112","message":"Quota exhausted"}')).toBe(true);
    expect(isGatewayError(403, '{"code":"112","message":"Quota exhausted"}')).toBe(false);
  });

  it("tolerates empty and non-string bodies", () => {
    expect(isGatewayError(500, null)).toBe(false);
    expect(isGatewayError(500, undefined)).toBe(false);
    expect(isGatewayError(200, null)).toBe(false);
  });
});

describe("extractUpstreamMessage", () => {
  it("pulls the inner message out of a JSON body", () => {
    expect(extractUpstreamMessage('{"code":"504","message":"upstream model timeout"}', 504))
      .toBe("upstream model timeout");
  });

  it("falls back to a nested error.message", () => {
    expect(extractUpstreamMessage('{"error":{"message":"backend unavailable"}}', 503))
      .toBe("backend unavailable");
  });

  it("returns the raw body when it is not JSON", () => {
    expect(extractUpstreamMessage("plain text failure", 502)).toBe("plain text failure");
  });

  it("synthesises a message when the body is empty", () => {
    expect(extractUpstreamMessage("", 504)).toBe("qoder upstream error (504)");
    expect(extractUpstreamMessage(null, 504)).toBe("qoder upstream error (504)");
  });
});

describe("wrapQoderSSE gateway-error handling", () => {
  it("returns a real 504 Response for the reported upstream model timeout", async () => {
    const wrapped = await wrapQoderSSE(
      makeResponse([frame(504, '{"code":"504","message":"upstream model timeout"}')]),
      "qoder/qmodel_38max",
    );

    expect(wrapped.status).toBe(504);
    expect(wrapped.ok).toBe(false);

    const json = await wrapped.json();
    expect(json.error).toBeDefined();
    expect(json.error.message).toContain("upstream model timeout");
    // Must NOT leak the error into assistant content.
    expect(json.error.message).not.toContain("[qoder error");
  });

  it.each([
    [502, '{"message":"bad gateway"}'],
    [503, '{"message":"service unavailable"}'],
  ])("returns the matching status %i for other gateway failures", async (status, body) => {
    const wrapped = await wrapQoderSSE(makeResponse([frame(status, body)]), "qoder/qmodel_38max");
    expect(wrapped.status).toBe(status);
    expect(wrapped.ok).toBe(false);
  });

  it("lets billing blocks keep precedence over gateway classification", async () => {
    // A 503 carrying a pricingUrl is a quota/billing signal, not transient noise:
    // it must stay on the 403 → combo-fallback path.
    const wrapped = await wrapQoderSSE(
      makeResponse([frame(503, '{"code":"112","message":"Quota exhausted","pricingUrl":"https://qoder.sh/pricing"}')]),
      "qoder/qmodel_38max",
    );

    expect(wrapped.status).toBe(403);
    expect(wrapped.ok).toBe(false);
  });

  it("still passes a non-gateway 500 through as an in-band SSE error chunk", async () => {
    const wrapped = await wrapQoderSSE(
      makeResponse([frame(500, "Internal server error")]),
      "qoder/ultimate",
    );

    expect(wrapped.status).toBe(200);
    expect(wrapped.ok).toBe(true);
    const buf = await drain(wrapped);
    expect(buf).toContain("[qoder error 500");
    expect(buf).toContain("data: [DONE]");
  });

  it("does not disturb a healthy stream", async () => {
    const inner = JSON.stringify({ choices: [{ delta: { content: "hello" } }] });
    const wrapped = await wrapQoderSSE(
      makeResponse([frame(200, inner), `data: {"statusCodeValue":200,"body":"[DONE]"}\n\n`]),
      "qoder/qmodel_38max",
    );

    expect(wrapped.status).toBe(200);
    expect(wrapped.ok).toBe(true);
    const buf = await drain(wrapped);
    expect(buf).toContain(`data: ${inner}`);
    expect(buf).toContain("data: [DONE]");
  });

  it("logs a warning when an error frame arrives mid-stream (no failover possible)", async () => {
    const warnings = [];
    const log = { warn: (tag, msg) => warnings.push({ tag, msg }) };
    const inner = JSON.stringify({ choices: [{ delta: { content: "partial answer" } }] });

    const wrapped = await wrapQoderSSE(
      makeResponse([
        frame(200, inner),
        frame(504, '{"code":"504","message":"upstream model timeout"}'),
      ]),
      "qoder/qmodel_38max",
      log,
    );

    // Headers are already committed, so this stays a 200 in-band error...
    expect(wrapped.status).toBe(200);
    const buf = await drain(wrapped);
    expect(buf).toContain("[qoder error 504");
    // ...but it must be visible server-side instead of silently counting as success.
    expect(warnings).toHaveLength(1);
    expect(warnings[0].tag).toBe("QODER");
    expect(warnings[0].msg).toContain("mid-stream");
    expect(warnings[0].msg).toContain("504");
  });

  it("does not warn for a first-frame error that was converted to a real Response", async () => {
    const warnings = [];
    const log = { warn: (tag, msg) => warnings.push({ tag, msg }) };

    const wrapped = await wrapQoderSSE(
      makeResponse([frame(504, '{"code":"504","message":"upstream model timeout"}')]),
      "qoder/qmodel_38max",
      log,
    );

    expect(wrapped.status).toBe(504);
    expect(warnings).toHaveLength(0);
  });
});
