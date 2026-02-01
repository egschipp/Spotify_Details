import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getSpotifyUserId, getValidAccessToken, spotifyFetch } from "@/lib/spotify/spotifyClient";
import {
  acquireLock,
  CacheEnvelope,
  getMemoryCache,
  readDiskCache,
  releaseLock,
  setMemoryCache,
  singleFlight,
  writeDiskCache
} from "@/lib/cache/cacheStore";
import { incCounter } from "@/lib/cache/cacheMetrics";
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

const MAX_RETRIES = 3;
const RETRY_FALLBACK_MS = 1500;
const PLAYLISTS_TTL_MS = Number(process.env.SPOTIFY_PLAYLISTS_TTL_MS ?? 30 * 60 * 1000);
const PLAYLISTS_SWR_MS = Number(process.env.SPOTIFY_PLAYLISTS_SWR_MS ?? 6 * 60 * 60 * 1000);
const CACHE_VERSION = 1;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getCacheKey(userId: string) {
  return `v${CACHE_VERSION}:${userId}:playlists:index`;
}

function getCacheState(ageMs: number) {
  if (ageMs < PLAYLISTS_TTL_MS) return "ok";
  if (ageMs < PLAYLISTS_TTL_MS + PLAYLISTS_SWR_MS) return "stale";
  return "expired";
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
  const userId = await getSpotifyUserId(sessionId);
  const cacheKey = getCacheKey(userId);
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
    const memory = getMemoryCache<any>(cacheKey);
    if (memory) {
      const res = NextResponse.json(memory.payload, {
        headers: {
          ...rateLimitHeaders(limit.remaining, limit.resetAt),
          "x-cache": "hit"
        }
      });
      attachSessionCookie(res, sessionId, isNew);
      return res;
    }

    const diskEnvelope = await readDiskCache<any>(cacheKey);
    if (diskEnvelope) {
      const updatedAt = new Date(diskEnvelope.updatedAt).getTime();
      const ageMs = Date.now() - updatedAt;
      const state = getCacheState(ageMs);
      if (state === "ok") {
        incCounter("hit");
        setMemoryCache(cacheKey, diskEnvelope.payload, PLAYLISTS_TTL_MS, {
          updatedAt: diskEnvelope.updatedAt,
          state: "ok",
          lastGoodAt: diskEnvelope.lastGoodAt
        });
        const res = NextResponse.json(diskEnvelope.payload, {
          headers: {
            ...rateLimitHeaders(limit.remaining, limit.resetAt),
            "x-cache": "hit"
          }
        });
        attachSessionCookie(res, sessionId, isNew);
        return res;
      }

      if (state === "stale" && !asyncMode) {
        incCounter("stale");
        void singleFlight(cacheKey, async () => {
          const lockAcquired = await acquireLock(cacheKey);
          if (!lockAcquired) return;
          try {
            await refreshPlaylistsCache(cacheKey, sessionId);
          } finally {
            await releaseLock(cacheKey);
          }
        });
        const res = NextResponse.json(
          {
            ...diskEnvelope.payload,
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

    if (asyncMode) {
      incCounter("miss");
      void singleFlight(cacheKey, async () => {
        const lockAcquired = await acquireLock(cacheKey);
        if (!lockAcquired) return;
        try {
          await refreshPlaylistsCache(cacheKey, sessionId);
        } finally {
          await releaseLock(cacheKey);
        }
      });
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
    setMemoryCache(cacheKey, payload, PLAYLISTS_TTL_MS, {
      updatedAt: payload.updatedAt,
      state: "ok",
      lastGoodAt: payload.updatedAt
    });
    await writeDiskCache(cacheKey, {
      version: CACHE_VERSION,
      updatedAt: payload.updatedAt,
      checksum: "",
      payload: { ...payload, state: "ok", lastGoodAt: payload.updatedAt }
    } as CacheEnvelope<any>);
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
    setMemoryCache(cacheKey, payload, PLAYLISTS_TTL_MS, {
      updatedAt: payload.updatedAt,
      state: "ok",
      lastGoodAt: payload.updatedAt
    });
    await writeDiskCache(cacheKey, {
      version: CACHE_VERSION,
      updatedAt: payload.updatedAt,
      checksum: "",
      payload
    } as CacheEnvelope<any>);
    incCounter("refresh");
  } catch (error) {
    const message = (error as Error).message;
    const errorCode = message.includes("auth")
      ? "auth_required"
      : message.includes("credentials")
        ? "credentials_missing"
        : message.includes("429")
          ? "rate_limit"
          : "error";
    if (errorCode === "auth_required") {
      await clearSession(sessionId);
    }
    const payload = {
      total: 0,
      playlists: [],
      updatedAt: new Date().toISOString(),
      cacheStatus: "stale",
      syncStatus: "error",
      state: "error",
      errorCode,
      errorMessage: message
    };
    setMemoryCache(cacheKey, payload, PLAYLISTS_TTL_MS, {
      updatedAt: payload.updatedAt,
      state: "error"
    });
    await writeDiskCache(cacheKey, {
      version: CACHE_VERSION,
      updatedAt: payload.updatedAt,
      checksum: "",
      payload
    } as CacheEnvelope<any>);
    incCounter("error");
  }
}
