---
name: configure-sentinel
description: |
  Configure a freshly-scaffolded AppySentinel project. Interviews the developer
  about interface, input collectors, storage, transport, and runtime supervisor;
  generates code for chosen recipes; smoke-tests the result.

  Use this skill on a project scaffolded by `create-appysentinel` that has
  not yet been configured (`appysentinel.json` shows empty `recipes` arrays).
---

# configure-sentinel

> **Status: placeholder.** The full interview script will land in a follow-up
> session. This file documents the intended scope so the agent handoff has a
> clear target. Do not delete it — `create-appysentinel` writes its bootstrap
> prompt to point at this file.

## What this skill will do (when fully written)

1. **Read the project state**
   - `appysentinel.json` — name, machine, current recipe selections
   - `package.json` — dependency baseline
   - `src/main.ts` — current Sentinel wiring
   - `.env.example` — current required environment variables

2. **Interview the developer** (single pass, decisions captured into a draft `appysentinel.json`)
   - Interface (default: MCP). Choices: MCP / REST / both / none-yet.
   - Inputs (zero or more): watch-directory, watch-logfile, poll-http, poll-command, orchestrator-ssh, hook-receiver, subprocess-wrap, snapshot-capture.
   - Storage (one of): jsonl-store, sqlite-store, memory-buffer, none.
   - Transport (zero or more): http-push, socketio-push, otlp-push, supabase-push, file-relay.
   - Enrichment (zero or more): deterministic-classifier, heuristic-classifier, llm-classifier.
   - Runtime supervisor (one of): register-as-launchd, register-as-systemd, register-as-pm2, register-as-docker, none.

3. **Generate recipe code** into `src/recipes/<recipe-slug>.ts` — one file per chosen recipe. Each recipe file is generated from its markdown spec (in `docs/recipes/`).

4. **Update `src/main.ts`** to import + wire the chosen recipes against the existing `createSentinel()` call.

5. **Update `appysentinel.json`** to record the selections under each recipe category.

6. **Update `.env.example`** with any environment variables the chosen recipes require.

7. **Smoke test**
   - Run `bun src/main.ts` for ~3 seconds.
   - Verify at least one Signal is emitted to the configured store / transport / interface.
   - Stop cleanly via SIGINT.
   - Report success or surface diagnostics.

## What this skill will NOT do

- Make architectural choices on the developer's behalf without asking.
- Touch the seven baked-in primitives (`@appydave/appysentinel-core`) — those are immutable from the project's perspective.
- Run `git commit` — leaves committing to the developer.

## Inputs the interview captures

```typescript
interface ConfigureSentinelAnswers {
  interface: 'mcp' | 'rest' | 'mcp+rest' | 'none';
  inputs: Array<
    | 'watch-directory'
    | 'watch-logfile'
    | 'poll-http'
    | 'poll-command'
    | 'orchestrator-ssh'
    | 'hook-receiver'
    | 'subprocess-wrap'
    | 'snapshot-capture'
  >;
  storage: 'jsonl-store' | 'sqlite-store' | 'memory-buffer' | 'none';
  transports: Array<
    'http-push' | 'socketio-push' | 'otlp-push' | 'supabase-push' | 'file-relay'
  >;
  enrichment: Array<
    'deterministic-classifier' | 'heuristic-classifier' | 'llm-classifier'
  >;
  runtime:
    | 'register-as-launchd'
    | 'register-as-systemd'
    | 'register-as-pm2'
    | 'register-as-docker'
    | 'none';
}
```

## Reference: spec sections

- §5 — what's baked in
- §6 — Signal envelope
- §7 — recipe catalogue
- §8 — install architecture (this skill is Layer 2)
