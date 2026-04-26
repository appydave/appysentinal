import { describe, expect, it, vi } from 'vitest';
import { createLifecycle } from '../src/lifecycle.js';

describe('Lifecycle', () => {
  it('runs start hooks in order, stop hooks in reverse', async () => {
    const lc = createLifecycle({ installSignalHandlers: false });
    const order: string[] = [];

    lc.onStart(() => {
      order.push('start-a');
    });
    lc.onStart(() => {
      order.push('start-b');
    });
    lc.onStop(() => {
      order.push('stop-a');
    });
    lc.onStop(() => {
      order.push('stop-b');
    });

    await lc.start();
    await lc.stop('manual');

    expect(order).toEqual(['start-a', 'start-b', 'stop-b', 'stop-a']);
  });

  it('reports health correctly across the state machine', async () => {
    const lc = createLifecycle({ installSignalHandlers: false });
    expect(lc.health().status).toBe('idle');

    await lc.start();
    expect(lc.health().status).toBe('running');
    expect(lc.health().startedAt).toBeDefined();

    await lc.stop();
    expect(lc.health().status).toBe('stopped');
    expect(lc.health().stoppedAt).toBeDefined();
  });

  it('stop is idempotent', async () => {
    const lc = createLifecycle({ installSignalHandlers: false });
    const stopHook = vi.fn();
    lc.onStop(stopHook);

    await lc.start();
    await lc.stop();
    await lc.stop();
    await lc.stop();

    expect(stopHook).toHaveBeenCalledTimes(1);
  });

  it('continues stopping when a hook throws', async () => {
    const lc = createLifecycle({ installSignalHandlers: false });
    const seen: string[] = [];

    lc.onStop(() => {
      seen.push('a');
    });
    lc.onStop(() => {
      throw new Error('boom');
    });
    lc.onStop(() => {
      seen.push('c');
    });

    await lc.start();
    await lc.stop();
    expect(seen).toEqual(['c', 'a']); // reverse order, error in middle is swallowed
  });

  it('reload runs reload hooks only when running', async () => {
    const lc = createLifecycle({ installSignalHandlers: false });
    const hook = vi.fn();
    lc.onReload(hook);

    await lc.reload();
    expect(hook).not.toHaveBeenCalled();

    await lc.start();
    await lc.reload();
    expect(hook).toHaveBeenCalledTimes(1);
  });
});
