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
- **Three zones**: Collect (read from outside) / Access (bidirectional interface) / Deliver (push to outside).
- **Access zone = Bindings (API/CLI/MCP) over Query + Command layers.** Bindings are thin adapters; logic belongs in `query/` or `command/`. Socket.io dropped from access set.
- **CQRS applies within Access only** — not to Collect or Deliver.
- **File-based storage default**: JSONL or snapshot JSON. SQLite must earn its place.
- **Recipes own their deps**: Core ships only `pino`, `ulid`, `zod`.
- **Recipes are generated, not in this repo**: Recipe implementations live in user projects.

---

## Version bump rules (apply before every tag + publish)

| Change type | Bump | Examples |
|-------------|------|---------|
| Bug fix, docs, internal refactor — no change to scaffold output | **patch** (0.x.Y) | Fix scaffold order, update CLAUDE.md, fix a parser bug |
| New feature — changes what a scaffolded project contains or how the CLI behaves | **minor** (0.X.0) | Add new template file, new CLI option, new script in template package.json |
| Breaking change — renames/removes CLI commands, changes required inputs, removes template files | **major** (X.0.0) | Rename `create-appysentinel` command, drop a required arg |

**Rule**: bump the relevant `package.json` version(s) before committing. The three packages version independently — CLI, core, and config each have their own version. `PUBLISHED_VERSIONS` in `packages/cli/src/scaffold.ts` tracks the npm-published versions of **core and config only** — do not sync it to the CLI version number.

**Publishing flow (fully automated — no manual steps):**
1. Bump the relevant `package.json` version(s) and commit.
2. Push to `main`.
3. CI (`.github/workflows/ci.yml`) runs tests + typecheck. If they pass, on main push it:
   - Creates and pushes the git tag `vX.Y.Z` (CLI version drives the tag) if it doesn't exist yet
   - Publishes all three packages directly. Each step has a skip-if-already-published guard — unchanged packages are silently skipped.

**Why CI publishes directly (not via tag trigger):** GitHub blocks cross-workflow triggers when the tag is created by `GITHUB_TOKEN` (security guard against recursive loops). Publish steps live in `ci.yml` alongside the tag step to work around this.

If you push to main without bumping a version, every publish step skips silently — idempotent.

---

## What Not To Do

- Do not add UI, admin endpoints, or mutation logic into any Sentinel primitive.
- Do not write recipe code into `packages/core/` — primitives only.
- Do not use old names: `mcp-interface`, `rest-interface`, `socketio-interface`, `mcp-expose`, `api-expose`, `cli-expose` are gone. Use `mcp-binding`, `api-binding`, `cli-binding`.
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
bun install                                       # first-time setup (also installs Husky hooks)
bun run build                                     # build core + cli
bun run test                                      # all package tests (Vitest) — excludes template
bun run --filter './packages/core' test           # core tests only
bun run --filter './packages/core' test:watch     # watch mode — leave running while developing
bun run typecheck                                 # TypeScript across all packages
```

**Pre-push hook (Husky):** runs `bun run test && bun run typecheck` automatically on `git push`.
No broken code reaches the remote. If the hook blocks a push, fix the failure — do not bypass with `--no-verify`.

**Publishing:** automated via GitHub Actions on `git tag v*` push. Manual publish with `npm publish --access public` from the relevant package directory. Requires `NPM_TOKEN` secret in GitHub Actions.

**Watch mode while developing core:** `bun run --filter './packages/core' test:watch` — Vitest re-runs only tests affected by the files you change. Equivalent to Ruby's Guard. Leave it open in a terminal split.

**Template is excluded from monorepo test runs.** `packages/template` has no installed `vitest` in the monorepo (its deps are only installed when it is scaffolded into a new standalone project). The root `test`/`typecheck`/`lint` scripts filter to `@appydave/*` and `create-appysentinel` explicitly. Do not change this to `--filter '*'`.

---

## Current Status (2026-04-27)

- 46 Vitest tests passing (39 core, 7 CLI integration).
- CLI scaffold pipeline works and tested against the real template with real temp dirs.
- Template ships: CLAUDE.md, service registration scripts (launchd + systemd), .env.example,
  Vitest smoke test, Husky pre-push hook, `vitest.config.ts`.
- Scaffold order fixed: `git init` now runs before `bun install` so Husky `prepare` succeeds.
- CLI version: `0.1.7`.
- Husky pre-push hook installed. GitHub Actions CI on push; publish on version tag.
- **Next**: Pilot 1 (AppyRadar Sentinel) + Pilot 2 (SS Data Query Sentinel) in parallel.
  First recipe to write is whatever a pilot demands — not speculative.
- **Blocked (not cancelled)**: foundational pieces — health probe, dataDir, PID file, self-telemetry.
  These are API changes to core; tackle in a dedicated session before or alongside first pilot.

---

## Cross-references

- AppyRadar bespoke prior art: `~/dev/ad/apps/appyradar/scripts/audit.ts`
- AppyRadar canonical data shape: `~/dev/ad/apps/appyradar/snapshots/appyradar-latest.json`
- SupportSignal discovery target: `~/dev/clients/supportsignal/`
- Remote: `github.com/appydave/appysentinel` (main branch)
