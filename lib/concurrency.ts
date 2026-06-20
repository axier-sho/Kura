/**
 * Run an async mapper over `items` with at most `limit` tasks in flight at once,
 * returning results in input order. A small worker-pool with no dependency, used
 * to parallelize the network-bound, mutually-independent per-file ingest
 * pipeline (each file is its own Gemini round-trip).
 *
 * Errors propagate: if `fn` rejects for any item, the returned promise rejects.
 * Callers that must not abort the batch on one failure should have `fn` catch
 * and return an error-shaped result instead of throwing.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length || 1));
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
