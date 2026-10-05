import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";
import { ANTIGRAVITY_CONFIG, GEMINI_CONFIG, getOAuthClientMetadata } from "@/lib/oauth/constants/oauth.js";

/**
 * POST /api/oauth/antigravity/import-refresh-token
 * Import a Google OAuth refresh_token for Antigravity or Gemini CLI.
 * Uses the refresh_token to obtain an access_token, fetches user info + project ID,
 * and saves a fully functional connection.
 *
 * Body: { refreshToken: string, provider?: "antigravity" | "gemini-cli" }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const refreshToken = (body.refreshToken || "").trim();
    const provider = body.provider === "gemini-cli" ? "gemini-cli" : "antigravity";
    const config = provider === "gemini-cli" ? GEMINI_CONFIG : ANTIGRAVITY_CONFIG;

    if (!refreshToken) {
      return NextResponse.json({ error: "Refresh token is required" }, { status: 400 });
    }

    // 1. Exchange refresh_token for access_token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return NextResponse.json(
        { error: `Token refresh failed: ${err}` },
        { status: 401 }
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 3600;

    // 2. Fetch user info (email)
    let email = null;
    try {
      const userRes = await fetch(
        `https://www.googleapis.com/oauth2/v1/userinfo?alt=json`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (userRes.ok) {
        const userInfo = await userRes.json();
        email = userInfo.email || null;
      }
    } catch { /* best-effort */ }

    // 3. Fetch project ID via loadCodeAssist
    let projectId = "";
    try {
      const loadHeaders = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(provider === "antigravity"
          ? { "User-Agent": config.loadCodeAssistUserAgent, "x-request-source": "local" }
          : {}),
      };
      const endpoint = provider === "antigravity"
        ? config.loadCodeAssistEndpoint
        : "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
      const loadRes = await fetch(endpoint, {
        method: "POST",
        headers: loadHeaders,
        body: JSON.stringify({ metadata: getOAuthClientMetadata() }),
      });
      if (loadRes.ok) {
        const data = await loadRes.json();
        projectId = data.cloudaicompanionProject?.id || data.cloudaicompanionProject || "";
        // Fire-and-forget onboarding (same as postExchange in OAuth flow)
        if (projectId && provider === "antigravity") {
          let tierId = "legacy-tier";
          if (Array.isArray(data.allowedTiers)) {
            for (const tier of data.allowedTiers) {
              if (tier.isDefault && tier.id) { tierId = tier.id.trim(); break; }
            }
          }
          const doOnboard = async () => {
            for (let i = 0; i < 10; i++) {
              try {
                const r = await fetch(config.onboardUserEndpoint, {
                  method: "POST", headers: loadHeaders,
                  body: JSON.stringify({ tierId, metadata: getOAuthClientMetadata() }),
                });
                if (r.ok && (await r.json()).done === true) break;
              } catch { break; }
              await new Promise(r => setTimeout(r, 5000));
            }
          };
          doOnboard().catch(() => {});
        }
      }
    } catch { /* best-effort */ }

    // 4. Save connection
    const connection = await createProviderConnection({
      provider,
      authType: "oauth",
      accessToken,
      refreshToken,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      email,
      projectId: projectId || undefined,
      testStatus: "active",
    });

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        provider: connection.provider,
        email: connection.email,
      },
    });
  } catch (error) {
    console.log("Antigravity import refresh-token error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
