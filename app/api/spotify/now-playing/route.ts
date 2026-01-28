import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import {
  getAppAccessToken,
  getValidAccessToken,
  spotifyFetch
} from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const limit = rateLimit(`now-playing:${sessionId}`, {
    windowMs: 60_000,
    max: 120
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }
  try {
    const accessToken = await getValidAccessToken(sessionId);
    const response = await spotifyFetch("/me/player/currently-playing", accessToken);

    if (response.status === 204) {
      const res = NextResponse.json(
        { isPlaying: false, track: null },
        { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
      );
      attachSessionCookie(res, sessionId, isNew);
      return res;
    }

    if (!response.ok) {
      throw new Error(`Spotify now playing fetch failed (${response.status}).`);
    }

    const data = (await response.json()) as {
      is_playing: boolean;
      item?: {
        id: string;
        name: string;
        duration_ms: number;
        artists: { id: string; name: string }[];
        album: { name: string; images: { url: string }[] };
        external_urls?: { spotify?: string };
      } | null;
    };

    if (!data.item) {
      const res = NextResponse.json(
        { isPlaying: false, track: null },
        { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
      );
      attachSessionCookie(res, sessionId, isNew);
      return res;
    }

    let artistDetails:
      | {
          id: string;
          name: string;
          genres: string[];
          followers: number;
          popularity: number;
          image: string | null;
          spotifyUrl: string | null;
        }
      | null = null;
    const primaryArtistId = data.item.artists[0]?.id;
    if (primaryArtistId) {
      let artistToken = accessToken;
      try {
        artistToken = await getAppAccessToken(sessionId);
      } catch {
        artistToken = accessToken;
      }
      const artistRes = await spotifyFetch(
        `/artists/${primaryArtistId}`,
        artistToken
      );
      if (artistRes.ok) {
        const artist = (await artistRes.json()) as {
          id: string;
          name: string;
          genres: string[];
          followers: { total: number };
          popularity: number;
          images?: { url: string }[];
          external_urls?: { spotify?: string };
        };
        artistDetails = {
          id: artist.id,
          name: artist.name,
          genres: artist.genres ?? [],
          followers: artist.followers?.total ?? 0,
          popularity: artist.popularity ?? 0,
          image: artist.images?.[0]?.url ?? null,
          spotifyUrl: artist.external_urls?.spotify ?? null
        };
      }
    }

    const res = NextResponse.json(
      {
        isPlaying: data.is_playing,
        track: {
          id: data.item.id,
          name: data.item.name,
          artists: data.item.artists.map((artist) => artist.name),
          album: data.item.album.name,
          cover: data.item.album.images?.[0]?.url ?? null,
          durationMs: data.item.duration_ms,
          spotifyUrl: data.item.external_urls?.spotify ?? null
        },
        artist: artistDetails
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
