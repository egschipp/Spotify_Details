export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) {
        return;
      }
      results.push(await mapper(item));
    }
  });

  await Promise.all(workers);
  return results;
}
