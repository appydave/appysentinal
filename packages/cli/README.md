# create-appysentinel

The static scaffolding CLI for [AppySentinel](https://github.com/appydave/appysentinal) — the per-machine, observer-only telemetry collector boilerplate.

## Usage

```bash
# Bun
bunx create-appysentinel my-sentinel

# npm / pnpm / yarn
npx create-appysentinel my-sentinel
```

You'll be prompted for:

1. **Project name** (defaults to `my-sentinel`)
2. **Machine identifier** (defaults to `os.hostname()`)
3. **Whether to hand off to Claude Code** for the configuration interview (default: yes)

## What it does

This CLI is intentionally minimal — it does mechanical scaffolding only. Spec §8.1.

1. Copies the AppySentinel template into a new directory
2. Replaces `{{PROJECT_NAME}}` and `{{MACHINE_NAME}}` placeholders
3. Runs `bun install` (falls back to `npm install`)
4. Runs `git init` + an initial commit
5. Optionally launches `claude -p` with the bootstrap prompt that runs the `configure-sentinel` skill (Layer 2 — the agent-driven interview)

The agent decides which recipes to wire — collectors, storage, interface, transport, runtime supervisor — based on a structured interview with the developer. Spec §8.2.

## Claude Code is a hard runtime dependency

When you choose to hand off (the default), the CLI invokes `claude -p`. If `claude` is not on `PATH`, the CLI prints a clear error and exits with code 2. Install Claude Code from <https://claude.com/claude-code>.

You can opt out of the handoff and run the interview later:

```bash
cd my-sentinel
claude -p "Run the AppySentinel configuration interview. Read .claude/skills/configure-sentinel/SKILL.md"
```

## Two-layer install

| Layer | What it does | Where |
|-------|--------------|-------|
| 1 — static CLI | Copies template, substitutions, install deps, git init | this package |
| 2 — agent | Interviews developer, generates recipe code, smoke-tests | `.claude/skills/configure-sentinel/` (in the scaffolded project) |

Spec §8.3 has the full flow diagram.

## License

MIT
