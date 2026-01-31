import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getValidAccessToken } from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export async function POST(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const limit = rateLimit(`player-token:${sessionId}`, {
    windowMs: 60_000,
    max: 20
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }

  try {
    const accessToken = await getValidAccessToken(sessionId);
    const res = NextResponse.json(
      { accessToken },
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  } catch (error) {
    const message = (error as Error).message;
    const status = message.includes("auth")
      ? 401
      : message.includes("credentials")
        ? 400
        : 500;
    const res = NextResponse.json({ error: message }, { status });
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }
}
