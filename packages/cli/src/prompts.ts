/**
 * Interactive prompts for `create-appysentinel`.
 *
 * Keep this layer thin — the static CLI's job is purely mechanical
 * scaffolding. The intelligent configuration interview happens in
 * Layer 2 (the `configure-sentinel` Claude skill).
 */

import { cancel, confirm, isCancel, intro, outro, text } from '@clack/prompts';
import { hostname } from 'node:os';
import { basename } from 'node:path';

export interface ScaffoldAnswers {
  /** Project directory name (e.g. "angeleye-sentinel"). */
  projectName: string;
  /** Absolute target directory. */
  targetDir: string;
  /** Machine identifier baked into the .env. */
  machineName: string;
  /** Whether to immediately hand off to `claude -p` (Layer 2). */
  runAgent: boolean;
}

function defaultProjectName(arg?: string): string {
  if (arg && arg.trim().length > 0) return arg.trim();
  // If invoked from inside a likely-target dir
  const cwdName = basename(process.cwd());
  if (cwdName && cwdName !== '/' && cwdName !== '.') {
    return `${cwdName}-sentinel`;
  }
  return 'my-sentinel';
}

export async function runPrompts(args: { initialName?: string }): Promise<ScaffoldAnswers> {
  intro('create-appysentinel');

  const projectName = await text({
    message: 'Project name',
    placeholder: defaultProjectName(args.initialName),
    initialValue: args.initialName ?? defaultProjectName(args.initialName),
    validate(value) {
      if (!value || value.trim().length === 0) return 'Project name is required';
      if (!/^[a-z0-9][a-z0-9-_]*$/i.test(value)) {
        return 'Use letters, digits, dashes or underscores';
      }
      return undefined;
    },
  });
  if (isCancel(projectName)) {
    cancel('Cancelled');
    process.exit(0);
  }

  const machineName = await text({
    message: 'Machine identifier (used in Signal envelope)',
    placeholder: hostname(),
    initialValue: hostname(),
    validate(value) {
      if (!value || value.trim().length === 0) return 'Machine name is required';
      return undefined;
    },
  });
  if (isCancel(machineName)) {
    cancel('Cancelled');
    process.exit(0);
  }

  const runAgent = await confirm({
    message: 'Hand off to Claude Code for the configuration interview after scaffolding?',
    initialValue: true,
  });
  if (isCancel(runAgent)) {
    cancel('Cancelled');
    process.exit(0);
  }

  outro('Starting scaffold...');

  const targetDir = `${process.cwd()}/${projectName}`;
  return {
    projectName: projectName as string,
    targetDir,
    machineName: machineName as string,
    runAgent: runAgent as boolean,
  };
}
