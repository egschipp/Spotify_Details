import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getDataDir } from "@/lib/storage/storageUtils";
import { incCounter } from "./cacheMetrics";

export type CacheState = "ok" | "stale" | "refreshing" | "error";

export type CacheEnvelope<T> = {
  version: number;
  updatedAt: string;
  checksum: string;
  payload: T;
  state?: CacheState;
  lastGoodAt?: string;
  refreshStartedAt?: string;
  errorCode?: string;
  retryAfterMs?: number;
};

type MemoryEntry<T> = {
  payload: T;
  updatedAt: string;
  expiresAt: number;
  lastAccessAt: number;
  state?: CacheState;
  lastGoodAt?: string;
  refreshStartedAt?: string;
  errorCode?: string;
  retryAfterMs?: number;
};

type DiskIndex = Record<
  string,
  { size: number; updatedAt: string; lastAccessAt: number }
>;

const CACHE_VERSION = 1;
const memoryCache = new Map<string, MemoryEntry<any>>();
const inflight = new Map<string, Promise<void>>();

const MAX_MEMORY_ITEMS = Number(process.env.SPOTIFY_CACHE_MAX_MEMORY_ITEMS ?? 50);
const MAX_DISK_BYTES = Number(process.env.SPOTIFY_CACHE_MAX_DISK_BYTES ?? 300 * 1024 * 1024);
const LOCK_LEASE_MS = Number(process.env.SPOTIFY_CACHE_LOCK_LEASE_MS ?? 120000);

export function getCacheDir() {
  return path.join(getDataDir(), "cache");
}

function getIndexPath() {
  return path.join(getCacheDir(), "index.json");
}

function getCachePath(cacheKey: string) {
  return path.join(getCacheDir(), `${cacheKey}.json`);
}

function getLockPath(cacheKey: string) {
  return path.join(getCacheDir(), `${cacheKey}.lock`);
}

function computeChecksum(payload: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function readIndex(): Promise<DiskIndex> {
  try {
    const raw = await fs.readFile(getIndexPath(), "utf8");
    return JSON.parse(raw) as DiskIndex;
  } catch {
    return {};
  }
}

async function writeIndex(index: DiskIndex) {
  await fs.mkdir(getCacheDir(), { recursive: true });
  await fs.writeFile(getIndexPath(), JSON.stringify(index), "utf8");
}

async function evictIfNeeded(index: DiskIndex) {
  const entries = Object.entries(index);
  let total = entries.reduce((sum, [, meta]) => sum + meta.size, 0);
  if (total <= MAX_DISK_BYTES) return;

  const sorted = entries.sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
  for (const [key, meta] of sorted) {
    if (total <= MAX_DISK_BYTES) break;
    try {
      await fs.unlink(getCachePath(key));
    } catch {
      // ignore
    }
    delete index[key];
    total -= meta.size;
    incCounter("evict");
  }
  await writeIndex(index);
}

function touchMemoryKey(cacheKey: string) {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return;
  entry.lastAccessAt = Date.now();
  memoryCache.set(cacheKey, entry);
}

function enforceMemoryLimit() {
  if (memoryCache.size <= MAX_MEMORY_ITEMS) return;
  const items = Array.from(memoryCache.entries()).sort(
    (a, b) => a[1].lastAccessAt - b[1].lastAccessAt
  );
  const toRemove = memoryCache.size - MAX_MEMORY_ITEMS;
  for (let i = 0; i < toRemove; i += 1) {
    memoryCache.delete(items[i][0]);
  }
}

export function getMemoryCache<T>(cacheKey: string): MemoryEntry<T> | null {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryCache.delete(cacheKey);
    return null;
  }
  touchMemoryKey(cacheKey);
  incCounter("hit");
  return entry as MemoryEntry<T>;
}

export function setMemoryCache<T>(
  cacheKey: string,
  payload: T,
  ttlMs: number,
  meta?: Partial<MemoryEntry<T>>
) {
  memoryCache.set(cacheKey, {
    payload,
    updatedAt: meta?.updatedAt ?? new Date().toISOString(),
    expiresAt: Date.now() + ttlMs,
    lastAccessAt: Date.now(),
    state: meta?.state,
    lastGoodAt: meta?.lastGoodAt,
    refreshStartedAt: meta?.refreshStartedAt,
    errorCode: meta?.errorCode,
    retryAfterMs: meta?.retryAfterMs
  });
  enforceMemoryLimit();
}

export async function readDiskCache<T>(cacheKey: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await fs.readFile(getCachePath(cacheKey), "utf8");
    const parsed = JSON.parse(raw) as CacheEnvelope<T> | { payload: T };
    const envelope =
      "payload" in parsed
        ? (parsed as CacheEnvelope<T>)
        : ({
            version: CACHE_VERSION,
            updatedAt: new Date().toISOString(),
            checksum: computeChecksum(parsed),
            payload: parsed
          } as CacheEnvelope<T>);
    const checksum = computeChecksum(envelope.payload);
    if (envelope.checksum && envelope.checksum !== checksum) {
      return null;
    }
    incCounter("read");
    return envelope;
  } catch {
    return null;
  }
}

export async function writeDiskCache<T>(cacheKey: string, envelope: CacheEnvelope<T>) {
  await fs.mkdir(getCacheDir(), { recursive: true });
  const payload = {
    ...envelope,
    version: CACHE_VERSION,
    checksum: envelope.checksum || computeChecksum(envelope.payload)
  };
  const target = getCachePath(cacheKey);
  const tmp = `${target}.tmp`;
  const json = JSON.stringify(payload);
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, target);
  incCounter("write");

  const stats = await fs.stat(target);
  const index = await readIndex();
  index[cacheKey] = {
    size: stats.size,
    updatedAt: payload.updatedAt,
    lastAccessAt: Date.now()
  };
  await writeIndex(index);
  await evictIfNeeded(index);
}

export async function acquireLock(cacheKey: string) {
  const lockPath = getLockPath(cacheKey);
  const now = Date.now();
  try {
    const raw = await fs.readFile(lockPath, "utf8");
    const lock = JSON.parse(raw) as { expiresAt: number };
    if (lock.expiresAt > now) {
      return false;
    }
  } catch {
    // ignore
  }
  const payload = { ownerId: crypto.randomUUID(), acquiredAt: now, expiresAt: now + LOCK_LEASE_MS };
  await fs.writeFile(lockPath, JSON.stringify(payload), "utf8");
  return true;
}

export async function releaseLock(cacheKey: string) {
  try {
    await fs.unlink(getLockPath(cacheKey));
  } catch {
    // ignore
  }
}

export function isInflight(cacheKey: string): boolean {
  return inflight.has(cacheKey);
}

export async function getLockInfo(cacheKey: string): Promise<{
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
} | null> {
  try {
    const raw = await fs.readFile(getLockPath(cacheKey), "utf8");
    const lock = JSON.parse(raw) as {
      ownerId?: string;
      acquiredAt?: number;
      expiresAt?: number;
    };
    if (!lock.ownerId || !lock.acquiredAt || !lock.expiresAt) {
      return null;
    }
    return {
      ownerId: lock.ownerId,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt
    };
  } catch {
    return null;
  }
}

export async function singleFlight(cacheKey: string, fn: () => Promise<void>) {
  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey);
  }
  const promise = fn().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, promise);
  return promise;
}
