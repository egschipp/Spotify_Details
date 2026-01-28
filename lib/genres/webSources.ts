import { readJsonFile, writeJsonFile } from "@/lib/storage/storageUtils";

const CACHE_FILE = "web-text-cache.json";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type WebTextResult = {
  text: string;
  sources: string[];
};

type CacheEntry = WebTextResult & { fetchedAt: string };

type CacheMap = Record<string, CacheEntry>;

let cacheLock: Promise<void> = Promise.resolve();

async function withCacheLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = cacheLock;
  let release: () => void;
  cacheLock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release?.();
  }
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");
}

function cacheKey(trackName: string, artistName: string) {
  return `track::${normalize(artistName)}::${normalize(trackName)}`;
}

async function readCache() {
  try {
    return await readJsonFile<CacheMap>(CACHE_FILE, {});
  } catch {
    await writeJsonFile(CACHE_FILE, {});
    return {};
  }
}

async function writeCache(cache: CacheMap) {
  await writeJsonFile(CACHE_FILE, cache);
}

async function getCached(cache: CacheMap, key: string) {
  const entry = cache[key];
  if (!entry) {
    return null;
  }
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  if (age > CACHE_TTL_MS) {
    return null;
  }
  return { text: entry.text, sources: entry.sources };
}

async function setCached(cache: CacheMap, key: string, value: WebTextResult) {
  cache[key] = { ...value, fetchedAt: new Date().toISOString() };
  await writeCache(cache);
}

async function fetchWikipediaSummaryByTitle(
  title: string
): Promise<WebTextResult | null> {
  const summaryResponse = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`
  );
  if (!summaryResponse.ok) {
    return null;
  }
  const summaryData = (await summaryResponse.json()) as {
    extract?: string;
  };
  if (!summaryData.extract) {
    return null;
  }
  return { text: summaryData.extract, sources: ["wikipedia"] };
}

async function fetchWikipediaSummary(query: string): Promise<WebTextResult | null> {
  try {
    const searchParams = new URLSearchParams({
      action: "opensearch",
      search: query,
      limit: "1",
      namespace: "0",
      format: "json"
    });

    const searchResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?${searchParams}`
    );
    if (!searchResponse.ok) {
      return null;
    }
    const searchData = (await searchResponse.json()) as [
      string,
      string[],
      string[],
      string[]
    ];
    const title = searchData[1]?.[0];
    if (!title) {
      return null;
    }

    return await fetchWikipediaSummaryByTitle(title);
  } catch {
    return null;
  }
}

async function fetchMusicBrainzText(
  trackName: string,
  artistName: string
): Promise<WebTextResult | null> {
  try {
    const query = `recording:"${trackName}" AND artist:"${artistName}"`;
    const searchParams = new URLSearchParams({
      query,
      fmt: "json",
      limit: "1",
      inc: "tags"
    });
    const response = await fetch(
      `https://musicbrainz.org/ws/2/recording?${searchParams.toString()}`,
      {
        headers: {
          "User-Agent": "SpotifyDetails/1.0 (no-reply@example.com)"
        }
      }
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      recordings?: {
        title?: string;
        disambiguation?: string;
        tags?: { name: string }[];
      }[];
    };
    const recording = data.recordings?.[0];
    if (!recording) {
      return null;
    }
    const tags = recording.tags?.map((tag) => tag.name).join(" ") ?? "";
    const textParts = [recording.title, recording.disambiguation, tags].filter(
      Boolean
    );
    if (!textParts.length) {
      return null;
    }
    return { text: textParts.join(" "), sources: ["musicbrainz"] };
  } catch {
    return null;
  }
}

export async function fetchWebText(
  trackName: string,
  artistName: string
): Promise<WebTextResult> {
  if (!trackName || !artistName) {
    return { text: "", sources: [] };
  }
  const key = cacheKey(trackName, artistName);
  const cached = await withCacheLock(async () => {
    const cache = await readCache();
    return getCached(cache, key);
  });
  if (cached) {
    return cached;
  }

  const sources: string[] = [];
  const texts: string[] = [];

  const [wiki, mb] = await Promise.all([
    fetchWikipediaSummary(artistName),
    fetchMusicBrainzText(trackName, artistName)
  ]);

  if (wiki?.text) {
    texts.push(wiki.text);
    sources.push(...wiki.sources);
  }
  if (mb?.text) {
    texts.push(mb.text);
    sources.push(...mb.sources);
  }

  const result = {
    text: texts.join(" \n ").trim(),
    sources
  };

  return withCacheLock(async () => {
    const cache = await readCache();
    const latest = await getCached(cache, key);
    if (latest) {
      return latest;
    }
    await setCached(cache, key, result);
    return result;
  });
}
