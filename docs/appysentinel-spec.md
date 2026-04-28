# AppySentinel Boilerplate Specification

**Status**: Buildable spec — v1
**Date**: 2026-04-25
**Scope**: Defines what the AppySentinel boilerplate is, what ships in it, what ships as a recipe, and how it installs. This is the document from which the boilerplate is implemented.

---

## 1. What AppySentinel Is

AppySentinel is a **single-host, observer-only, always-on local data coordinator boilerplate**. A Sentinel runs on one host. It **collects** data from local sources and from remote machines via collectors like `orchestrator-ssh` — it does not need to be installed on every machine it observes. It normalises data into a common envelope, **makes it accessible via the Access zone** (API / CLI / MCP), and **delivers** it outward to zero or more downstream systems. It runs standalone by default — no dashboard or central system is required for it to function.

The intended pattern is one Sentinel per machine — each knowing its local environment deeply. The AppyRadar pilot uses a pragmatic shortcut: one Sentinel on one orchestrator host collects from five remote machines over SSH, working around the absence of fleet-wide install tooling. This shortcut is not the target architecture; it is a workaround for the fleet deployment gap (see §11 and the pattern catalogue gap summary).

Major use cases include telemetry collection, structured snapshots, database mirroring, and event capture. OpenTelemetry alignment is preserved at the Signal envelope (see §6).

AppySentinel is **headless**. It has no UI. Visualisation, dashboards, and control planes are separate applications that consume a Sentinel through its Access zone surfaces (API / CLI / MCP). Conflating data coordination with visualisation is the failure mode AppySentinel exists to prevent.

AppySentinel is **not** AppyStack. AppyStack builds web apps (RVETS: React + Vite + Express + TypeScript + Socket.io). AppySentinel builds always-on local data coordinators — headless, long-running, lightweight. Viewers that visualise Sentinel data are built separately (typically on AppyStack) and are not part of this boilerplate.

---

## 2. Why Standalone Matters

Sentinels are first in the boot sequence and last to shut down. Three reasons this is architecturally load-bearing:

- **Boot-up telemetry**: A Sentinel must be able to capture the startup of heavier apps. If the Sentinel depends on a dashboard to run, it cannot observe the dashboard starting.
- **Lightweight vs heavyweight**: Observers are small, cheap, always-on. Dashboards are heavy, optional, on-demand. Coupling them forces the observer to carry dashboard cost.
- **Temporal event independence**: Events happen whether anything is listening or not. The Sentinel records them; consumers subscribe when and if they want.

Dashboards, aggregators, and cross-machine coordinators are downstream consumers. They are separate AppyStack apps that read what Sentinels publish.

---

## 3. Canonical Architecture

Three layers, inherited from the architecture brief but tightened by the Q1–Q8 decisions:

```
┌─────────────────────────────────────────────────────────────┐
│  Local Clients (AI agents, dashboards, dev tools)          │
│                  ↕ MCP / REST / Socket.io                   │
├─────────────────────────────────────────────────────────────┤
│  Sentinel (runs on one host)                                │
│  • COLLECTS data from local sources                         │
│  • Normalises into Signal envelope                          │
│  • ACCESSES via API / CLI / MCP                              │
│  • DELIVERS data outward                                    │
│  • PULLS configuration inward                               │
├─────────────────────────────────────────────────────────────┤
│  Central System (optional, separate app)                    │
│  • Aggregates multi-machine telemetry                       │
│  • Serves configuration                                     │
│  • Provides dashboards                                      │
└─────────────────────────────────────────────────────────────┘
```

Rules:
- **Push for data, pull for config** — no inbound network connections required at the Sentinel.
- **Observer-only** — Sentinels read, never mutate the systems they observe (unless explicitly opted-in via a future `mcp-tools` recipe). This is the Q-side constraint of CQRS, applied by default.
- **Single-process per Sentinel** — multi-instance coordination is out of scope for v1.
- **One host, one-or-more Sentinels** — each Sentinel is a discrete process with its own config and data dir. A Sentinel can collect from remote machines via collectors like `orchestrator-ssh`; it does not need to run on every machine it observes.

---

## 4. Tech Stack Spine

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict) |
| Runtime | Bun recommended; Node supported (core code stays Node-compatible) |
| HTTP / access binding | Hono on `Bun.serve` (or Node equivalent) |
| Validation | Zod |
| Logging | Pino |
| File watching | chokidar |
| Subprocess | Bun / Node `spawn` with streaming |
| Testing | Bun test runner (Vitest-compatible API; `bun test` in practice) |
| Quality tooling | `@appydave/appysentinel-config` (ESLint + Prettier + tsconfig — `packages/config/`) |
| Distribution | `bun build --compile` for single-binary builds |
| OTel alignment | Conventions followed (signal kinds, attributes, timestamps); no OTel library dependency. An `otlp-push` transport recipe can translate Signal → OTLP without loss. |

**Explicitly NOT in the spine** (these are recipes, not core):
- Socket.io, REST, MCP — interface recipes
- SQLite, JSONL, ring buffer — storage recipes
- HTTP, OTLP, Supabase, Socket.io, file-relay — transport recipes
- launchd, systemd, PM2, Docker — runtime recipes
- React, Vite, any frontend — not a Sentinel concern

---

## 5. What's Baked In

These are plumbing primitives — every Sentinel gets them. They are shipped as code, not recipes.

