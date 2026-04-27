import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { z, createConfigLoader } from '../src/config.js';

const schema = z.object({
  port: z.coerce.number().int(),
  logger: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  features: z
    .object({
      mcp: z.boolean().default(false),
    })
    .default({ mcp: false }),
});

describe('createConfigLoader', () => {
  it('layers defaults → file → env, with env winning', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cfg-'));
    const filePath = join(tmp, 'config.json');
    await fs.writeFile(filePath, JSON.stringify({ port: 3000, logger: { level: 'debug' } }));

    try {
      const loader = createConfigLoader({
        schema,
        defaults: { port: 1000, logger: { level: 'info' } },
        env: { PORT: 'port' },
        envSource: { PORT: '5500' } as NodeJS.ProcessEnv,
        filePath,
      });

      const cfg = await loader.load();
      expect(cfg.port).toBe(5500); // env overrode file
      expect(cfg.logger.level).toBe('debug'); // file overrode default
      expect(cfg.features.mcp).toBe(false); // schema default
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('reload notifies onChange subscribers', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cfg-'));
    const filePath = join(tmp, 'config.json');
    await fs.writeFile(filePath, JSON.stringify({ port: 1, logger: { level: 'info' } }));

    try {
      const loader = createConfigLoader({
        schema,
        filePath,
      });

      await loader.load();

      let seen: number | undefined;
      loader.onChange((cfg) => {
        seen = cfg.port;
      });

      await fs.writeFile(filePath, JSON.stringify({ port: 99, logger: { level: 'info' } }));
      await loader.reload();

      expect(seen).toBe(99);
      expect(loader.current()?.port).toBe(99);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('fails Zod validation when schema is violated', async () => {
    const loader = createConfigLoader({
      schema,
      defaults: { port: 'nope' as unknown as number, logger: { level: 'info' } },
    });
    await expect(loader.load()).rejects.toThrow();
  });

  it('env mapping creates intermediate objects for dotted paths', async () => {
    const loader = createConfigLoader({
      schema: z.object({
        db: z.object({ pool: z.object({ size: z.coerce.number() }) }),
      }),
      defaults: { db: { pool: { size: 5 } } },
      env: { DB_POOL_SIZE: 'db.pool.size' },
      envSource: { DB_POOL_SIZE: '20' } as NodeJS.ProcessEnv,
    });
    const cfg = await loader.load();
    expect(cfg.db.pool.size).toBe(20);
  });

  it('arrays in config are replaced not merged', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cfg-'));
    const filePath = join(tmp, 'config.json');
    const s = z.object({ tags: z.array(z.string()).default([]) });
    await fs.writeFile(filePath, JSON.stringify({ tags: ['b', 'c'] }));
    try {
      const loader = createConfigLoader({ schema: s, defaults: { tags: ['a'] }, filePath });
      const cfg = await loader.load();
      expect(cfg.tags).toEqual(['b', 'c']); // file replaces, not merges
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('throws on invalid JSON in config file', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cfg-'));
    const filePath = join(tmp, 'config.json');
    await fs.writeFile(filePath, 'not json at all {{{');
    try {
      const loader = createConfigLoader({ schema, filePath });
      await expect(loader.load()).rejects.toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('throws when config file contains a JSON array instead of object', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cfg-'));
    const filePath = join(tmp, 'config.json');
    await fs.writeFile(filePath, '[1, 2, 3]');
    try {
      const loader = createConfigLoader({ schema, filePath });
      await expect(loader.load()).rejects.toThrow('must contain a JSON object');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('onChange unsubscribe stops notifications', async () => {
    const loader = createConfigLoader({
      schema: z.object({ port: z.coerce.number().int() }),
      defaults: { port: 1 },
    });
    await loader.load();
    let count = 0;
    const unsub = loader.onChange(() => { count++; });
    await loader.reload();
    unsub();
    await loader.reload();
    expect(count).toBe(1); // only fired before unsubscribe
  });
});
