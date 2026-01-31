import { NextRequest, NextResponse } from "next/server";
import { getCredentials } from "@/lib/storage/credentialsStore";
import {
  attachSessionCookie,
  getCookieDomain,
  getSessionId
} from "@/lib/storage/sessionCookie";
import { setSession } from "@/lib/storage/sessionStore";
import { createOAuthRecord } from "@/lib/storage/oauthStore";
import {
  buildAuthorizeUrl,
  getRedirectUriFromRequest
} from "@/lib/spotify/spotifyClient";
import { generateCodeChallenge, generateCodeVerifier } from "@/lib/spotify/pkce";
import crypto from "crypto";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  // Throttle OAuth start to prevent abuse and accidental loops.
  const limit = rateLimit(`auth-start:${sessionId}`, {
    windowMs: 60_000,
    max: 10
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }
  const credentials = await getCredentials(sessionId);
  if (!credentials) {
    return NextResponse.json(
      { error: "No Spotify credentials saved." },
      { status: 400 }
    );
  }

  // PKCE: generate verifier/challenge pair and store state server-side.
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();
  const redirectUri = getRedirectUriFromRequest(req);
  const urlObj = new URL(req.url);
  const returnToParam = urlObj.searchParams.get("returnTo");
  const returnTo =
    returnToParam && returnToParam.startsWith("/")
      ? returnToParam
      : "/";

  await setSession(sessionId, {
    codeVerifier,
    authState: state,
    returnTo
  });

  // Store a short-lived server-side record keyed by a nonce cookie.
  const nonce = await createOAuthRecord({
    state,
    codeVerifier,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret
  });

  const url = buildAuthorizeUrl({
    clientId: credentials.clientId,
    redirectUri,
    codeChallenge,
    state
  });

  const stateHash = crypto
    .createHash("sha256")
    .update(state)
    .digest("hex")
    .slice(0, 8);
  console.info(
    JSON.stringify({
      event: "oauth_start",
      host: req.headers.get("host"),
      xfHost: req.headers.get("x-forwarded-host"),
      xfProto: req.headers.get("x-forwarded-proto"),
      path: new URL(req.url).pathname,
      ua: req.headers.get("user-agent"),
      state: stateHash
    })
  );

  const res = NextResponse.redirect(url, {
    headers: rateLimitHeaders(limit.remaining, limit.resetAt)
  });
  // Nonce cookie must survive cross-site redirects on iOS (SameSite=None; Secure).
  const cookieDomain = getCookieDomain();
  res.cookies.set({
    name: "oauth_nonce",
    value: nonce,
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 600,
    ...(cookieDomain ? { domain: cookieDomain } : {})
  });
  attachSessionCookie(res, sessionId, isNew);
  return res;
}
