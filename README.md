# AppySentinel

**Per-machine, observer-only local data coordinator boilerplate.**

Scaffold a headless, always-on process that collects telemetry from local sources, normalises it into a common Signal envelope, makes it queryable via API / CLI / MCP, and pushes it outward to downstream systems. No UI. No dashboard. No mutation of the systems it watches.

> AppySentinel builds **Sentinels** (observers).
> AppyStack builds **Viewers** (dashboards).
> They are separate applications and they communicate through the Sentinel's Access zone.

---

## Why this exists

Every AppyDave project that collects local machine data ended up reinventing the same plumbing:

- An event envelope — each collector invented an incompatible shape
- An internal pub/sub bus — coupling collectors, storage, and transport
- Graceful shutdown — signal handling, queue flushing, cleanup hooks
- Crash-safe file writes — torn writes corrupting JSON snapshots
- Configuration loading — defaults + file + env, with hot-reload
- Always-on supervision — launchd / systemd registration, restart on crash

And every project conflated **data collection** with the **dashboard** that displayed it. When the dashboard was down, collection stopped. When the observer crashed, you lost the event that would have explained why. AppyRadar, AngelEye, and FliHub all hit this wall in different ways.

AppySentinel is the answer: **one scaffold, consistently wired, with no dashboard weight baked in.** A Sentinel boots first, stays lightweight, survives dashboard outages, and exposes itself through stable surfaces (REST / CLI / MCP) that visualisation apps consume separately.

---

## What it is

AppySentinel is a TypeScript boilerplate distributed as three published npm packages plus a scaffolding CLI:

| Package | Role |
|---|---|
| `create-appysentinel` | Static scaffold CLI + agent handoff (Layer 1 + Layer 2) |
| `@appydave/appysentinel-core` | Seven runtime primitives + `createSentinel()` factory |
| `@appydave/appysentinel-config` | Shared ESLint / Prettier / tsconfig / Vitest configs |

The seven core primitives are baked in because every always-on headless process faces the same unavoidable problems regardless of what it collects: a common data contract (**Signal**), a decoupling layer (**SignalBus**), a process harness (**Lifecycle**), safe configuration loading (**ConfigLoader**), crash-safe file writes (**AtomicWrite**), ordered concurrent I/O (**SerialQueue**), and structured visibility (**Logger**). Remove any one and either the recipes couple directly to each other, or the process becomes unsafe to run unattended.

Everything beyond the primitives — file watchers, HTTP webhooks, SSH orchestration, JSONL stores, MCP bindings, Supabase pushers, OAuth servers — is a **recipe**. Recipes are markdown specs generated into your project by the `configure-sentinel` agent during scaffolding. They are not code in this repo. A Sentinel that doesn't watch files doesn't carry chokidar.

---

## Why use it

Six concrete reasons, each tied to something the boilerplate gives you for free:

### 1. One Signal envelope, OpenTelemetry-aligned

Every emitted record conforms to the same outer shape — `id`, `ts`, `schema_version`, `source`, `machine`, `sentinel_id`, `kind` (log / metric / event / state / span), `name`, `severity`, `attributes`, plus a typed collector-specific `payload`. OTEL is the reference model, not a dependency. An `otlp-push` recipe can translate Signal → OTLP without loss.

### 2. Headless by rule, never by accident

The architectural rule that Sentinels carry no UI is enforced through the project structure and the `configure-sentinel` agent's interview prompts. Visualisation lives in a separate Viewer app that consumes the Sentinel's Access zone. This means Sentinels boot first (they capture the startup of heavier apps), stay lightweight (always-on cost is negligible), and survive dashboard outages.

### 3. Three zones make boundaries obvious

Every recipe falls into one of three roles:

- **Collect** — data flows IN (file watchers, HTTP webhooks, SSH polls, DB diffs)
- **Access** — bidirectional interface layer (`api-binding` HTTP, `cli-binding` shell, `mcp-binding` for AI agents)
- **Deliver** — data flows OUT (HTTP push, Supabase, OTLP, file relay)

Role, not technology, picks the zone. The same HTTP server is `hook-receiver` (Collect) when receiving webhooks but `api-binding` (Access) when serving queries. Naming is consistent, design constraints are clear.

### 4. Access zone is CQRS-lite — read and write, cleanly separated

The Access zone splits into Query (read) and Command (write), with thin protocol Bindings (MCP / HTTP / CLI) routing to either. Commands control the Sentinel itself (trigger a collection, pause a machine, reload config) — never the systems it observes. Commands are stateless and communicate with the running loop through files in `state/`, not shared memory. This keeps every function unit-testable in isolation and prevents the singleton anti-pattern that broke earlier prototypes.

