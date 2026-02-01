import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCredentials, saveCredentials } from "@/lib/storage/credentialsStore";
import {
  attachSessionCookie,
  getCookieDomain,
  getSessionId,
  setOAuthSessionCookie
} from "@/lib/storage/sessionCookie";
import {
  clearOAuthRecord,
  findOAuthRecordByState,
  getOAuthRecord
} from "@/lib/storage/oauthStore";
import { getSession, setSession } from "@/lib/storage/sessionStore";
import {
  exchangeCodeForToken,
  getAppBaseUrlFromRequest,
  getRedirectUriFromRequest
} from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  // Throttle callback to reduce brute-force / replay attempts.
  const limit = rateLimit(`auth-callback:${sessionId}`, {
    windowMs: 60_000,
    max: 10
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const appBaseUrl = getAppBaseUrlFromRequest(req);

  if (error) {
    const message = errorDescription
      ? `${error}: ${errorDescription}`
      : error;
    const res = NextResponse.redirect(
      new URL(`?authError=${encodeURIComponent(message)}`, appBaseUrl),
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }

  if (!code || !state) {
    const res = NextResponse.redirect(
      new URL("?authError=Missing%20code%20or%20state.", appBaseUrl),
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }

  // Resolve the OAuth record via nonce cookie; fall back to state lookup if needed.
  const oauthNonce = req.cookies.get("oauth_nonce")?.value;
  let resolvedNonce = oauthNonce ?? null;
  let oauthRecord = oauthNonce ? await getOAuthRecord(oauthNonce) : null;
  if (!oauthRecord) {
    const byState = await findOAuthRecordByState(state);
    if (byState) {
      oauthRecord = {
        state,
        codeVerifier: byState.codeVerifier,
        clientId: byState.clientId,
        clientSecret: byState.clientSecret
      };
      resolvedNonce = byState.nonce;
    }
  }
  if (!oauthRecord || oauthRecord.state !== state) {
    const res = NextResponse.redirect(
      new URL("?authError=Auth%20session%20not%20initialized.", appBaseUrl),
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }

  const stateHash = crypto
    .createHash("sha256")
    .update(state)
    .digest("hex")
    .slice(0, 8);
  console.info(
    JSON.stringify({
      event: "oauth_callback",
      host: req.headers.get("host"),
      xfHost: req.headers.get("x-forwarded-host"),
      xfProto: req.headers.get("x-forwarded-proto"),
      path: new URL(req.url).pathname,
      ua: req.headers.get("user-agent"),
      oauthNonce: Boolean(oauthNonce),
      resolvedNonce: Boolean(resolvedNonce),
      state: stateHash
    })
  );

  // Prefer saved credentials; fall back to the ones captured at auth start.
  const credentials =
    (await getCredentials(sessionId)) ?? {
      clientId: oauthRecord.clientId,
      clientSecret: oauthRecord.clientSecret
    };
  if (!credentials) {
    const res = NextResponse.redirect(
      new URL("?authError=Missing%20Spotify%20credentials.", appBaseUrl),
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }

  try {
    const redirectUri = getRedirectUriFromRequest(req);
    // Exchange code for access/refresh tokens using PKCE verifier.
    const token = await exchangeCodeForToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      code,
      redirectUri,
      codeVerifier: oauthRecord.codeVerifier
    });
    const expiresAt = Date.now() + token.expires_in * 1000 - 30_000;
    const sessionBefore = await getSession(sessionId);
    const refreshToken = token.refresh_token ?? sessionBefore.refreshToken;
    // Persist tokens in the server session; keep cookies HttpOnly.
    await setSession(sessionId, {
      accessToken: token.access_token,
      refreshToken,
      expiresAt,
      codeVerifier: undefined,
      authState: undefined
    });
    await saveCredentials(
      sessionId,
      credentials.clientId,
      credentials.clientSecret
    );
    const sessionAfter = await getSession(sessionId);
    const safeReturnTo =
      sessionAfter.returnTo && sessionAfter.returnTo.startsWith("/")
        ? sessionAfter.returnTo
        : "/";
    const res = NextResponse.redirect(new URL(safeReturnTo, appBaseUrl), {
      headers: rateLimitHeaders(limit.remaining, limit.resetAt)
    });
    if (resolvedNonce) {
      const cookieDomain = getCookieDomain();
      res.cookies.set("oauth_nonce", "", {
        path: "/",
        maxAge: 0,
        ...(cookieDomain ? { domain: cookieDomain } : {})
      });
      // Clean up the nonce record to avoid replay.
      await clearOAuthRecord(resolvedNonce);
    }
    setOAuthSessionCookie(res, sessionId);
    return res;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
