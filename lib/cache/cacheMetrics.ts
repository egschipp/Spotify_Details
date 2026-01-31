type CounterKey =
  | "hit"
  | "stale"
  | "miss"
  | "refresh"
  | "error"
  | "spotify429"
  | "read"
  | "write"
  | "evict";

const counters: Record<CounterKey, number> = {
  hit: 0,
  stale: 0,
  miss: 0,
  refresh: 0,
  error: 0,
  spotify429: 0,
  read: 0,
  write: 0,
  evict: 0
};

export function incCounter(key: CounterKey, value = 1) {
  counters[key] = (counters[key] ?? 0) + value;
}

export function snapshotCounters() {
  return { ...counters };
}
