import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getValidAccessToken, spotifyFetch } from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";

type SpotifyPlaylist = {
  id: string;
  name: string;
  tracks: { total: number };
};

type SpotifyPlaylistsResponse = {
  items: SpotifyPlaylist[];
  next: string | null;
};

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  duration_ms: number;
  explicit: boolean;
  popularity: number;
  preview_url: string | null;
  uri: string;
  is_local: boolean;
  external_urls?: { spotify?: string };
};

type SpotifyPlaylistTracksResponse = {
  items: { track: SpotifyTrack | null }[];
  next: string | null;
};

type SpotifySavedTrack = {
  track: SpotifyTrack;
};

type SpotifySavedTracksResponse = {
  items: SpotifySavedTrack[];
  next: string | null;
};

type ArtistsPayload = {
  artists: { id: string; name: string }[];
  tracks: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album: { id: string; name: string; images: { url: string }[] };
    spotifyUrl: string | null;
    durationMs: number;
    playlistNames: string[];
  }[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const artistsCache = new Map<string, { expiresAt: number; payload: ArtistsPayload }>();

async function fetchAllPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const items: SpotifyPlaylist[] = [];
  let next: string | null = `/me/playlists?limit=50`;
  while (next) {
    const response = await spotifyFetch(next, accessToken);
    if (!response.ok) {
      throw new Error(`Spotify playlists fetch failed (${response.status}).`);
    }
    const data = (await response.json()) as SpotifyPlaylistsResponse;
    items.push(...data.items);
    next = data.next ? data.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return items;
}

async function fetchAllPlaylistTracks(
  accessToken: string,
  playlistId: string
): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let next: string | null = `/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,artists(id,name),album(id,name,images),duration_ms,explicit,popularity,preview_url,uri,is_local,external_urls)),next`;
  while (next) {
    const response = await spotifyFetch(next, accessToken);
    if (!response.ok) {
      throw new Error(`Spotify playlist tracks fetch failed (${response.status}).`);
    }
    const data = (await response.json()) as SpotifyPlaylistTracksResponse;
    tracks.push(
      ...data.items
        .map((item) => item.track)
        .filter((track): track is SpotifyTrack => Boolean(track))
    );
    next = data.next ? data.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return tracks;
}

async function fetchAllLikedTracks(accessToken: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let next: string | null = `/me/tracks?limit=50`;
  while (next) {
    const response = await spotifyFetch(next, accessToken);
    if (!response.ok) {
      throw new Error(`Spotify liked tracks fetch failed (${response.status}).`);
    }
    const data = (await response.json()) as SpotifySavedTracksResponse;
    tracks.push(...data.items.map((item) => item.track));
    next = data.next ? data.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return tracks;
}

export async function POST(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const limit = rateLimit(`artists:${sessionId}`, {
    windowMs: 60_000,
    max: 4
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again soon." },
      { status: 429, headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
    );
  }

  try {
    const cached = artistsCache.get(sessionId);
    if (cached && cached.expiresAt > Date.now()) {
      const res = NextResponse.json(cached.payload, {
        headers: {
          ...rateLimitHeaders(limit.remaining, limit.resetAt),
          "x-cache": "hit"
        }
      });
      attachSessionCookie(res, sessionId, isNew);
      return res;
    }

    const accessToken = await getValidAccessToken(sessionId);
    const playlists = await fetchAllPlaylists(accessToken);

    const trackMap = new Map<
      string,
      {
        track: SpotifyTrack;
        playlistNames: Set<string>;
      }
    >();

    // Collect tracks from each playlist (sequential to avoid rate limits).
    for (const playlist of playlists) {
      const playlistTracks = await fetchAllPlaylistTracks(accessToken, playlist.id);
      for (const track of playlistTracks) {
        const entry = trackMap.get(track.id) ?? {
          track,
          playlistNames: new Set<string>()
        };
        entry.playlistNames.add(playlist.name);
        trackMap.set(track.id, entry);
      }
    }

    // Add liked tracks and tag them with a virtual playlist label.
    const likedTracks = await fetchAllLikedTracks(accessToken);
    for (const track of likedTracks) {
      const entry = trackMap.get(track.id) ?? {
        track,
        playlistNames: new Set<string>()
      };
      entry.playlistNames.add("Liked songs");
      trackMap.set(track.id, entry);
    }

    const tracks = Array.from(trackMap.values()).map((entry) => ({
      id: entry.track.id,
      name: entry.track.name,
      artists: entry.track.artists,
      album: entry.track.album,
      spotifyUrl: entry.track.external_urls?.spotify ?? null,
      durationMs: entry.track.duration_ms,
      playlistNames: Array.from(entry.playlistNames).sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" })
      )
    }));

    const artists = Array.from(
      new Map(
        tracks
          .flatMap((track) => track.artists)
          .map((artist) => [artist.id, artist.name])
      ).entries()
    )
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

    const payload: ArtistsPayload = { artists, tracks };
    artistsCache.set(sessionId, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    const res = NextResponse.json(payload, {
      headers: rateLimitHeaders(limit.remaining, limit.resetAt)
    });
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
