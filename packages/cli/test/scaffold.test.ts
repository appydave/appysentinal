import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScaffold } from '../src/scaffold.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(__dirname, '../../template');

/** Walk a directory recursively and return all file paths. */
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      paths.push(...(await walk(full)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

/** Read file and return content, empty string if unreadable binary. */
async function readText(p: string): Promise<string> {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return '';
  }
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'sentinel-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('runScaffold', () => {
  it('substitutes PROJECT_NAME in package.json', async () => {
    const targetDir = join(tmpDir, 'my-test-sentinel');
    runScaffold({ projectName: 'my-test-sentinel', targetDir, templateDir: TEMPLATE_DIR, _skipInstall: true, _skipGit: true });
    const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-test-sentinel');
  });

  it('no {{PROJECT_NAME}} placeholder remains in any file', async () => {
    const targetDir = join(tmpDir, 'clean-sentinel');
    runScaffold({ projectName: 'clean-sentinel', targetDir, templateDir: TEMPLATE_DIR, _skipInstall: true, _skipGit: true });
    const files = await walk(targetDir);
    for (const f of files) {
      const content = await readText(f);
      expect(content, `${f} still contains {{PROJECT_NAME}}`).not.toContain('{{PROJECT_NAME}}');
    }
  });

  it('no workspace:* references remain after substitution', async () => {
    const targetDir = join(tmpDir, 'ws-sentinel');
    runScaffold({ projectName: 'ws-sentinel', targetDir, templateDir: TEMPLATE_DIR, _skipInstall: true, _skipGit: true });
    const files = await walk(targetDir);
    for (const f of files) {
      const content = await readText(f);
      expect(content, `${f} still contains workspace:*`).not.toContain('workspace:*');
    }
  });

  it('scripts/ directory is present with all four service files', async () => {
    const targetDir = join(tmpDir, 'svc-sentinel');
    runScaffold({ projectName: 'svc-sentinel', targetDir, templateDir: TEMPLATE_DIR, _skipInstall: true, _skipGit: true });
    expect(existsSync(join(targetDir, 'scripts', 'install-service.sh'))).toBe(true);
    expect(existsSync(join(targetDir, 'scripts', 'uninstall-service.sh'))).toBe(true);
    expect(existsSync(join(targetDir, 'scripts', 'launchd.plist'))).toBe(true);
    expect(existsSync(join(targetDir, 'scripts', 'systemd.service'))).toBe(true);
  });

  it('CLAUDE.md is present and contains the project name', async () => {
    const targetDir = join(tmpDir, 'doc-sentinel');
    runScaffold({ projectName: 'doc-sentinel', targetDir, templateDir: TEMPLATE_DIR, _skipInstall: true, _skipGit: true });
    expect(existsSync(join(targetDir, 'CLAUDE.md'))).toBe(true);
    const content = await readFile(join(targetDir, 'CLAUDE.md'), 'utf8');
    expect(content).toContain('doc-sentinel');
  });

  it('throws when target directory is non-empty', async () => {
    const targetDir = join(tmpDir, 'existing');
    await writeFile(join(tmpDir, 'existing'), ''); // makes tmpDir/existing a file not a dir — use subdir
    const existingDir = join(tmpDir, 'nonempty');
    await (await import('node:fs/promises')).mkdir(existingDir);
    await writeFile(join(existingDir, 'sentinel.txt'), 'already here');
    expect(() =>
      runScaffold({ projectName: 'nonempty', targetDir: existingDir, templateDir: TEMPLATE_DIR, _skipInstall: true, _skipGit: true })
    ).toThrow('not empty');
  });

  it('returns correct filesWritten count', async () => {
    const targetDir = join(tmpDir, 'count-sentinel');
    const result = runScaffold({ projectName: 'count-sentinel', targetDir, templateDir: TEMPLATE_DIR, _skipInstall: true, _skipGit: true });
    const files = await walk(targetDir);
    expect(result.filesWritten).toBe(files.length);
  });
});
