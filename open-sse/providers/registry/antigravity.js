import { ANTIGRAVITY_IDE_BASE_URL, ANTIGRAVITY_IDE_USER_AGENT, ANTIGRAVITY_OAUTH_CLIENT } from "../shared.js";

export default {
  id: "antigravity",
  priority: 20,
  alias: "ag",
  uiAlias: "ag",
  display: {
    name: "Antigravity",
    icon: "rocket_launch",
    color: "#F59E0B",
    website: "https://antigravity.google",
    notice: {
      signupUrl: "https://antigravity.google",
    },
    deprecated: true,
    deprecationNotice: "RISK_NOTICE",
  },
  category: "oauth",
  serviceKinds: ["llm", "image", "webSearch"],
  transport: {
    baseUrls: [ANTIGRAVITY_IDE_BASE_URL],
    format: "antigravity",
    headers: {
      "User-Agent": ANTIGRAVITY_IDE_USER_AGENT,
    },
    retry: {
      "429": {
        attempts: 3,
      },
      "500": {
        attempts: 3,
      },
      "503": {
        attempts: 3,
      },
    },
    usage: {
      // Quota discovery MUST use the same host as chat, because the model catalog
      // is host-specific. Measured 2026-09-06 with IDE UA 3.0.0:
      //   daily -> 33 models, includes gemini-3.8-flash-{high,medium,low,tiered}
      //            each carrying quotaInfo, defaultAgentModelId=gemini-3.8-flash-high
      //   PROD  -> 28 models, no gemini-3.8-* at all
      // Chat runs against daily (transport.baseUrls below) to bypass PROD 429s, so
      // pointing quota at PROD left the whole 3.8 family with no quota entry.
      quotaApiUrl: `${ANTIGRAVITY_IDE_BASE_URL}/v1internal:fetchAvailableModels`,
      // loadCodeAssist / onboardUser deliberately stay on PROD. Both do answer 200 on
      // daily today with identical data (project + allowedTiers), but onboarding is
      // header-fingerprint sensitive — see ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS in
      // config/appConstants.js — and nothing is gained by moving it.
      loadProjectApiUrl: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
      tokenUrl: "https://oauth2.googleapis.com/token",
    },
    clientId: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
    clientSecret: "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",
  },
  // Ids and display names mirror upstream v1internal:fetchAvailableModels (daily
  // host, IDE >= 3.0.0) captured 2026-09-06, ordered by its agentModelSorts
  // "Recommended" group. Ids are sent verbatim upstream.
  //
  // The previous `upstreamModelId: "<model>-tiered(high)"` syntax does not exist
  // upstream and returns 404 NOT_FOUND: the per-tier models are separate ids
  // (gemini-3.8-flash-high / -medium / -low) and "<model>-tiered" is a distinct
  // auto-tiering id with no tier suffix. Likewise `gemini-3.5-flash-high` was never
  // a real id — "Gemini 3.5 Flash (High)" is served by gemini-3-flash-agent.
  models: [
    { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" },
    { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)" },
    { id: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" },
    { id: "gemini-3.7-flash-high", name: "Gemini 3.7 Flash (High)" },
    { id: "gemini-3.7-flash-medium", name: "Gemini 3.7 Flash (Medium)" },
    { id: "gemini-3.7-flash-low", name: "Gemini 3.7 Flash (Low)" },
    { id: "gemini-3.6-flash-high", name: "Gemini 3.6 Flash (High)" },
    { id: "gemini-3.6-flash-medium", name: "Gemini 3.6 Flash (Medium)" },
    { id: "gemini-3.6-flash-low", name: "Gemini 3.6 Flash (Low)" },
    { id: "gemini-pro-agent", name: "Gemini 3.1 Pro (High)" },
    { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)" },
    { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)" },
    { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" },
    // Older tiers still served upstream. Display names are upstream's own and are
    // deliberately decoupled from the id: gemini-3-flash-agent is surfaced as
    // "Gemini 3.5 Flash (High)", and gemini-3.5-flash-low as "Gemini 3.5 Flash (Medium)".
    { id: "gemini-3-flash-agent", name: "Gemini 3.5 Flash (High)" },
    { id: "gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Medium)" },
    { id: "gemini-3.5-flash-extra-low", name: "Gemini 3.5 Flash (Low)" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash", thinking: false },
    // Image generation models
    { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash (Image)", kind: "image", imageGen: true, capabilities: ["textToImage"] },
  ],
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v1/userinfo",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs",
    ],
    apiEndpoint: "https://daily-cloudcode-pa.googleapis.com",
    apiVersion: "v1internal",
    loadCodeAssistEndpoint: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    onboardUserEndpoint: "https://cloudcode-pa.googleapis.com/v1internal:onboardUser",
    loadCodeAssistUserAgent: ANTIGRAVITY_IDE_USER_AGENT,
    refreshLeadMs: 300000,
  },
  searchViaChat: {
    defaultModel: "gemini-2.5-flash",
    endpoint: `${ANTIGRAVITY_IDE_BASE_URL}/v1internal:generateContent`,
    freeTier: "Free — Google Search grounding through an Antigravity OAuth account.",
  },
  features: {
    usage: true,
  },
};
