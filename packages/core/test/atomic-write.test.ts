import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { atomicWrite } from '../src/atomic-write.js';

let tmp: string;

afterEach(async () => {
  if (tmp) {
    await rm(tmp, { recursive: true, force: true });
  }
});

describe('atomicWrite', () => {
  it('writes new file content atomically', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'aw-'));
    const target = join(tmp, 'a.json');

    await atomicWrite(target, '{"x":1}');

    const out = await fs.readFile(target, 'utf8');
    expect(out).toBe('{"x":1}');
  });

  it('replaces existing file contents and leaves no temp files behind', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'aw-'));
    const target = join(tmp, 'b.txt');

    await fs.writeFile(target, 'old');
    await atomicWrite(target, 'new');

    expect(await fs.readFile(target, 'utf8')).toBe('new');

    const remaining = await fs.readdir(tmp);
    expect(remaining).toEqual(['b.txt']);
  });

  it('cleans up the temp file on failure', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'aw-'));
    const target = join(tmp, 'sub-dir-that-does-not-exist', 'c.txt');

    await expect(atomicWrite(target, 'x')).rejects.toThrow();

    // Parent of failed write should not contain stray temp files
    const remaining = await fs.readdir(tmp);
    expect(remaining).toEqual([]);
  });
});
