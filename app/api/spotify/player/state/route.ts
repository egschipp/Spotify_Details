import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getValidAccessToken } from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const limit = rateLimit(`player-state:${sessionId}`, {
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
    const accessToken = await getValidAccessToken(sessionId);
    const response = await fetch("https://api.spotify.com/v1/me/player", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (response.status === 204) {
      const res = new NextResponse(null, { status: 204 });
      attachSessionCookie(res, sessionId, isNew);
      return res;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error?.message || "Failed to load playback state.");
    }

    const data = await response.json();
    const item = data?.item;
    const res = NextResponse.json(
      {
        state: {
          isPlaying: Boolean(data?.is_playing),
          progressMs: Number(data?.progress_ms ?? 0),
          durationMs: Number(item?.duration_ms ?? 0),
          track: item
            ? {
                id: String(item?.id ?? ""),
                name: String(item?.name ?? ""),
                artists: Array.isArray(item?.artists)
                  ? item.artists.map((artist: { name: string }) => artist.name)
                  : [],
                album: String(item?.album?.name ?? ""),
                albumArt: item?.album?.images?.[0]?.url ?? null,
                uri: item?.uri ?? null
              }
            : null,
          device: data?.device
            ? {
                id: data.device.id ?? null,
                name: data.device.name ?? null,
                type: data.device.type ?? null
              }
            : null
        }
      },
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
