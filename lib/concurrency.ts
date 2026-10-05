import "server-only";
import pLimit from "p-limit";

const limiters = new Map<string, ReturnType<typeof pLimit>>();

/** Per-service bounded concurrency (shared across the process). */
export function limiter(name: string, concurrency: number) {
  let l = limiters.get(name);
  if (!l) {
    l = pLimit(concurrency);
    limiters.set(name, l);
  }
  return l;
}

/** Map with bounded concurrency, preserving order. Failures become `{ error }` entries. */
export async function mapSettled<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<({ ok: true; value: R } | { ok: false; error: unknown; item: T })[]> {
  const run = pLimit(concurrency);
  return Promise.all(
    items.map((item, i) =>
      run(async () => {
        try {
          return { ok: true as const, value: await fn(item, i) };
        } catch (error) {
          return { ok: false as const, error, item };
        }
      }),
    ),
  );
}
