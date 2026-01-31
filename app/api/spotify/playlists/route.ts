import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getSpotifyUserId, getValidAccessToken, spotifyFetch } from "@/lib/spotify/spotifyClient";
import { clearSession } from "@/lib/storage/sessionStore";
import { rateLimit, rateLimitHeaders } from "@/lib/security/rateLimit";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

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

const MAX_RETRIES = 3;
const RETRY_FALLBACK_MS = 1500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const playlistsCache = new Map<string, { expiresAt: number; payload: any }>();
const refreshLocks = new Map<string, Promise<void>>();
const CACHE_VERSION = 1;
const CACHE_FOLDER = "cache";

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getCacheDir() {
  const base = process.env.SPOTIFY_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(base, CACHE_FOLDER);
}

function getCachePath(cacheKey: string) {
  return path.join(getCacheDir(), `playlists-${cacheKey}.json`);
}

async function readCache(cacheKey: string): Promise<any | null> {
  try {
    const data = await fs.readFile(getCachePath(cacheKey), "utf8");
    const parsed = JSON.parse(data);
    if (parsed?.payload) {
      const checksum = crypto
        .createHash("sha256")
        .update(JSON.stringify(parsed.payload))
        .digest("hex");
      if (parsed.checksum && parsed.checksum !== checksum) {
        return null;
      }
      return parsed.payload;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(cacheKey: string, payload: any) {
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

async function spotifyFetchWithRetry(path: string, accessToken: string) {
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

async function fetchAllPlaylists(accessToken: string) {
  const items: SpotifyPlaylistItem[] = [];
  let offset = 0;
  const limit = 50;
  let next: string | null = null;

  do {
    const response = await spotifyFetchWithRetry(
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
  const cacheKey = await getSpotifyUserId(sessionId);
  const url = new URL(req.url);
  const asyncMode = url.searchParams.get("async") === "1";
  const limit = rateLimit(`playlists:${sessionId}`, {
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
    const diskCache = await readCache(cacheKey);
    if (diskCache) {
      const updatedAt = new Date(diskCache.updatedAt).getTime();
      const isFresh = Date.now() - updatedAt < CACHE_TTL_MS;
      if (isFresh) {
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
        const refreshPromise = refreshPlaylistsCache(cacheKey, sessionId).finally(() => {
          refreshLocks.delete(cacheKey);
        });
        refreshLocks.set(cacheKey, refreshPromise);
      }
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

    const cached = playlistsCache.get(cacheKey);
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

    if (asyncMode) {
      if (!refreshLocks.has(cacheKey)) {
        const refreshPromise = refreshPlaylistsCache(cacheKey, sessionId).finally(() => {
          refreshLocks.delete(cacheKey);
        });
        refreshLocks.set(cacheKey, refreshPromise);
      }
      const res = NextResponse.json(
        {
          total: 0,
          playlists: [],
          updatedAt: new Date().toISOString(),
          cacheStatus: "miss",
          syncStatus: "syncing",
          state: "refreshing",
          refreshStartedAt: new Date().toISOString()
        },
        { headers: rateLimitHeaders(limit.remaining, limit.resetAt) }
      );
      attachSessionCookie(res, sessionId, isNew);
      return res;
    }

    const payload = await buildPlaylistsPayload(sessionId);
    const res = NextResponse.json(payload, {
      headers: rateLimitHeaders(limit.remaining, limit.resetAt)
    });
    playlistsCache.set(cacheKey, {
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

async function buildPlaylistsPayload(sessionId: string) {
  const accessToken = await getValidAccessToken(sessionId);
  const playlists = await fetchAllPlaylists(accessToken);
  return {
    total: playlists.length,
    playlists: playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      images: playlist.images,
      trackCount: playlist.tracks.total,
      owner: playlist.owner.display_name ?? playlist.owner.id,
      spotifyUrl: playlist.external_urls?.spotify ?? null
    })),
    updatedAt: new Date().toISOString(),
    cacheStatus: "miss",
    syncStatus: "ok",
    state: "ok",
    lastGoodAt: new Date().toISOString()
  };
}

async function refreshPlaylistsCache(cacheKey: string, sessionId: string) {
  try {
    const payload = await buildPlaylistsPayload(sessionId);
    playlistsCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    await writeCache(cacheKey, payload);
  } catch {
    const payload = {
      total: 0,
      playlists: [],
      updatedAt: new Date().toISOString(),
      cacheStatus: "stale",
      syncStatus: "error",
      state: "error"
    };
    playlistsCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    await writeCache(cacheKey, payload);
  }
}
