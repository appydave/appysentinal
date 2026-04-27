/**
 * Mechanical scaffolding — copy the template, apply substitutions, init git.
 *
 * Pure, deterministic, zero LLM calls. Spec §8.1 — Layer 1.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface ScaffoldOptions {
  projectName: string;
  targetDir: string;
  /** Path to the template directory. Defaults to ../template/ relative to this file. */
  templateDir?: string;
  /** Skip `bun install` / `npm install`. Tests only. */
  _skipInstall?: boolean;
  /** Skip `git init` + initial commit. Tests only. */
  _skipGit?: boolean;
}

export interface ScaffoldResult {
  templateDir: string;
  targetDir: string;
  filesWritten: number;
}

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

const PLACEHOLDER_PROJECT = '{{PROJECT_NAME}}';

/**
 * Concrete versions to swap in for `workspace:*` references when copying the
 * template out of the monorepo.
 *
 * IMPORTANT: these track core/config npm releases — NOT the CLI version.
 * core and config are still at 0.1.0. Only bump these when core or config
 * publishes a new version to npm. Do not sync to the CLI version number.
 */
const PUBLISHED_VERSIONS: Record<string, string> = {
  '@appydave/appysentinel-core': '^0.1.0',
  '@appydave/appysentinel-config': '^0.1.0',
};

function resolveTemplateDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // npm install layout: node_modules/create-appysentinel/dist/ -> ../template (copied by prepack)
  // monorepo dev layout: packages/cli/dist/ -> ../../template (the workspace source)
  // monorepo src layout: packages/cli/src/ -> ../../template
  const candidates = [
    resolve(here, '../template'),   // npm install (template/ sits beside dist/)
    resolve(here, '../../template'), // monorepo dev/src
    resolve(here, '../../../template'),
  ];
  for (const c of candidates) {
    if (existsSync(c) && existsSync(join(c, 'package.json'))) {
      return c;
    }
  }
  throw new Error(
    `Could not locate the AppySentinel template directory. Looked in: ${candidates.join(', ')}`
  );
}

function copyTemplate(srcRoot: string, destRoot: string): number {
  let count = 0;

  const walk = (src: string, dest: string): void => {
    const entries = readdirSync(src, { withFileTypes: true });
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        walk(srcPath, destPath);
      } else if (entry.isFile()) {
        cpSync(srcPath, destPath);
        count += 1;
      }
    }
  };

  walk(srcRoot, destRoot);
  return count;
}

function replacePlaceholders(root: string, projectName: string): void {
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const stat = statSync(full);
        if (stat.size > 1024 * 1024) continue; // skip large files
        const original = readFileSync(full, 'utf8');
        const needsRewrite =
          original.includes(PLACEHOLDER_PROJECT) ||
          original.includes('workspace:*');
        if (needsRewrite) {
          let replaced = original
            .split(PLACEHOLDER_PROJECT)
            .join(projectName);
          for (const [pkg, version] of Object.entries(PUBLISHED_VERSIONS)) {
            // Only rewrite the specific `"@scope/pkg": "workspace:*"` form.
            const pattern = new RegExp(
              `("${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*)"workspace:\\*"`,
              'g'
            );
            replaced = replaced.replace(pattern, `$1"${version}"`);
          }
          writeFileSync(full, replaced, 'utf8');
        }
      }
    }
  };
  walk(root);
}

function bunInstall(targetDir: string): void {
  try {
    execSync('bun install', { cwd: targetDir, stdio: 'inherit' });
  } catch {
    // fall back to npm if bun isn't on PATH
    execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
  }
}

function gitInit(targetDir: string): void {
  try {
    execSync('git init', { cwd: targetDir, stdio: 'ignore' });
  } catch (err) {
    // non-fatal — user can init themselves
    console.warn('[create-appysentinel] git init skipped:', String(err));
  }
}

function gitCommit(targetDir: string): void {
  try {
    execSync('git add .', { cwd: targetDir, stdio: 'ignore' });
    execSync('git -c commit.gpgsign=false commit -m "Initial scaffold"', {
      cwd: targetDir,
      stdio: 'ignore',
    });
  } catch (err) {
    // non-fatal — user can commit themselves
    console.warn('[create-appysentinel] git commit skipped:', String(err));
  }
}

/**
 * Run the mechanical scaffold:
 * 1. Locate the template directory.
 * 2. Copy it to `targetDir`.
 * 3. Replace placeholders in copied files.
 * 4. `git init` — must run before `bun install` so Husky's prepare script succeeds.
 * 5. `bun install` (or `npm install` fallback).
 * 6. `git add + commit` — captures the installed lockfile.
 */
export function runScaffold(options: ScaffoldOptions): ScaffoldResult {
  const templateDir = options.templateDir ?? resolveTemplateDir();
  if (existsSync(options.targetDir)) {
    const entries = readdirSync(options.targetDir);
    if (entries.length > 0) {
      throw new Error(
        `Target directory ${options.targetDir} is not empty. Aborting to avoid overwriting files.`
      );
    }
  } else {
    mkdirSync(options.targetDir, { recursive: true });
  }

  const filesWritten = copyTemplate(templateDir, options.targetDir);
  replacePlaceholders(options.targetDir, options.projectName);
  if (!options._skipGit) gitInit(options.targetDir);
  if (!options._skipInstall) bunInstall(options.targetDir);
  if (!options._skipGit) gitCommit(options.targetDir);

  return {
    templateDir,
    targetDir: options.targetDir,
    filesWritten,
  };
}
