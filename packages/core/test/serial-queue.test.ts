import { describe, expect, it } from 'vitest';
import { SerialQueue } from '../src/serial-queue.js';

describe('SerialQueue', () => {
  it('runs tasks in submission order', async () => {
    const q = new SerialQueue();
    const calls: number[] = [];

    const a = q.enqueue(async () => {
      await new Promise<void>((r) => setTimeout(r, 30));
      calls.push(1);
      return 1;
    });
    const b = q.enqueue(async () => {
      await new Promise<void>((r) => setTimeout(r, 5));
      calls.push(2);
      return 2;
    });
    const c = q.enqueue(async () => {
      calls.push(3);
      return 3;
    });

    const results = await Promise.all([a, b, c]);
    expect(results).toEqual([1, 2, 3]);
    expect(calls).toEqual([1, 2, 3]);
  });

  it('continues running subsequent tasks when one rejects', async () => {
    const q = new SerialQueue();
    const calls: string[] = [];

    const a = q.enqueue(async () => {
      throw new Error('a-failed');
    });
    const b = q.enqueue(async () => {
      calls.push('b');
      return 'b';
    });

    await expect(a).rejects.toThrow('a-failed');
    await expect(b).resolves.toBe('b');
    expect(calls).toEqual(['b']);
  });

  it('drain() waits for the queue to empty', async () => {
    const q = new SerialQueue();
    const finished: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      void q.enqueue(async () => {
        await new Promise<void>((r) => setTimeout(r, 5));
        finished.push(i);
      });
    }

    await q.drain();
    expect(finished).toEqual([0, 1, 2, 3, 4]);
    expect(q.size).toBe(0);
  });
});
