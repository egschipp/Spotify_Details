import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getSpotifyUserId, getValidAccessToken, spotifyFetch } from "@/lib/spotify/spotifyClient";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

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
    playlistRefs: { id: string; name: string; url: string }[];
    uri: string;
  }[];
  updatedAt: string;
  cacheStatus?: "fresh" | "stale" | "miss";
  syncStatus?: "ok" | "syncing" | "error";
  state?: "ok" | "stale" | "refreshing" | "error";
  lastGoodAt?: string;
  refreshStartedAt?: string;
  errorCode?: string;
  retryAfterMs?: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const artistsCache = new Map<string, { expiresAt: number; payload: ArtistsPayload }>();
const refreshLocks = new Map<string, Promise<void>>();
const CACHE_VERSION = 1;
const MAX_RETRIES = 3;
const RETRY_FALLBACK_MS = 1500;
const CACHE_FOLDER = "cache";

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getCacheDir() {
  const base = process.env.SPOTIFY_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(base, CACHE_FOLDER);
}

function getCachePath(cacheKey: string) {
  return path.join(getCacheDir(), `artists-${cacheKey}.json`);
}

async function readCache(cacheKey: string): Promise<ArtistsPayload | null> {
  try {
    const data = await fs.readFile(getCachePath(cacheKey), "utf8");
    const parsed = JSON.parse(data);
    if (parsed?.payload) {
      const payload = parsed.payload as ArtistsPayload;
      const checksum = crypto
        .createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
      if (parsed.checksum && parsed.checksum !== checksum) {
        return null;
      }
      return payload;
    }
    return parsed as ArtistsPayload;
  } catch {
    return null;
  }
}

async function writeCache(cacheKey: string, payload: ArtistsPayload) {
  await fs.mkdir(getCacheDir(), { recursive: true });
  const checksum = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const envelope = {
    version: CACHE_VERSION,
    updatedAt: payload.updatedAt,
    checksum,
    payload
  };
  const target = getCachePath(cacheKey);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(envelope), "utf8");
  await fs.rename(tmp, target);
}

async function spotifyFetchWithRetry(
  path: string,
  accessToken: string
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const response = await spotifyFetch(path, accessToken);
    if (response.status !== 429 || attempt >= MAX_RETRIES) {
      return response;
    }
    const retryAfter = response.headers.get("retry-after");
    const waitMs = retryAfter
      ? Number(retryAfter) * 1000
      : RETRY_FALLBACK_MS * (attempt + 1);
    await sleep(waitMs);
    attempt += 1;
  }
}

