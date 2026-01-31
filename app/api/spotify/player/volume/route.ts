import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getValidAccessToken } from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export async function POST(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const limit = rateLimit(`player-volume:${sessionId}`, {
    windowMs: 60_000,
    max: 60
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
    const volume = Number(body?.volume ?? NaN);
    if (!deviceId || Number.isNaN(volume)) {
      return NextResponse.json(
        { error: "Missing deviceId or volume." },
        { status: 400 }
      );
    }
    const volumePercent = Math.min(100, Math.max(0, Math.round(volume * 100)));

    const accessToken = await getValidAccessToken(sessionId);
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/volume?device_id=${encodeURIComponent(
        deviceId
      )}&volume_percent=${volumePercent}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error?.message || "Failed to update volume.");
    }

    const res = NextResponse.json(
      { ok: true },
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