**Why baked in?** Every always-on headless process faces the same seven unavoidable problems regardless of what it collects or where it delivers. If these weren't baked in, every recipe author would reinvent them — inconsistently. The seven primitives form a minimum viable foundation: a common data contract (Signal), a decoupling layer (SignalBus), a process harness (Lifecycle), safe configuration loading (ConfigLoader), crash-safe file writes (AtomicWrite), ordered concurrent I/O (SerialQueue), and structured visibility (Logger). Remove any one and either the recipes couple directly to each other, or the process becomes unsafe to run unattended.

**Why not recipes?** Recipes are optional — you pick the ones your Sentinel needs. These seven are not optional. A Sentinel without graceful shutdown corrupts data on restart. A Sentinel without a shared Signal contract cannot route anything. They are the floor, not the furniture.

### 5.1 Signal envelope and payload interface

TypeScript types for the common event contract. See §6 for full definition.

### 5.2 Internal event bus

A lightweight pub/sub so collectors emit signals and transports / stores subscribe without direct coupling.

```typescript
interface SignalBus {
  /** Fire-and-forget. Handler errors route to onError, never propagate. */
  emit(signal: Signal): void;
  /** Await every handler. Use only for back-pressure (e.g. shutdown flush). */
  emitAndWait(signal: Signal): Promise<void>;
  /** Subscribe. Returns an unsubscribe function. */
  on(handler: (signal: Signal) => void | Promise<void>): () => void;
  /** Count of active subscribers. Useful for diagnostics and tests. */
  size(): number;
}
```

### 5.3 Lifecycle harness

```typescript
interface Lifecycle {
  start(): Promise<void>;
  stop(reason: 'sigint' | 'sigterm' | 'reload' | 'fatal'): Promise<void>;
  reload(): Promise<void>;
  health(): HealthReport;
}
```

Handles:
- `SIGINT` / `SIGTERM` — graceful shutdown (flush queues, close handles)
- `SIGHUP` — config reload
- `health()` — synchronous snapshot for `/health` endpoints

### 5.4 Config loader

Hierarchical: built-in defaults → config file → env vars. Validated through a Zod schema (passed at construction, not at call time). Reloadable on SIGHUP.

```typescript
// Schema and options provided at construction:
const loader = createConfigLoader<T>({ schema, defaults?, filePath?, env?, envSource? });

interface ConfigLoader<T> {
  load(): Promise<T>;
  reload(): Promise<T>;
  onChange(handler: (config: T) => void): () => void;  // returns unsubscribe
  current(): T | undefined;
}
```

### 5.5 Atomic file write helper

Temp-file + rename pattern. Essential for crash safety with flat-file stores.

```typescript
async function atomicWrite(
  path: string,
  content: string | Uint8Array,
  options?: { mode?: number; encoding?: BufferEncoding; fsync?: boolean }
): Promise<void>;
```

### 5.6 Serial async queue

Promise-chain serialisation primitive. Non-blocking to callers; guarantees ordered I/O.

```typescript
class SerialQueue {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  drain(): Promise<void>;
}
```

### 5.7 Logger

Pre-configured Pino, structured, with child-logger support and env-driven level.

```typescript
const logger = createLogger({ name: 'sentinel', level: env.LOG_LEVEL });
```

### 5.8 Sentinel factory (`createSentinel`)

The main consumer API. Wires Signal + Bus + Lifecycle + Logger into a single facade. Every scaffolded `main.ts` uses this; the primitives above are rarely called directly.

```typescript
const sentinel = createSentinel({ name: string, machine: string, sentinelId?: string });

interface Sentinel {
  // Identity
  readonly name: string;
  readonly machine: string;
  readonly sentinelId: string;
  readonly logger: Logger;
  // Escape hatches
  readonly bus: SignalBus;
  readonly lifecycle: Lifecycle;
  // Emit
  emit<P>(input: SignalInput<P>): Signal<P>;
  emitAndWait<P>(input: SignalInput<P>): Promise<Signal<P>>;
  on(handler: (signal: Signal) => void | Promise<void>): () => void;
  // Lifecycle
  start(): Promise<void>;
  stop(reason?: string): Promise<void>;
  reload(): Promise<void>;
}
```

Nothing happens until `sentinel.start()` is called. Recipes register hooks on `sentinel.lifecycle` before start.

---

## 6. The Signal Envelope

The **Signal** is the atomic unit of telemetry that a Sentinel emits. The envelope is a common outer contract; the payload is collector-specific.

### 6.1 Naming rationale

- **Signal** — the envelope type, chosen for distinctness from OTEL's "log/metric/event/span" and from domain-specific "event" / "record". A Sentinel emits Signals.
- **Telemetry** — the problem domain.
- **Sentinel** — the runtime identity.
- **Collector** — the functional role (input recipe).

### 6.2 Envelope definition

```typescript
/**
 * Signal — the common outer envelope every emitted record conforms to.
 * Outer fields are stable; payload is recipe-specific and typed through the
 * Payload interface pattern (see §6.4).
 */
export interface Signal<P extends SignalPayload = SignalPayload> {
  /** Unique ID (ULID recommended). */
  id: string;

  /** ISO 8601 timestamp when the signal was minted. */
  ts: string;

  /** Schema version for the outer envelope. */
  schema_version: string;

  /** Logical source within this Sentinel (e.g. 'watch-directory', 'poll-command'). */
  source: string;

  /** Machine identifier. */
  machine: string;

  /** Sentinel instance identifier (multiple Sentinels per machine are allowed). */
  sentinel_id: string;

  /** Kind of signal — high-level classification for routing. */
  kind: SignalKind;

  /** Name — collector-local semantic label (e.g. 'file.created', 'cpu.usage'). */
  name: string;

  /** Severity for log-like signals; optional for others. */
  severity?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

  /** Flat key/value attributes for indexing and filtering (OTEL-style). */
  attributes?: Record<string, string | number | boolean | null>;

  /** Collector-specific typed payload. */
  payload: P;
}

export type SignalKind =
  | 'log'       // point-in-time record
  | 'metric'    // numeric measurement
  | 'event'     // domain occurrence
  | 'state'     // snapshot of system state
  | 'span';     // time-bounded operation (optional / future)
```

