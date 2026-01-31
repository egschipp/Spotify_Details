import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getValidAccessToken, spotifyFetch } from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export async function POST(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const limit = rateLimit(`player-transfer:${sessionId}`, {
    windowMs: 60_000,
    max: 12
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }

  try {
    const body = await req.json();
    const deviceId = String(body?.deviceId || "");
    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId." }, { status: 400 });
    }

    const accessToken = await getValidAccessToken(sessionId);
    const res = await fetch(`https://api.spotify.com/v1/me/player`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ device_ids: [deviceId], play: true })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || "Failed to transfer playback.");
    }

    const nextRes = NextResponse.json(
      { ok: true },
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(nextRes, sessionId, isNew);
    return nextRes;
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
