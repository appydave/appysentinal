# AppySentinel — Claude Instructions

> **Rich system snapshot**: Read `CONTEXT.md` first for architecture, core abstractions,
> design decisions, failure modes, and what this project explicitly does NOT do.
> `docs/pattern-catalogue.md` is the living capability matrix and gap tracker — check it
> before writing any new recipe or changing any pattern name.

---

## Project Overview

AppySentinel is a **per-machine, always-on local data coordinator boilerplate**. It scaffolds
headless, long-running processes (Sentinels) that collect data from local sources, normalise it
into a Signal envelope, expose it via REST/CLI/MCP, and deliver it outward. No UI. No dashboard.
Visualisation is a separate Viewer application that reads from the Sentinel's expose surface.

- **Not AppyStack** — AppyStack builds web apps (RVETS). AppySentinel builds headless coordinators.
- **Primitives only** — this repo ships 7 core primitives + a scaffolding CLI. Recipe implementations
  are generated into user projects by the `configure-sentinel` agent.

---

## Key Documents (read in this order)

| # | File | Purpose |
|---|------|---------|
| 1 | `CONTEXT.md` | System snapshot — 8 dimensions, all design decisions + failure modes |
| 2 | `docs/pattern-catalogue.md` | **Lead living doc.** Capability matrix + gap tracker. Drives priority. |
| 3 | `docs/appysentinel-spec.md` | Design-of-record spec (§1–§14) |
| 4 | `packages/core/src/` | Implemented primitives — read before touching core |
| 5 | `docs/HANDOVER.md` | Current session state + what NOT to do |

---

## Architectural Rules (do not re-litigate)

- **Headless rule**: Sentinels have no UI. Visualisation = separate Viewer app.
- **Observer-only by default**: Sentinels read, never mutate observed systems.
- **Three boundary umbrellas**: Collect (read from outside) / Expose (let outside read me) / Deliver (push to outside).
- **Expose = API/CLI/MCP only** (Anthropic framework). Socket.io dropped from expose set.
- **File-based storage default**: JSONL or snapshot JSON. SQLite must earn its place.
- **Recipes own their deps**: Core ships only `pino`, `ulid`, `zod`.
- **Recipes are generated, not in this repo**: Recipe implementations live in user projects.

---

## What Not To Do

- Do not add UI, admin endpoints, or mutation logic into any Sentinel primitive.
- Do not write recipe code into `packages/core/` — primitives only.
- Do not use old names: `mcp-interface`, `rest-interface`, `socketio-interface` are gone.
- Do not write recipe specs ahead of pilot need — recipes are byproducts of pilots.
- Do not touch `packages/core/src/` without updating tests in `packages/core/test/` in lockstep.
- Do not change `docs/` for design reasons without updating `docs/pattern-catalogue.md` alongside.
- Do not bring AngelEye in as a v1 pilot — deferred.
- Do not reach for SQL storage as default.

---

## Monorepo Layout

```
packages/
├── core/      → @appydave/appysentinel-core   — runtime primitives (published)
├── config/    → @appydave/appysentinel-config — shared tooling configs (published)
├── cli/       → create-appysentinel           — static scaffold CLI (published)
└── template/  → minimal scaffold (copied by CLI, NOT published)
```

Common tasks:

```bash
bun install                                       # first-time setup
bun run build                                     # build core + cli
bun run test                                      # all package tests (Vitest)
bun run --filter './packages/core' test           # core tests only
bun run --filter './packages/core' test:watch     # watch mode
```

---

## Current Status (2026-04-26)

- 7 primitives built and tested (27 Vitest tests passing).
- CLI scaffold pipeline works (copy + substitution + `workspace:*` rewrite).
- Template smoke test: `bun src/main.ts` emits `sentinel.started`, idles until SIGINT.
- **Next**: Pilot 1 (AppyRadar Sentinel) + Pilot 2 (SS Data Query Sentinel) in parallel.
  First recipe to write is whatever a pilot demands — not speculative.

---

## Cross-references

- AppyRadar bespoke prior art: `~/dev/ad/apps/appyradar/scripts/audit.ts`
- AppyRadar canonical data shape: `~/dev/ad/apps/appyradar/snapshots/appyradar-latest.json`
- SupportSignal discovery target: `~/dev/clients/supportsignal/`
- Remote: `github.com/appydave/appysentinel` (main branch)
