#!/usr/bin/env node
/**
 * create-appysentinel — static CLI for AppySentinel scaffolds.
 *
 * Usage: npx create-appysentinel [project-name]
 *
 * Layer 1 only — pure mechanical scaffolding. Layer 2 (the configuration
 * interview) is delegated to `claude -p` after the copy step. See spec §8.
 */

import { resolve } from 'node:path';
import { runPrompts } from './prompts.js';
import { runScaffold } from './scaffold.js';
import { runHandoff } from './handoff.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const initialName = args.find((a) => !a.startsWith('-'));

  const answers = await runPrompts({ initialName });
  const targetDir = resolve(process.cwd(), answers.projectName);

  console.log(`\n  Scaffolding ${answers.projectName} at ${targetDir} ...\n`);

  let result;
  try {
    result = runScaffold({
      projectName: answers.projectName,
      targetDir,
      machineName: answers.machineName,
    });
  } catch (err) {
    console.error('\n  Scaffold failed:', String(err));
    process.exit(1);
  }

  console.log(
    `\n  Wrote ${result.filesWritten} files from template ${result.templateDir} to ${result.targetDir}.\n`
  );

  if (!answers.runAgent) {
    console.log(`  Done. To configure the Sentinel later, run:`);
    console.log(`    cd ${result.targetDir}`);
    console.log(`    claude -p "Run the AppySentinel configuration interview. Read .claude/skills/configure-sentinel/SKILL.md"`);
    return;
  }

  console.log(`  Handing off to Claude Code for the configuration interview...\n`);
  const handoff = runHandoff({
    targetDir: result.targetDir,
    projectName: answers.projectName,
  });

  switch (handoff.status) {
    case 'launched':
      // claude already streamed its own output; nothing more to do.
      break;
    case 'claude-not-found':
      console.warn(`\n  ${handoff.message}\n`);
      process.exit(2);
      break;
    case 'failed':
      console.error(`\n  ${handoff.message}\n`);
      process.exit(3);
      break;
  }
}

main().catch((err) => {
  console.error('[create-appysentinel] unexpected error:', err);
  process.exit(1);
});