### 5. AI-agent native through MCP

Every mature Sentinel exposes an `mcp-binding`, giving Claude Code (or any MCP client) typed tools for querying the snapshot, triggering early collections, or managing fleet config. Pair that with Tailscale Funnel and the SS-pilot-validated OAuth pattern and your Sentinel becomes reachable from claude.ai CoWork over a public HTTPS URL with proper auth.

### 6. Two-layer install — predictable mechanics, intelligent configuration

Layer 1 is a deterministic CLI: it copies the template, rewrites placeholders, runs `bun install`, and `git init`s. Layer 2 hands off to Claude Code, which interviews you on collectors / storage / bindings / transport / runtime and generates the recipe code into your project. The static layer always succeeds at scaffolding; the agentic layer is where the per-project intelligence lives. If Claude Code is absent, the CLI exits cleanly with a manual recovery command.

---

## Use cases

Real Sentinels — built or in progress on AppySentinel — and the recipes each one wires.

### Pilot 1 — AppyRadar Sentinel (active)

**What it does**: SSH-based telemetry across a 5-machine Tailscale fleet. One orchestrator host runs the Sentinel; collectors reach into each remote machine over SSH and pull snapshots (disk, running apps, git repo state, installed tools, OMI wearable transcripts). The fleet snapshot is exposed via MCP so Claude Code can answer "is FliHub running on the Mac mini?" or "which repos are dirty?" without burning tokens to find out.

**Recipes wired**: `orchestrator-ssh` + `snapshot-store` + `mcp-binding` + `api-binding`.

