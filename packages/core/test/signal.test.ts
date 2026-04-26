import { describe, expect, it } from 'vitest';
import { mintSignal, SIGNAL_SCHEMA_VERSION } from '../src/signal.js';

describe('mintSignal', () => {
  const ctx = { machine: 'm1', sentinel_id: 's-1' };

  it('fills in id, ts, and schema_version', () => {
    const s = mintSignal(
      {
        source: 'watch-directory',
        kind: 'event',
        name: 'file.created',
        payload: { path: '/tmp/x' },
      },
      ctx
    );

    expect(s.id).toBeTypeOf('string');
    expect(s.id.length).toBeGreaterThan(0);
    expect(s.schema_version).toBe(SIGNAL_SCHEMA_VERSION);
    expect(typeof s.ts).toBe('string');
    expect(s.ts).toMatch(/T/);
    expect(s.machine).toBe('m1');
    expect(s.sentinel_id).toBe('s-1');
    expect(s.kind).toBe('event');
    expect(s.payload).toEqual({ path: '/tmp/x' });
  });

  it('honours explicit id and ts overrides', () => {
    const s = mintSignal(
      {
        id: 'fixed',
        ts: '2026-01-01T00:00:00.000Z',
        source: 'x',
        kind: 'log',
        name: 'noop',
        payload: {},
      },
      ctx
    );

    expect(s.id).toBe('fixed');
    expect(s.ts).toBe('2026-01-01T00:00:00.000Z');
  });

  it('omits optional fields when absent', () => {
    const s = mintSignal(
      { source: 'x', kind: 'log', name: 'a', payload: {} },
      ctx
    );

    expect(s.severity).toBeUndefined();
    expect(s.attributes).toBeUndefined();
  });
});
