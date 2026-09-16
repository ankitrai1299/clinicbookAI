// Run independent async work several at a time, in order.
//
// Written for one recurring shape: a long consultation is cut into chunks and
// every chunk is sent to the model. The chunks do not depend on each other, so
// waiting for each one before starting the next spends the doctor's time for
// nothing — a five minute consultation queued six model calls end to end and
// the request died at 186 seconds without producing a report.
//
// Promise.all alone is not the answer either: a fifteen minute consultation
// would fire twenty calls at once and be rate limited, which fails the same
// consultation a different way. So: a few at a time.
//
// Results come back in the order of the input, never the order they finished.
// A transcript reassembled in completion order is a shuffled consultation.

/** Map over `items` with at most `limit` running at once, preserving order. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}
