import { NextResponse } from "next/server";
import { completeRelaySession } from "@/lib/oauth/utils/server";

/**
 * POST /api/oauth/relay-callback
 *
 * Server-side sink for the app's own /callback page. The page forwards the
 * authorization code (or the provider's error) here keyed by `state`, which
 * gives the OAuth modal an origin-independent way to pick the flow back up.
 *
 * Why this exists: popup → opener messaging (postMessage / BroadcastChannel /
 * localStorage) is origin-scoped. When the dashboard is reached at
 * http://127.0.0.1 but redirect_uri said http://localhost — both loopback, both
 * valid to Google, but different browser origins — every channel silently drops
 * the code and the modal waits forever. Relaying through the server sidesteps
 * the origin boundary entirely.
 *
 * The server only *holds* the code; the modal still issues the single
 * /exchange call, so a code delivered by both paths cannot create two
 * provider connections.
 */

// Login-CSRF guard: only accept the relay from our own /callback page. A
// cross-site page posting a victim's cookie along with an attacker-chosen code
// would otherwise be able to bind the attacker's provider account to the
// victim's session. Browsers always send Origin on fetch POSTs, so requiring it
// to match the host that served the page is enough to pin this to same-origin.
function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin relay rejected" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid or empty request body" }, { status: 400 });
  }

  const { state, code, error, errorDescription } = body || {};
  if (!state) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 });
  }
  if (!code && !error) {
    return NextResponse.json({ error: "Missing code or error" }, { status: 400 });
  }

  const result = completeRelaySession(String(state), {
    code: code ? String(code) : null,
    error: error ? String(error) : null,
    errorDescription: errorDescription ? String(errorDescription) : null,
  });

  // unknown_state is expected when the modal was closed, the session expired,
  // or the callback page is served by a different instance than the one that
  // issued the auth URL. Report it without alarming the user.
  return NextResponse.json({ success: result === "ok", result });
}