Repo: [github.com/appydave/appyradar-sentinal](https://github.com/appydave/appyradar-sentinal)

### Pilot 2 — SS Data Query Sentinel (active)

**What it does**: Mirrors a Supabase database into local JSONL by polling for `updated_at`-changed records. Exposes the mirror via MCP (with bearer-token auth for Claude Code) and over a Tailscale Funnel public URL with self-contained OAuth (for claude.ai CoWork). Validated the X5 (bearer) and X6 (OAuth) security tiers.

**Recipes wired**: `sql-diff-collector` + `jsonl-store` + `mcp-binding` (with bearer + OAuth auth).

### Pattern reference — AngelEye-style observability collector

**What it does**: Receives Claude Code hook events (24 hook types) on an HTTP webhook, normalises them into Signals, runs deterministic + heuristic classifiers, writes JSONL per session, and exposes the registry via REST. Real-time dashboard fan-out is the Viewer's concern, not the Sentinel's.

**Recipes wired**: `hook-receiver` + `event-normaliser` + `deterministic-classifier` + `heuristic-classifier` + `jsonl-store` + `api-binding` + `mcp-binding`.

### Other shapes the boilerplate fits

- **File watcher with normalised events** — `watch-directory` (chokidar) + `jsonl-store` + `api-binding`. Drop a folder, get a Signal stream of file changes with metadata.
- **Periodic system snapshot** — `poll-command` + `snapshot-capture` + `snapshot-store` + `mcp-binding`. Capture machine state on a schedule, query the latest from any AI agent.
- **Wearable transcript ingest** — `subprocess-wrap` or `poll-http` + `jsonl-store` + downstream enrichment. The OMI ingestor pattern.
- **Webhook fan-in to OpenTelemetry** — `hook-receiver` + `event-normaliser` + `otlp-push`. Receive third-party webhooks, normalise, and forward to an OTEL collector.
- **Database mirror with diff-polling** — `sql-diff-collector` + `jsonl-store` + `mcp-binding`. Make remote DB state queryable locally and to AI agents, without giving them DB credentials.
- **MCP-first agent toolkit for local data** — `mcp-binding` only. Wrap any local data source — config files, status outputs, audit logs — as MCP tools an agent can call.

---

## Quick start

```bash
npx create-appysentinel my-sentinel
cd my-sentinel
bun src/main.ts          # smoke-test
claude                   # start the configure-sentinel agent
```

[Claude Code](https://claude.com/claude-code) is a hard runtime dependency at install time — Layer 2 of the scaffold launches it to interview you on which recipes to wire. If `claude` isn't on PATH, the CLI exits cleanly with a manual recovery command.

---

## Monorepo layout

```
packages/
├── core/      → @appydave/appysentinel-core    — runtime primitives (Signal, bus, lifecycle, config, …)
├── config/    → @appydave/appysentinel-config  — shared ESLint/Prettier/tsconfig/Vitest
├── cli/       → create-appysentinel            — scaffold CLI (npx)
└── template/  → minimal scaffold (copied by CLI, not published)
```

Recipes are not in this repo. Recipe implementations are generated into user projects by the `configure-sentinel` agent during Layer 2 of the install.

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────┐
│  Local Clients (AI agents, dashboards, dev tools)           │
│                  ↕ MCP / REST / CLI                         │
├─────────────────────────────────────────────────────────────┤
│  Sentinel (runs on one host)                                │
│  • COLLECTS data from local sources                         │
│  • Normalises into Signal envelope                          │
│  • ACCESSES via API / CLI / MCP (Query + Command)           │
│  • DELIVERS data outward                                    │
│  • PULLS configuration inward                               │
├─────────────────────────────────────────────────────────────┤
│  Central System (optional, separate app)                    │
│  • Aggregates multi-machine telemetry                       │
│  • Provides dashboards (built on AppyStack)                 │
└─────────────────────────────────────────────────────────────┘
```

Rules:
- **Push for data, pull for config** — no inbound network connections required at the Sentinel.
- **Observer-only by default** — Sentinels read, never mutate the systems they observe.
- **One host, one-or-more Sentinels** — each is a discrete process with its own config and data dir.

Full architecture and design rationale: [`CONTEXT.md`](CONTEXT.md). Capability matrix and pattern catalogue: [`docs/pattern-catalogue.md`](docs/pattern-catalogue.md). Buildable spec: [`docs/appysentinel-spec.md`](docs/appysentinel-spec.md).

---

## Development

```bash
bun install                                         # first-time setup (also installs Husky hooks)

# Tests
bun run test                                        # all packages
bun run --filter './packages/core' test             # one package
bun run --filter './packages/core' test:watch       # watch mode (Guard equivalent)

# Type checking
bun run typecheck

# Build
bun run build
```

### Pre-push hook (Husky)

Tests and type-checks run automatically before every `git push`. To install the hooks after a fresh clone:

```bash
bun install   # runs `prepare` script which initialises Husky
```

The hook runs `bun run test && bun run typecheck`. A failed push means either tests are broken or types don't compile — fix before pushing. Do not bypass with `--no-verify`.

---

## Publishing to npm

Publishing is fully automated by GitHub Actions on push to `main`:

1. Bump the relevant `package.json` version(s) — see version bump rules in [`CLAUDE.md`](CLAUDE.md).
2. Push to `main`.
3. CI runs tests + typecheck. On success, it auto-tags `vX.Y.Z` (CLI version drives the tag) and publishes all three packages. Each step has a skip-if-already-published guard — unchanged packages are silently skipped.

**Requires** the `NPM_TOKEN` secret in GitHub Actions (granular access token, scoped to the three packages, refreshed every ~90 days — see [`CLAUDE.md`](CLAUDE.md) for the runbook).

Manual publish (rarely needed):

```bash
cd packages/cli && npm publish --access public
```

---

## Packages

| Package | npm | Version |
|---------|-----|---------|
| `create-appysentinel` | `npx create-appysentinel` | 0.2.0 |
| `@appydave/appysentinel-core` | `bun add @appydave/appysentinel-core` | 0.2.0 |
| `@appydave/appysentinel-config` | internal tooling | 0.1.0 |

---

## Documentation map

| Document | What it covers |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | System snapshot — purpose, abstractions, workflows, design decisions, failure modes |
| [`CLAUDE.md`](CLAUDE.md) | Working agreements, architectural rules, version bump policy, npm token runbook |
| [`docs/appysentinel-spec.md`](docs/appysentinel-spec.md) | Buildable v1 spec — what's baked in, the recipe catalogue, install architecture, lifecycle |
| [`docs/pattern-catalogue.md`](docs/pattern-catalogue.md) | Living capability matrix and gap tracker — drives recipe priority |
| [`docs/architecture-refactor-v2.md`](docs/architecture-refactor-v2.md) | v0.2.0 — Access zone refactor, CQRS-lite, OTEL alignment |
| [`docs/tunneling-guide.md`](docs/tunneling-guide.md) | Tailscale Funnel + OAuth setup for claude.ai CoWork access |
| [`docs/SYSTEM-HEALTH.md`](docs/SYSTEM-HEALTH.md) | Audit findings — what's solid, what needs work |

---

## License

MIT
