import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';

describe('createLogger', () => {
  it('creates a Pino logger with the supplied name and level', () => {
    const log = createLogger({ name: 'unit', level: 'debug' });
    expect(log.level).toBe('debug');
    // pino exposes a `child` method
    expect(typeof log.child).toBe('function');
  });

  it('child loggers inherit and accept extra bindings', () => {
    const parent = createLogger({ name: 'parent', level: 'warn' });
    const child = parent.child({ component: 'test' });
    expect(child.level).toBe('warn');
  });
});
