import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getValidAccessToken, spotifyFetch } from "@/lib/spotify/spotifyClient";
import { clearSession } from "@/lib/storage/sessionStore";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

type SpotifyPlaylistItem = {
  id: string;
  name: string;
  images: { url: string; width: number; height: number }[];
  tracks: { total: number };
  owner: { display_name?: string; id: string };
  external_urls?: { spotify?: string };
};

type SpotifyPlaylistsResponse = {
  items: SpotifyPlaylistItem[];
  next: string | null;
  total: number;
};

async function fetchAllPlaylists(accessToken: string) {
  const items: SpotifyPlaylistItem[] = [];
  let offset = 0;
  const limit = 50;
  let next: string | null = null;

  do {
    const response = await spotifyFetch(
      `/me/playlists?limit=${limit}&offset=${offset}`,
      accessToken
    );
    if (!response.ok) {
      throw new Error(`Spotify playlists fetch failed (${response.status}).`);
    }
    const data = (await response.json()) as SpotifyPlaylistsResponse;
    items.push(...data.items);
    next = data.next;
    offset += limit;
  } while (next);

  return items;
}

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const limit = rateLimit(`playlists:${sessionId}`, {
    windowMs: 60_000,
    max: 30
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }
  try {
    const accessToken = await getValidAccessToken(sessionId);
    const playlists = await fetchAllPlaylists(accessToken);
    const res = NextResponse.json(
      {
      total: playlists.length,
      playlists: playlists.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        images: playlist.images,
        trackCount: playlist.tracks.total,
        owner: playlist.owner.display_name ?? playlist.owner.id,
        spotifyUrl: playlist.external_urls?.spotify ?? null
      }))
      },
      { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  } catch (error) {
    const message = (error as Error).message;
    let status = message.includes("auth")
      ? 401
      : message.includes("credentials")
        ? 400
        : 500;
    let responseMessage = message;
    if (message.includes("fetch failed (401)") || message.includes("fetch failed (403)")) {
      status = 401;
      responseMessage = "Spotify auth required.";
      await clearSession(sessionId);
    }
    const res = NextResponse.json({ error: responseMessage }, { status });
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }
}
