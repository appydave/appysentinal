import { describe, expect, it, vi } from 'vitest';
import { createSentinel } from '../src/create-sentinel.js';

describe('createSentinel', () => {
  it('mints + emits signals with ambient context', () => {
    const sentinel = createSentinel({
      name: 'unit-test',
      machine: 'm1',
      installSignalHandlers: false,
    });

    const seen: unknown[] = [];
    sentinel.on((s) => {
      seen.push(s);
    });

    const signal = sentinel.emit({
      source: 'unit',
      kind: 'event',
      name: 'test.fired',
      payload: { hello: 'world' },
    });

    expect(signal.machine).toBe('m1');
    expect(signal.sentinel_id).toContain('unit-test-');
    expect(signal.payload).toEqual({ hello: 'world' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(signal);
  });

  it('respects explicit sentinelId override', () => {
    const sentinel = createSentinel({
      name: 'x',
      machine: 'host',
      sentinelId: 'fixed',
      installSignalHandlers: false,
    });

    const s = sentinel.emit({
      source: 'a',
      kind: 'log',
      name: 't',
      payload: {},
    });
    expect(s.sentinel_id).toBe('fixed');
  });

  it('start / stop delegate to lifecycle hooks', async () => {
    const sentinel = createSentinel({
      name: 'lc',
      machine: 'm',
      installSignalHandlers: false,
    });
    const onStart = vi.fn();
    const onStop = vi.fn();
    sentinel.lifecycle.onStart(onStart);
    sentinel.lifecycle.onStop(onStop);

    await sentinel.start();
    await sentinel.stop();

    expect(onStart).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
  });

  it('emitAndWait awaits async subscribers', async () => {
    const sentinel = createSentinel({
      name: 'aw',
      machine: 'm',
      installSignalHandlers: false,
    });

    let done = false;
    sentinel.on(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
      done = true;
    });

    await sentinel.emitAndWait({
      source: 'a',
      kind: 'log',
      name: 't',
      payload: {},
    });
    expect(done).toBe(true);
  });
});
