#!/usr/bin/env node
/**
 * create-appysentinel — static CLI for AppySentinel scaffolds.
 *
 * Usage: npx create-appysentinel [project-name]
 *
 * Layer 1 only — mechanical scaffolding (copy template, substitute
 * placeholders, bun install, git init). Recipe configuration is done
 * manually inside the project once you know what you need.
 */

import { resolve } from 'node:path';
import { runPrompts } from './prompts.js';
import { runScaffold } from './scaffold.js';

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
    });
  } catch (err) {
    console.error('\n  Scaffold failed:', String(err));
    process.exit(1);
  }

  console.log(`\n  ✓ ${result.filesWritten} files written`);
  console.log(`  ✓ dependencies installed`);
  console.log(`  ✓ git repository initialised`);
  console.log(`\n  Next steps:\n`);
  console.log(`    cd ${answers.projectName}`);
  console.log(`    bun src/main.ts          # smoke-test the skeleton`);
  console.log(`    claude                   # open Claude Code to start building\n`);
}

main().catch((err) => {
  console.error('[create-appysentinel] unexpected error:', err);
  process.exit(1);
});