### 6.3 OTEL alignment

OTEL is a reference model, not a dependency. Alignment choices:

- `attributes` follows OTEL's flat k/v semantic.
- `SignalKind` maps to OTEL primitives (log, metric, event, state ≈ resource snapshot, span).
- `schema_version` and `ts` (ISO 8601) mirror OTEL conventions.
- An `otlp-push` transport recipe can translate Signal → OTLP without loss.

### 6.4 Payload interface pattern

Each collector defines its own payload interface. The boilerplate ships a base type plus an `event-normaliser` recipe that documents the pattern.

```typescript
/** Base marker — every payload implements this. */
export interface SignalPayload {}

/** Example: watch-directory collector payload. */
export interface WatchDirectoryPayload extends SignalPayload {
  path: string;
  event: 'add' | 'change' | 'unlink';
  size?: number;
  checksum?: string;
}

/** Example: poll-command collector payload. */
export interface PollCommandPayload extends SignalPayload {
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}
```

Collector authors declare a payload interface. Consumers narrow via `signal.source` / `signal.kind` / `signal.name`. No runtime discriminator gymnastics; the envelope is stable, the payload is typed.

### 6.5 What the envelope is not

- Not a full OTEL span/trace model — Sentinels can optionally emit spans via the future `span` kind, but correlation and context propagation are not baked in.
- Not a schema registry — payloads are documented per-recipe, not centrally enforced.
- Not a wire format — transports may re-shape signals before sending (e.g. `otlp-push` maps to protobuf).

---

## 7. Recipe Catalogue

Recipes are **capability descriptions (markdown specs), not code templates**. They describe what to build and when; implementations are generated per-project by the install agent or hand-written by the developer. This matches AppyStack's March 2026 shift.

All recipes live in `.claude/skills/recipe/` in the scaffolded project.

### 7.0 Three zones: Collect / Access / Deliver

Zones are named by direction of data flow. The same HTTP server can sit in different zones depending on role — receiving a webhook is Collect, serving a query is Access. Role, not technology, picks the zone.

Think of the Sentinel standing in the middle. Data moves in three directions:

- **Collect** (§7.1) — data flows *into* the Sentinel. It reaches out and pulls, or listens for things arriving. Event-driven (webhooks, file watchers, stdin streams) or pulse-driven (HTTP polls, SQL diffs, shell commands, SSH polls).
- **Access** (§7.3) — bidirectional interface layer. The Sentinel makes itself readable and optionally accepts control commands. Primarily local — Sentinels are not cloud services; the consumer is typically a local AI agent, developer tool, or dashboard on the same machine or tailnet. Three bindings following Anthropic's API/CLI/MCP framework[^1]: `api-binding`, `cli-binding`, `mcp-binding`.
- **Deliver** (§7.4) — data flows *outward* from the Sentinel. It pushes to downstream systems — a central aggregator, a dashboard, a cloud store, an OTLP collector. This is how multiple Sentinels feed a single control layer.

**Why Access is local-first.** Sentinels run on the host they observe. They are not internet-facing services. Access assumes the consumer is nearby — on the same machine, or reaching over Tailscale. This is by design: a Sentinel that requires external connectivity to function is fragile in exactly the ways §2 argues against.

**Access is bidirectional by design.** Query = read side; Command = write side. Command is opt-in, never default. A Sentinel should never accept remote writes unless explicitly configured to do so. The observer-only default means every Sentinel starts query-only and opts into Command deliberately. See §7.3 for the CQRS-lite pattern.

Internal recipes (storage §7.2, enrichment §7.5) sit between the zones — they process data after collection and before access or delivery. Operational recipes (runtime §7.6) and cross-cutting concerns (coordination §7.7, security — TBD) are orthogonal.

**Open design decision — configuration pull as a fourth direction.** The architecture (§3) lists a fourth verb: `PULLS configuration inward`. A Sentinel that is part of a multi-Sentinel fleet needs to receive its configuration from a central control layer — either pushed by the controller or pulled by the Sentinel on a schedule. This does not fit cleanly under Collect (data, not control) or Access (outward-facing interface). It is currently filed under coordination recipes (§7.7, `config-pull`). Whether it warrants a fourth zone or remains a coordination concern is unresolved.

**Recipe dependencies.** Each recipe owns its own runtime libraries. Core ships a slim baseline (`pino`, `ulid`, `zod`); transport-specific libraries (chokidar, hono, MCP SDK, etc.) are pulled into the project by the install agent only when their recipe is selected. A Sentinel that doesn't watch files does not carry chokidar.

[^1]: Anthropic, *Building agents that reach production systems with MCP* (2026-04-22). <https://claude.com/blog/building-agents-that-reach-production-systems-with-mcp>. The framework: Direct API as the foundation, CLI for local-first environments, MCP for cloud-based agents — non-substitutable layers, mature integrations ship all three.

