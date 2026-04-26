import { describe, expect, it, vi } from 'vitest';
import { createSignalBus } from '../src/bus.js';
import type { Signal } from '../src/signal.js';

const sample = (): Signal => ({
  id: 'a',
  ts: 'now',
  schema_version: '1.0.0',
  source: 'test',
  machine: 'm',
  sentinel_id: 's',
  kind: 'log',
  name: 'test',
  payload: {},
});

describe('SignalBus', () => {
  it('delivers signals to every subscriber', () => {
    const bus = createSignalBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on(a);
    bus.on(b);

    const s = sample();
    bus.emit(s);

    expect(a).toHaveBeenCalledWith(s);
    expect(b).toHaveBeenCalledWith(s);
  });

  it('returns an unsubscribe function', () => {
    const bus = createSignalBus();
    const handler = vi.fn();
    const off = bus.on(handler);

    bus.emit(sample());
    expect(handler).toHaveBeenCalledTimes(1);

    off();
    bus.emit(sample());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.size()).toBe(0);
  });

  it('routes thrown errors through onError without breaking other handlers', () => {
    const onError = vi.fn();
    const bus = createSignalBus({ onError });

    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    bus.on(bad);
    bus.on(good);

    const s = sample();
    bus.emit(s);

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1]).toBe(s);
  });

  it('emitAndWait awaits async handlers', async () => {
    const bus = createSignalBus();
    let resolved = false;
    bus.on(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
      resolved = true;
    });

    await bus.emitAndWait(sample());
    expect(resolved).toBe(true);
  });
});
