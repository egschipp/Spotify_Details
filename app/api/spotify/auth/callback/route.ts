import { NextRequest, NextResponse } from "next/server";
import { getCredentials } from "@/lib/storage/credentialsStore";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getSession, setSession } from "@/lib/storage/sessionStore";
import {
  exchangeCodeForToken,
  getAppBaseUrl,
  getRedirectUri
} from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
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
  const appBaseUrl = getAppBaseUrl(req.url);

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

  const session = await getSession(sessionId);
  if (!session.codeVerifier || !session.authState) {
    const res = NextResponse.redirect(
      new URL("?authError=Auth%20session%20not%20initialized.", appBaseUrl),
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }
  if (session.authState !== state) {
    const res = NextResponse.redirect(
      new URL("?authError=State%20mismatch.", appBaseUrl),
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }

  const credentials = await getCredentials(sessionId);
  if (!credentials) {
    const res = NextResponse.redirect(
      new URL("?authError=Missing%20Spotify%20credentials.", appBaseUrl),
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }

  try {
    const redirectUri = getRedirectUri(req.url);
    const token = await exchangeCodeForToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      code,
      redirectUri,
      codeVerifier: session.codeVerifier
    });
    const expiresAt = Date.now() + token.expires_in * 1000 - 30_000;
    await setSession(sessionId, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      codeVerifier: undefined,
      authState: undefined
    });
    const res = NextResponse.redirect(new URL(".", appBaseUrl), {
      headers: rateLimitHeaders(limit.remaining, limit.resetAt)
    });
    attachSessionCookie(res, sessionId, isNew);
    return res;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