async function fetchAllPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const items: SpotifyPlaylist[] = [];
  let next: string | null = `/me/playlists?limit=50`;
  while (next) {
    const response = await spotifyFetchWithRetry(next, accessToken);
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
    const response = await spotifyFetchWithRetry(next, accessToken);
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
    const response = await spotifyFetchWithRetry(next, accessToken);
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
  const cacheKey = await getSpotifyUserId(sessionId);
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("force") === "1";
  const asyncMode = url.searchParams.get("async") === "1";
  const limit = rateLimit(`artists:${sessionId}`, {
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
    const diskCache = await readCache(cacheKey);
    if (diskCache) {
      const updatedAt = new Date(diskCache.updatedAt).getTime();
      const isFresh = Date.now() - updatedAt < CACHE_TTL_MS;
      if (isFresh && !forceRefresh) {
        const res = NextResponse.json(diskCache, {
          headers: {
            ...rateLimitHeaders(limit.remaining, limit.resetAt),
            "x-cache": "hit"
          }
        });
        attachSessionCookie(res, sessionId, isNew);
        return res;
      }
      if (!refreshLocks.has(cacheKey)) {
        const refreshPromise = refreshArtistsCache(cacheKey, sessionId).finally(() => {
          refreshLocks.delete(cacheKey);
        });
        refreshLocks.set(cacheKey, refreshPromise);
      }
      if (!forceRefresh) {
        const res = NextResponse.json(
          {
            ...diskCache,
            cacheStatus: "stale",
            syncStatus: "syncing",
            state: "stale",
            refreshStartedAt: new Date().toISOString()
          },
          {
            headers: {
              ...rateLimitHeaders(limit.remaining, limit.resetAt),
              "x-cache": "stale"
            }
          }
        );
        attachSessionCookie(res, sessionId, isNew);
        return res;
      }
    }

    const cached = artistsCache.get(cacheKey);
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

    if (asyncMode && !forceRefresh) {
      if (!refreshLocks.has(cacheKey)) {
        const refreshPromise = refreshArtistsCache(cacheKey, sessionId).finally(() => {
          refreshLocks.delete(cacheKey);
        });
        refreshLocks.set(cacheKey, refreshPromise);
      }
      const res = NextResponse.json(
        {
          artists: [],
          tracks: [],
          updatedAt: new Date().toISOString(),
          cacheStatus: "miss",
          syncStatus: "syncing",
          state: "refreshing",
          refreshStartedAt: new Date().toISOString()
        },
        {
          headers: rateLimitHeaders(limit.remaining, limit.resetAt)
        }
      );
      attachSessionCookie(res, sessionId, isNew);
      return res;
    }

    const payload = await buildArtistsPayload(sessionId);
    const res = NextResponse.json(
      {
        ...payload,
        cacheStatus: "miss",
        syncStatus: "ok",
        state: "ok",
        lastGoodAt: payload.updatedAt
      },
      {
        headers: rateLimitHeaders(limit.remaining, limit.resetAt)
      }
    );
    artistsCache.set(cacheKey, {
      payload: { ...payload, state: "ok", lastGoodAt: payload.updatedAt },
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    await writeCache(cacheKey, {
      ...payload,
      state: "ok",
      lastGoodAt: payload.updatedAt
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
    const res = NextResponse.json(
      {
        error: message,
        syncStatus: "error",
        state: "error",
        errorCode: status === 429 ? "rate_limit" : "error"
      },
      { status }
    );
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }
}

async function buildArtistsPayload(sessionId: string): Promise<ArtistsPayload> {
  const accessToken = await getValidAccessToken(sessionId);
  const playlists = await fetchAllPlaylists(accessToken);

  const trackMap = new Map<
    string,
    {
      track: SpotifyTrack;
      playlistNames: Set<string>;
      playlistRefs: Map<string, { id: string; name: string; url: string }>;
    }
  >();

  // Collect tracks from each playlist (sequential to avoid rate limits).
  for (const playlist of playlists) {
    const playlistTracks = await fetchAllPlaylistTracks(accessToken, playlist.id);
    for (const track of playlistTracks) {
      const entry = trackMap.get(track.id) ?? {
        track,
        playlistNames: new Set<string>(),
        playlistRefs: new Map<string, { id: string; name: string; url: string }>()
      };
      entry.playlistNames.add(playlist.name);
      entry.playlistRefs.set(playlist.id, {
        id: playlist.id,
        name: playlist.name,
        url: `https://open.spotify.com/playlist/${playlist.id}`
      });
      trackMap.set(track.id, entry);
    }
  }

  // Add liked tracks and tag them with a virtual playlist label.
  const likedTracks = await fetchAllLikedTracks(accessToken);
  for (const track of likedTracks) {
    const entry = trackMap.get(track.id) ?? {
      track,
      playlistNames: new Set<string>(),
      playlistRefs: new Map<string, { id: string; name: string; url: string }>()
    };
    entry.playlistNames.add("Liked songs");
    entry.playlistRefs.set("liked", {
      id: "liked",
      name: "Liked songs",
      url: "https://open.spotify.com/collection/tracks"
    });
    trackMap.set(track.id, entry);
  }

  const tracks = Array.from(trackMap.values()).map((entry) => ({
    id: entry.track.id,
    name: entry.track.name,
    artists: entry.track.artists,
    album: entry.track.album,
    spotifyUrl: entry.track.external_urls?.spotify ?? null,
    durationMs: entry.track.duration_ms,
    uri: entry.track.uri,
    playlistRefs: Array.from(entry.playlistRefs.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" })
    ),
    playlistNames: Array.from(entry.playlistNames)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
  }));

  const artists = Array.from(
    new Map(
      tracks
        .flatMap((track) => track.artists)
        .filter((artist) => artist?.id && artist?.name)
        .map((artist) => [artist.id, artist.name])
    ).entries()
  )
    .map(([id, name]) => ({ id, name: name ?? "Unknown artist" }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const payload: ArtistsPayload = {
    artists,
    tracks,
    updatedAt: new Date().toISOString()
  };
  const cacheKey = await getSpotifyUserId(sessionId);
  artistsCache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  await writeCache(cacheKey, payload);
  return payload;
}

async function refreshArtistsCache(cacheKey: string, sessionId: string) {
  try {
    await buildArtistsPayload(sessionId);
  } catch {
    const payload: ArtistsPayload = {
      artists: [],
      tracks: [],
      updatedAt: new Date().toISOString(),
      cacheStatus: "stale",
      syncStatus: "error",
      state: "error"
    };
    artistsCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    await writeCache(cacheKey, payload);
  }
}