### 7.1 Collect recipes (8)

| Recipe | One-line spec |
|--------|----------------|
| `watch-directory` | chokidar-based file watcher with debounce, filter, and event normalisation |
| `watch-logfile` | tail a log file with rotation detection and line parsing |
| `poll-http` | periodic HTTP GET against an endpoint; emits response + timing |
| `poll-command` | periodic shell command execution; emits stdout/stderr/exit-code |
| `orchestrator-ssh` | poll remote machines via `ssh -s` bash; no remote agent install (AppyRadar pattern) |
| `hook-receiver` | HTTP webhook endpoint that accepts external events and emits Signals (AngelEye pattern) |
| `subprocess-wrap` | spawn and supervise a long-running subprocess; stream output into Signals |
| `snapshot-capture` | take a periodic structured snapshot of system state |

### 7.2 Storage recipes (3)

**Why file-based is the default.** Sentinels are designed to be droppable onto a machine without a support burden. SQL databases introduce schema migrations, installation configuration, and multi-machine sync complexity — all of which create support nightmares. A flat file can be opened and read directly; a SQLite database requires tooling. File-based storage has zero setup overhead and is trivially debuggable. SQLite is available as a non-default recipe for cases that genuinely earn it.

**How to choose.** The question is: *is this data about what IS, or what HAPPENED?*
- **Current state** (what are my 5 machines doing right now, what is the fleet's health) → `snapshot-store`. Overwrite the file each collection cycle. Readers always get the latest picture.
- **History** (what events occurred, what changed over time) → `jsonl-store`. Append each event. The record accumulates; you can replay it or query back in time.
- **Recent-only** (last N signals for a live health check, no persistence needed) → `memory-buffer`. High-frequency signals where history has no value.

This choice maps directly to the Signal's `kind` field (§6): `state` kind signals → snapshot-store; `log` and `event` kind signals → jsonl-store.

| Recipe | One-line spec |
|--------|----------------|
| `jsonl-store` | append-only JSONL files per entity + index JSON (AngelEye / FliHub pattern) |
| `snapshot-store` | single overwriting JSON file via atomic-write; full state on each cycle (AppyRadar pattern) |
| `sqlite-store` | Bun-native SQLite with schema migration on boot — non-default, must earn its place |
| `memory-buffer` | in-memory ring buffer, ephemeral, configurable size |

### 7.3 Access zone

The Access zone is the bidirectional interface layer. It is structured into three sub-layers:

```
src/access/
├── query/      ← read logic. Pure functions over snapshot data. No transport knowledge.
├── command/    ← write logic (opt-in). Sentinel self-management only. Observer-only invariant holds.
└── bindings/   ← thin protocol adapters. MCP, HTTP, CLI. Call query/ or command/.
```

**Design pattern: CQRS-lite.** Query is the read side; Command is the write side. Any binding can call any query function. Any binding can call any command function. Bindings own no logic — they translate between protocol and the query/command layer. CQRS applies to Access only; Collect and Deliver are separate patterns.

**What Command is (important — easy to get wrong).** Commands control the Sentinel itself. They do not reach through to observed systems.
- ✅ `addMachine({ name, host })` — adds a machine to the fleet config
- ✅ `triggerCollection('mary')` — fires an immediate collection cycle outside the scheduled interval
- ✅ `reloadConfig()` — reloads the sentinel's config file without restart
- ❌ `rebootMachine('mary')` — not a command; violates observer-only
- ❌ `deployApp(...)` — not a command; sentinel is not a control plane for observed systems

**Command functions are stateless.** They do not hold references to runtime objects or running loop state. Effects that need to reach the collection loop — pausing a machine, requesting an early collection — are communicated via files in a `state/` directory. The collection loop reads these files at the top of each tick. This keeps command functions pure (read file → modify → write file → return result) and the loop as the single stateful actor. The pattern mirrors query functions reading from `snapshots/` — both sides of Access communicate through the filesystem, not through shared memory. This is the correct answer to the "commands need to reach loop state" problem; shared memory between the command layer and the loop is the wrong answer.

**`state/` directory convention.** Sentinel projects carry a `state/` directory at the project root (sibling to `snapshots/`). It is gitignored — these are runtime signals, not config. Standard files:
- `paused.json` — array of machine names the loop should skip. Written by `pauseCollection` / `resumeCollection`. Read by the loop at the top of each tick.
- `trigger.json` — one-shot early collection request `{ requested_at, machine }`. Written by `triggerCollection`. The loop consumes it at the top of the next tick, deletes the file, runs the collection immediately. One-shot: consumed once, gone.

The loop is the only reader of `state/`. Commands write; the loop reads. No other coupling needed.

**`investigateMachine` command pattern.** Runs a one-off collection for a single machine and patches the result into the fleet snapshot immediately, without waiting for the next scheduled tick. Pattern: read config → call the collect function directly (the same pure function the loop uses) → patch snapshot → return result. Because the collect function is a pure function over machine config, `investigateMachine` requires no special runtime access. Use cases: machine onboarding (call from `addMachine`), post-maintenance verification, debugging a specific machine's current state.

**QueryResult<T>.** All query functions return `QueryResult<T>` (exported from `@appydave/appysentinel-core`). The `data_age_ms` and `stale` fields are first-class — agents need freshness metadata to decide whether to trigger a recollect.

Following Anthropic's API/CLI/MCP framework (see §7.0 footnote). Mature Sentinels ship all three bindings; new ones start with whichever surface matches the primary consumer environment.

| Recipe | One-line spec |
|--------|----------------|
| `api-binding` | Hono HTTP API with Zod request/response and auto-generated OpenAPI. Thin adapter; routes to `query/` or `command/`. The foundation; reachable by any HTTP client. |
| `cli-binding` | Shell tool that queries the local Sentinel. Thin adapter; routes to `query/`. For local-first developer composition (pipe to jq, grep, etc.) and on-machine agent loops. |
| `mcp-binding` | MCP server exposing resources / tools / prompts. Thin adapter; routes to `query/` or `command/`. Standardised, portable surface for AI agents and cross-client integrations. |

Real-time push to subscribers (Socket.io / SSE) is a Viewer concern. Viewers subscribe to a Sentinel via whichever surface they prefer; they may run their own real-time fan-out on top. Not part of the boilerplate's access set.

**MCP stdio binding — stdout is poison.** MCP stdio uses stdout exclusively for its JSON-RPC protocol. Any output to stdout from the MCP process — logger output, `console.log`, startup messages — corrupts the protocol and crashes the connection, often silently. This is the most common MCP failure mode in practice.

Rules:
1. The `mcp-binding` entry point must never import or start `main.ts`. It is a standalone process.
2. All logging inside the MCP process must go to stderr: `pino({ level: 'info' }, pino.destination(2))`.
3. `claude mcp add` must point at the binding file directly, never at `src/main.ts`.
4. For on-demand Sentinels (no persistent collection loop), `trigger_collect` must call `collector.collect()` and await it — not write a trigger file and return. There is no background loop to pick up the trigger file.

**Port allocation.** When wiring an `api-binding`, check `~/.config/appydave/apps.json` before choosing a port — this is the AppyDave ecosystem's static port registry, shared by AppyStack apps, tools, and Sentinels. Sentinel API ports are reserved in the `5082+` range (increment by +10 per Sentinel). Configure via `.env` (`SENTINEL_API_PORT`). Register the port in `apps.json` before starting the project so downstream consumers can discover the endpoint without runtime lookup. MCP stdio bindings have no port; only HTTP (`api-binding`) needs a port reservation.

**Remote access / CoWork integration.** Sentinels bind to localhost by default — this is intentional. Claude CoWork and other remote AI agents cannot reach `localhost` directly; they require an `https://` URL. To expose a local Sentinel to a remote agent without changing its local-first design, use a tunnel:

| Option | Effort | Stable URL | Notes |
|--------|--------|-----------|-------|
| **Tailscale Funnel** | Low | Yes (persistent) | Recommended. Already in use across the AppyDave fleet. One command: `tailscale funnel <port>` → stable `https://<machine-name>.ts.net` URL. Works immediately with CoWork. |
| **ngrok** | Low | No (free tier) | URL changes on restart unless you pay. Useful for quick one-off testing. |
| **Cloudflare Tunnel** | Medium | Yes | Free stable subdomain. More config. Worth it for persistent multi-machine setups. |
| **VPS reverse proxy** | High | Yes | Full control. Overkill for personal fleet tools. |

Tailscale Funnel is the recommended default for the AppyDave ecosystem. Steps: `tailscale funnel <PORT>` (enable once per port), then give the `https://<machine-name>.ts.net` URL to CoWork. The Sentinel itself needs no changes — Funnel proxies from the internet-facing Tailscale endpoint to the local port. Disable with `tailscale funnel --bg <PORT> off` when done.

This pattern keeps the Sentinel local-first (no change to `api-binding` or any config) while allowing remote AI agents to reach it on demand.

### 7.4 Deliver recipes (5)

| Recipe | One-line spec |
|--------|----------------|
| `http-push` | POST batched Signals to a remote HTTP endpoint with retry + backoff |
| `socketio-push` | push Signals via Socket.io client |
| `otlp-push` | translate Signals → OTLP and push via gRPC or HTTP/protobuf |
| `supabase-push` | push Signals into Supabase JSONB telemetry table |
| `file-relay` | rsync / file-drop into a shared folder (Syncthing / network mount) |

### 7.5 Enrichment recipes (4)

| Recipe | One-line spec |
|--------|----------------|
| `deterministic-classifier` | rules-based Signal enrichment (counts, flags) — AngelEye Tier 1 |
| `heuristic-classifier` | regex / pattern-based enrichment — AngelEye Tier 2 |
| `llm-classifier` | semantic enrichment via LLM call — AngelEye Tier 3 |
| `event-normaliser` | map collector-specific raw events into unified Signal envelope (canonical reference) |

### 7.6 Runtime recipes (4)

| Recipe | One-line spec |
|--------|----------------|
| `register-as-launchd` | macOS launchd plist + install / uninstall scripts |
| `register-as-systemd` | Linux systemd unit file + install scripts |
| `register-as-pm2` | PM2 ecosystem file for cross-platform |
| `register-as-docker` | Dockerfile + compose for containerised deployment |

### 7.7 Coordination recipes (3)

| Recipe | One-line spec |
|--------|----------------|
| `config-pull` | periodically pull config from a central endpoint and hot-reload |
| `machine-role` | role-based capability branching (recorder / editor / orchestrator) |
| `sentinel-mesh` | Sentinels discover and read from each other's interfaces |

---

## 8. Install Architecture

Two-layer install: a static CLI scaffolds mechanics; an agent-driven handoff runs configuration.

### 8.1 Layer 1 — static CLI (`create-appysentinel`)

Pure mechanical scaffolding. No intelligence. Zero LLM calls.

Responsibilities:
1. Parse name + scope + target directory (flags or @clack/prompts)
2. Copy the minimal template (core plumbing only — §5)
3. Apply basic string substitutions (scope, name, machine identifier)
4. `git init` + first commit
5. `bun install` / `npm install`
6. Write `.env` skeleton with required variables
7. Write `appysentinel.json` baseline (version, scaffoldCommit)
8. Hand off to Layer 2

### 8.2 Layer 2 — agent handoff

At the end of Layer 1, auto-launch headless Claude Code:

```bash
claude -p "Run the AppySentinel configuration interview. \
  The project is scaffolded at {path}. \
  Read .claude/skills/configure-sentinel/SKILL.md and proceed."
```

**Claude Code is a hard runtime dependency at install time.** Without it, the CLI fails with a clear error pointing to install instructions.

The agent is responsible for:
- Interviewing the developer on interface choice (MCP / REST / both / none)
- Interviewing on input collectors (which to wire, from §7.1)
- Interviewing on storage (§7.2)
- Interviewing on transport (§7.4) — may be "none" for local-only Sentinels
- Interviewing on runtime (§7.6) — may be "none" for dev-only
- Generating code for chosen recipes into the project
- Validating the result starts and emits a smoke-test signal

### 8.3 Flow diagram

```
┌─────────────────────────────────────────────┐
│  user: npx create-appysentinel my-sentinel  │
└─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  Layer 1 — static CLI                       │
│  • prompt name / scope                      │
│  • copy template (core plumbing only)       │
│  • string-replace placeholders              │
│  • git init, install deps, .env skeleton    │
│  • write appysentinel.json                  │
└─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  Layer 2 — agent handoff                    │
│  exec: claude -p "<bootstrap prompt>"       │
└─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  Claude runs configure-sentinel skill       │
│  • interview: interface (default MCP)       │
│  • interview: collectors                    │
│  • interview: storage / transport / runtime │
│  • generate code for chosen recipes         │
│  • smoke-test: run once, emit one signal    │
└─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  ready: bun dev                             │
└─────────────────────────────────────────────┘
```

### 8.4 Access binding defaults

During the interview, the agent asks which binding(s) to wire (see §7.3). Per Anthropic's API/CLI/MCP framework, mature Sentinels ship all three; new ones start with the binding that matches the primary consumer environment.

The suggested default is **`mcp-binding`** for projects whose primary consumer is an AI agent. Local-first developer tooling starts with `cli-binding` and/or `api-binding`. The agent presents tradeoffs explicitly so the developer makes an informed choice rather than a default-driven one.

---

## 9. Sentinel Lifecycle

A Sentinel moves through four operational moments. Scaffold and Install (§8) cover the first. This section covers the rest.

| Moment | How | When to use |
|--------|-----|-------------|
| **Scaffold / Install** | `npx create-appysentinel` + agent interview | Once per project |
| **Development mode** | `bun src/main.ts` (Ctrl-C to stop) | Actively wiring recipes or changing collectors |
| **Graduation gate** | See below | When the snapshot is trustworthy and something is consuming it |
| **Deployed mode** | `bash scripts/install-service.sh` | Running unattended on a permanent host |

### 9.1 Development mode

Run manually to observe output and iterate:

```bash
bun src/main.ts
```

The process blocks in the foreground. SIGINT (Ctrl-C) triggers graceful shutdown — queues flush, handles close, the lifecycle's `stop()` runs. Use development mode while actively wiring recipes, changing collectors, or debugging signal shapes. Do not leave it running unattended; that is Deployed mode's job.

**Test mode is separate.** `bun run test` / `bun run test:watch` runs Vitest and does not start the live loop. Tests must call `sentinel.start()` and `sentinel.stop()` themselves, and must pass `installSignalHandlers: false` to `createSentinel()` to prevent signal handler leaks. See the project CLAUDE.md for the test harness pattern.

### 9.2 Graduation gate

A Sentinel is ready to deploy when two conditions are both true:

1. **The snapshot is trustworthy.** Running `bun src/main.ts` and inspecting the output produces correct, stable data. The signal shapes look right. No unexpected errors or missing fields.
2. **Something is consuming the snapshot** other than you inspecting it manually — an MCP binding is registered and an agent is querying it, or an HTTP client is polling the API, or another app is reading the file.

The graduation trigger is the shift from "I check it manually" to "something else depends on it." Until that shift happens, Deployed mode adds operational overhead with no benefit. After it happens, always-on persistence is load-bearing — missing a collection cycle is now a real problem, not just an inconvenience.

Track graduation state per-pilot in `docs/graduation-candidates.md` (see pattern catalogue, Capability Graduation section).

### 9.3 Deployed mode

Register the Sentinel as a persistent background service:

```bash
bash scripts/install-service.sh
```

On macOS this writes a launchd plist to `~/Library/LaunchAgents/` and loads it. On Linux the equivalent is a systemd unit. Once deployed:

- The service starts automatically on login (launchd) or boot (systemd).
- Crashes trigger automatic restart.
- Logs go to the path specified in the plist (typically `logs/sentinel.log` in the project directory).

**After a code change**, the service must be restarted to pick it up:

```bash
# macOS — replace <project-name> with the value in the plist label
launchctl kickstart -k gui/$(id -u)/com.appydava.<project-name>
```

The `kickstart -k` flag kills the running instance and starts a fresh one. The Sentinel's graceful shutdown (SIGTERM handler) runs before the new process starts, so in-flight writes complete cleanly.

**MCP registration scope.** When registering the Sentinel's MCP binding with Claude Code, use `--scope user`, not the default project scope:

```bash
claude mcp add --scope user <name> -- bun /path/to/sentinel/src/main.ts mcp
```

Default project scope means the binding is only available when Claude Code is opened in that project folder. User scope makes the tools available in every Claude Code session on the machine — the correct behaviour for a machine-resident daemon. Sentinels are not project-specific tools; their MCP surfaces should follow the developer everywhere.

**Install scripts are project-level.** `scripts/install-service.sh` and `scripts/uninstall-service.sh` are local to each scaffolded project. They are intentionally not a shared recipe in core — the service name, plist label, and paths are Sentinel-specific. Improvements to one project's install scripts must be applied to other projects manually until a `register-as-launchd` recipe is promoted to core (planned, not yet scheduled).

### 9.4 Dev-while-deployed workflow

When you need to actively iterate on a Sentinel that is already deployed as a service, unload the service first to avoid two processes fighting over the same files and ports:

```bash
# Unload — stops the service; does not delete the plist
launchctl unload ~/Library/LaunchAgents/com.appydave.<project-name>.plist

# Work manually
bun src/main.ts

# Reload when done
launchctl load ~/Library/LaunchAgents/com.appydave.<project-name>.plist
```

Never run the manual process and the service simultaneously. They share the same snapshot file, state directory, and (if bound) port. Only one instance should own those at a time.

### 9.5 On-demand deployment (no persistent service)

Not every Sentinel needs to run continuously. A legitimate and clean deployment pattern is **on-demand**: the Sentinel runs only when invoked, completes its work, and exits. No launchd plist. No background process.

This pattern suits Sentinels where:
- Collection is triggered by an external caller (an AI agent calls `trigger_collect` via MCP, or a cron calls the CLI)
- The mirror or snapshot already on disk is recent enough for most queries, and freshness is checked via `data_age_ms` in `QueryResult<T>`
- The cost of maintaining a persistent daemon outweighs the benefit (e.g., collection happens a few times per day, not continuously)

**How it works:** The MCP binding uses stdio transport — Claude Code or another agent starts the Sentinel process, the MCP handshake completes, tools are called, the process exits when the caller disconnects. A `trigger_collect` tool causes the Sentinel to run a full collection synchronously before returning.

**State directory still applies.** Even in on-demand mode, commands must write to `state/trigger.json` — not because a background loop reads it, but because the `main.ts` startup sequence checks for a pending trigger and runs collection immediately if one is present. This makes the pattern composable: on-demand today, persistent service tomorrow, same code.

**Graduation path.** On-demand → deployed service is a one-step upgrade: `bash scripts/install-service.sh`. The code does not change.

---

## 10. Upgrade Story

**Upgrade is agentic (v1.1 priority, not v1).**

The `appysentinel-upgrade` command launches Claude with an upgrade skill that:
1. Reads the project's current state (`appysentinel.json`, installed recipes, customisations)
2. Compares against the latest template and recipe specs
3. Surfaces conflicts and proposed changes
4. Walks the developer through resolution with smart questions
5. Applies changes, updates `appysentinel.json`

This is deferred to v1.1 so that v1 can ship the install agent first. The four-tier static classification from AppyStack (`auto` / `recipe` / `never` / `owned`) is **not** adopted — it doesn't scale to the complexity AppySentinel will accumulate.

---

## 11. Terminology & Naming

| Term | Meaning |
|------|---------|
| **Telemetry** | The problem domain — collection, transmission, analysis of system data. |
| **Sentinel** | The runtime identity — one long-running process on one machine observing local signals. |
| **Signal** | The event unit — the normalised envelope emitted by a Sentinel. |
| **Collector** | The functional role — a component that gathers raw data and emits Signals. An input recipe. |
| **AppySentinel** | The boilerplate itself — what you scaffold to build a Sentinel. |
| **Recipe** | A capability description (markdown spec) for adding a specific capability to a Sentinel. |
| **OTEL** | The reference model. Inspiration, not dependency. |

Capitalisation: **Sentinel** (capitalised when referring to the identity), **Signal** (capitalised when referring to the envelope type). Lowercase when used as ordinary nouns in narrative prose.

---

## 12. Non-Goals

AppySentinel is not:

- **Not a mutator** — observers never write back to the systems they observe. Mutation (FliHub-style sync actions, remote command execution) is out of scope for v1. Opt-in future via `mcp-tools` recipe; not default.
- **Not a dashboard framework** — visualisation is a separate concern, built as an AppyStack app consuming Sentinel output.
- **Not an orchestrator** — multi-machine coordination, fleet-wide config, and aggregation are dashboard-layer / central-system concerns. The `orchestrator-ssh` recipe is a specialised input, not the canonical shape.
- **Not a full observability platform** — no Datadog, no ELK, no SIEM. Sentinels are lightweight publishers.
- **Not a distributed streaming system** — no Kafka, no durable queues. Transports are best-effort with local buffering.
- **Not a fleet-wide config authority** — config is local; optional central pull is best-effort.
- **Not a schema registry** — payload schemas are per-recipe, documented in recipe specs, not centrally enforced.
- **Not OpenTelemetry** — OTEL-inspired; not a full OTEL implementation.

---

## 13. Open Recipe Specs (Build Order)

Recipes to write next, in priority order. Each lands as a single `.md` file in the recipe catalogue and includes: purpose, interface, dependencies, generated code shape, composition notes.

1. **`event-normaliser`** — the canonical reference for the Signal envelope + payload pattern. All other recipes reference this. Write first.
2. **`mcp-binding`** — default interface, primary consumer surface. Needed for the install agent's smoke test.
3. **`watch-directory`** — canonical input recipe. Exercises chokidar, debounce, normalisation. Most visual and easiest to stress-test.
4. **`jsonl-store`** — default storage recipe. Uses the atomic-write and serial-queue primitives from §5.
5. **`http-push`** — default outbound transport. Exercises batching, retry, backoff.

After those five, the remaining recipes can be written in any order. `llm-classifier`, `otlp-push`, and `sentinel-mesh` are explicitly lower priority (further from the 80% case).

---

## 14. Reference Implementations

Two sketches showing what common collectors look like when rebuilt on AppySentinel.

### 14.1 AngelEye-style collector (hook receiver + JSONL store + classifier)

**Recipes wired**: `hook-receiver` + `api-binding` + `jsonl-store` + `deterministic-classifier` + `heuristic-classifier` + `event-normaliser`. (Socket.io fan-out is a Viewer concern — not an Access binding.)

Shape:

```typescript
// src/main.ts
import { createSentinel } from '@appydave/appysentinel';
import { hookReceiver } from './recipes/hook-receiver';
import { jsonlStore } from './recipes/jsonl-store';
import { deterministicClassifier } from './recipes/deterministic-classifier';
import { heuristicClassifier } from './recipes/heuristic-classifier';
import { mcpBinding } from './recipes/mcp-binding';
import { apiBinding } from './recipes/api-binding';

const sentinel = await createSentinel({
  name: 'angeleye',
  machine: process.env.MACHINE_NAME!,
});

// Input: Claude Code hooks → Signal bus
hookReceiver(sentinel, {
  port: 5501,
  eventMap: { /* 24 hook types → Signal names */ },
});

// Enrichment: run on `stop` and `session_end` signals
deterministicClassifier(sentinel, { /* tool-count rules */ });
heuristicClassifier(sentinel, { /* regex patterns */ });

// Storage: append to JSONL, update registry index
jsonlStore(sentinel, {
  dataDir: '~/.claude/angeleye',
  partition: (signal) => signal.attributes?.session_id ?? 'default',
});

// Access: query via MCP + REST API
mcpBinding(sentinel, { /* resources, tools */ });
apiBinding(sentinel, { port: 5051 });
// (Real-time fan-out via Socket.io is a Viewer concern — the AngelEye dashboard
//  subscribes to the api-binding stream and runs its own socket layer.)

await sentinel.start();
```

What the boilerplate gives this collector for free: Signal envelope, event bus, lifecycle, atomic writes, serial queue, Pino logger, Zod config.

### 14.2 AppyRadar-style system monitor (orchestrator + snapshot + Supabase)

**Recipes wired**: `orchestrator-ssh` + `snapshot-capture` + `memory-buffer` + `supabase-push` + `mcp-binding` + `register-as-launchd`.

Shape:

```typescript
// src/main.ts
import { createSentinel } from '@appydave/appysentinel';
import { orchestratorSSH } from './recipes/orchestrator-ssh';
import { snapshotCapture } from './recipes/snapshot-capture';
import { memoryBuffer } from './recipes/memory-buffer';
import { supabasePush } from './recipes/supabase-push';
import { mcpBinding } from './recipes/mcp-binding';

const sentinel = await createSentinel({
  name: 'appyradar',
  machine: 'macbook-pro',
});

// Input: SSH into 5 machines daily, run bash collectors
orchestratorSSH(sentinel, {
  machines: [/* 5 machines */],
  scripts: { identity, system, disk, tools, apps, gitRepos },
  schedule: 'daily',
});

// Combine into one snapshot Signal
snapshotCapture(sentinel, {
  name: 'fleet.snapshot',
  combine: (signals) => ({ /* shape */ }),
});

// Buffer + push
memoryBuffer(sentinel, { maxSize: 10 });
supabasePush(sentinel, {
  url: process.env.SUPABASE_URL!,
  key: process.env.SUPABASE_KEY!,
  table: 'telemetry',
});

// Access: query fleet snapshot via MCP
mcpBinding(sentinel, { /* expose latest snapshot as a resource */ });

await sentinel.start();

// At install time, register-as-launchd wrote the plist — nothing to do here
```

What changes from the AppyRadar PoC: SSH layer, status detection, envelope, and Supabase client all come from recipes. The bespoke code is just domain config (which machines, which scripts).

---

## 15. What's Open

Items explicitly not locked in v1 and deferred for follow-up:

- **Span support** — `SignalKind: 'span'` is in the type; correlation/context propagation is not spec'd.
- **Schema versioning policy** — how Signal schema version evolves across Sentinel versions.
- **Recipe composition validation** — detecting incompatible recipe combos at install time.
- **Sentinel-mesh protocol** — cross-Sentinel discovery and read API.
- **`mcp-tools` opt-in mutation recipe** — shape of action endpoints when observer-only is waived.
- **Single-binary distribution packaging** — `bun build --compile` is the mechanism, but signing / notarisation / update mechanism is not spec'd.
- **Telemetry of the Sentinel itself** — how a Sentinel emits its own operational metrics (meta-telemetry) is not yet a recipe.

---

*End of specification.*
