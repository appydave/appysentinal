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

  it('health report includes hook counts and uptimeMs when running', async () => {
    const lc = createLifecycle({ installSignalHandlers: false });
    lc.onStart(() => {});
    lc.onStop(() => {});
    lc.onStop(() => {});
    lc.onReload(() => {});
    await lc.start();
    const h = lc.health();
    expect(h.hooks).toEqual({ start: 1, stop: 2, reload: 1 });
    expect(typeof h.uptimeMs).toBe('number');
    expect(h.uptimeMs).toBeGreaterThanOrEqual(0);
    await lc.stop();
  });

  it('health report includes lastError when start fails', async () => {
    const lc = createLifecycle({ installSignalHandlers: false });
    lc.onStart(() => { throw new Error('boot failed'); });
    await expect(lc.start()).rejects.toThrow('boot failed');
    const h = lc.health();
    expect(h.status).toBe('failed');
    expect(h.lastError).toContain('boot failed');
  });

  it('registers SIGINT SIGTERM SIGHUP handlers when installSignalHandlers is true', async () => {
    const onceSpy = vi.spyOn(process, 'once').mockReturnValue(process);
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process);

    const lc = createLifecycle({ installSignalHandlers: true });
    await lc.start();

    const onceSignals = onceSpy.mock.calls.map((c) => c[0]);
    const onSignals = onSpy.mock.calls.map((c) => c[0]);
    expect(onceSignals).toContain('SIGINT');
    expect(onceSignals).toContain('SIGTERM');
    expect(onSignals).toContain('SIGHUP');

    vi.restoreAllMocks();
    await lc.stop();
  });

  it('does NOT register signal handlers when installSignalHandlers is false', async () => {
    const onceSpy = vi.spyOn(process, 'once').mockReturnValue(process);

    const lc = createLifecycle({ installSignalHandlers: false });
    await lc.start();

    const signals = onceSpy.mock.calls.map((c) => c[0]);
    expect(signals).not.toContain('SIGINT');
    expect(signals).not.toContain('SIGTERM');

    vi.restoreAllMocks();
    await lc.stop();
  });

  it('onStart and onStop return working unsubscribe functions', async () => {
    const lc = createLifecycle({ installSignalHandlers: false });
    const hook = vi.fn();
    const unsub = lc.onStart(hook);
    unsub();
    await lc.start();
    expect(hook).not.toHaveBeenCalled();
    await lc.stop();
  });
});
