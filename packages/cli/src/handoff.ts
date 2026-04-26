/**
 * Layer 2 handoff — auto-launch headless Claude Code with the configuration
 * interview prompt. Spec §8.2.
 *
 * If `claude` is not on PATH, print a clear error and exit non-zero so the
 * user knows what to install.
 */

import { spawnSync } from 'node:child_process';

export interface HandoffOptions {
  targetDir: string;
  projectName: string;
}

export interface HandoffResult {
  status: 'launched' | 'claude-not-found' | 'failed';
  exitCode?: number;
  message?: string;
}

function hasClaude(): boolean {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], {
    stdio: 'pipe',
  });
  return probe.status === 0;
}

function buildPrompt(opts: HandoffOptions): string {
  return [
    'You are running the AppySentinel configuration interview.',
    `The project "${opts.projectName}" was just scaffolded at ${opts.targetDir}.`,
    'Read .claude/skills/configure-sentinel/SKILL.md and follow its instructions.',
    'Interview the developer on:',
    '  1. Interface choice (MCP / REST / both / none — default MCP)',
    '  2. Input collectors (watch-directory, poll-command, hook-receiver, etc.)',
    '  3. Storage (jsonl-store / sqlite-store / memory-buffer)',
    '  4. Transport (http-push / socketio-push / otlp-push / supabase-push / file-relay / none)',
    '  5. Runtime (launchd / systemd / pm2 / docker / none)',
    'Generate code for chosen recipes and validate the result starts and emits one smoke-test signal.',
  ].join('\n');
}

export function runHandoff(options: HandoffOptions): HandoffResult {
  if (!hasClaude()) {
    return {
      status: 'claude-not-found',
      message:
        'Claude Code CLI (`claude`) was not found on PATH. Install it from https://claude.com/claude-code, then run:\n' +
        `  cd ${options.targetDir}\n` +
        `  claude -p "Run the AppySentinel configuration interview. Read .claude/skills/configure-sentinel/SKILL.md"`,
    };
  }

  const prompt = buildPrompt(options);
  const result = spawnSync('claude', ['-p', prompt], {
    cwd: options.targetDir,
    stdio: 'inherit',
  });

  if (result.error) {
    return {
      status: 'failed',
      message: `Failed to launch claude: ${result.error.message}`,
    };
  }

  return { status: 'launched', exitCode: result.status ?? 0 };
}
