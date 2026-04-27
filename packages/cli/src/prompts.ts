/**
 * Interactive prompts for `create-appysentinel`.
 *
 * Layer 1 only — mechanical scaffolding. The configure-sentinel agent
 * interview (Layer 2) is deferred until recipe code exists to generate.
 */

import { cancel, isCancel, intro, outro, text } from '@clack/prompts';
import { basename } from 'node:path';

export interface ScaffoldAnswers {
  /** Project directory name (e.g. "angeleye-sentinel"). */
  projectName: string;
  /** Absolute target directory. */
  targetDir: string;
}

function defaultProjectName(arg?: string): string {
  if (arg && arg.trim().length > 0) return arg.trim();
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

  outro('Starting scaffold...');

  const targetDir = `${process.cwd()}/${projectName}`;
  return {
    projectName: projectName as string,
    targetDir,
  };
}
