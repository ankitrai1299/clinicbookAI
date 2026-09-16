import { describe, it, expect } from 'vitest';

import { mapPool } from './pool';

describe('mapPool', () => {
  it('returns results in input order, not completion order', async () => {
    // The whole point. A transcript reassembled in completion order is a
    // shuffled consultation.
    const delays = [40, 5, 25, 1];
    const out = await mapPool(delays, 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it('never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('runs concurrently rather than one after another', async () => {
    const started = Date.now();
    await mapPool([1, 2, 3, 4], 4, async () => {
      await new Promise((r) => setTimeout(r, 60));
      return null;
    });
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('handles an empty list and a silly limit', async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
    expect(await mapPool([1, 2], 0, async (n) => n * 2)).toEqual([2, 4]);
  });

  it('surfaces a failure instead of returning a half-filled list', async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('chunk failed');
        return n;
      }),
    ).rejects.toThrow('chunk failed');
  });
});
