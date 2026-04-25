# AppySentinel Boilerplate Specification

**Status**: Buildable spec — v1
**Date**: 2026-04-25
**Scope**: Defines what the AppySentinel boilerplate is, what ships in it, what ships as a recipe, and how it installs. This is the document from which the boilerplate is implemented.

---

## 1. What AppySentinel Is

AppySentinel is a **per-machine, observer-only telemetry collector boilerplate**. Each Sentinel runs on the host it observes, collects local signals (files, processes, logs, snapshots), normalises them into a common envelope, and pushes outward to zero or more consumers. It runs standalone by default — no dashboard or central system is required for it to function.

AppySentinel is **not** AppyStack. AppyStack builds web apps (RVETS: React + Vite + Express + TypeScript + Socket.io). AppySentinel builds collectors — headless, long-running, lightweight. Dashboards that visualise Sentinel data are built separately on AppyStack and are not part of this boilerplate.

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
│  Sentinel (per machine)                                     │
│  • Collects local signals                                   │
│  • Normalises into Signal envelope                          │
│  • Exposes local interface (default: MCP)                   │
│  • PUSHES telemetry outward                                 │
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
- **Observer-only** — Sentinels read, never mutate the systems they observe (unless explicitly opted-in via a future `mcp-tools` recipe).
- **Single-process per Sentinel** — multi-instance coordination is out of scope for v1.
- **One machine, one-or-more Sentinels** — each Sentinel is a discrete process with its own config and data dir.

---

## 4. Tech Stack Spine

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict) |
| Runtime | Bun recommended; Node supported (core code stays Node-compatible) |
| HTTP / expose | Hono on `Bun.serve` (or Node equivalent) |
| Validation | Zod |
| Logging | Pino |
| File watching | chokidar |
| Subprocess | Bun / Node `spawn` with streaming |
| Testing | Vitest |
| Quality tooling | `@appydave/appystack-config` (ESLint + Prettier + tsconfig) |
| Distribution | `bun build --compile` for single-binary builds |

**Explicitly NOT in the spine** (these are recipes, not core):
- Socket.io, REST, MCP — interface recipes
- SQLite, JSONL, ring buffer — storage recipes
- HTTP, OTLP, Supabase, Socket.io, file-relay — transport recipes
- launchd, systemd, PM2, Docker — runtime recipes
- React, Vite, any frontend — not a Sentinel concern

---

## 5. What's Baked In

These are plumbing primitives — every Sentinel gets them. They are shipped as code, not recipes.

### 5.1 Signal envelope and payload interface

TypeScript types for the common event contract. See §6 for full definition.

### 5.2 Internal event bus

A lightweight pub/sub so collectors emit signals and transports / stores subscribe without direct coupling.

```typescript
interface SignalBus {
  emit(signal: Signal): void;
  on(handler: (signal: Signal) => void | Promise<void>): () => void;
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

Hierarchical: built-in defaults → env vars → config file. Validated through a Zod schema. Reloadable on SIGHUP.

```typescript
interface ConfigLoader<T> {
  load(schema: z.ZodType<T>): T;
  reload(): T;
  onChange(handler: (config: T) => void): void;
}
```

### 5.5 Atomic file write helper

Temp-file + rename pattern. Essential for crash safety with flat-file stores.

```typescript
async function atomicWrite(path: string, content: string | Buffer): Promise<void>;
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

### 7.1 Input / collector recipes (8)

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

| Recipe | One-line spec |
|--------|----------------|
| `jsonl-store` | append-only JSONL files per entity + index JSON (AngelEye / FliHub pattern) |
| `sqlite-store` | Bun-native SQLite with schema migration on boot |
| `memory-buffer` | in-memory ring buffer, ephemeral, configurable size |

### 7.3 Interface recipes (3)

| Recipe | One-line spec |
|--------|----------------|
| `rest-interface` | Hono REST API with Zod request/response and auto-generated OpenAPI |
| `mcp-interface` | MCP server exposing resources, tools, prompts (default when scaffolded) |
| `socketio-interface` | Socket.io server for real-time subscribers |

### 7.4 Transport recipes (5)

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

### 8.4 Interface defaults

During the interview, the agent asks which interface to wire. The suggested default is **MCP** — it matches the primary consumer profile (AI tooling, Claude, local agents). Alternatives presented: REST + Swagger, both, none (defer).

---

## 9. Upgrade Story

**Upgrade is agentic (v1.1 priority, not v1).**

The `appysentinel-upgrade` command launches Claude with an upgrade skill that:
1. Reads the project's current state (`appysentinel.json`, installed recipes, customisations)
2. Compares against the latest template and recipe specs
3. Surfaces conflicts and proposed changes
4. Walks the developer through resolution with smart questions
5. Applies changes, updates `appysentinel.json`

This is deferred to v1.1 so that v1 can ship the install agent first. The four-tier static classification from AppyStack (`auto` / `recipe` / `never` / `owned`) is **not** adopted — it doesn't scale to the complexity AppySentinel will accumulate.

---

## 10. Terminology & Naming

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

## 11. Non-Goals

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

## 12. Open Recipe Specs (Build Order)

Recipes to write next, in priority order. Each lands as a single `.md` file in the recipe catalogue and includes: purpose, interface, dependencies, generated code shape, composition notes.

1. **`event-normaliser`** — the canonical reference for the Signal envelope + payload pattern. All other recipes reference this. Write first.
2. **`mcp-interface`** — default interface, primary consumer surface. Needed for the install agent's smoke test.
3. **`watch-directory`** — canonical input recipe. Exercises chokidar, debounce, normalisation. Most visual and easiest to stress-test.
4. **`jsonl-store`** — default storage recipe. Uses the atomic-write and serial-queue primitives from §5.
5. **`http-push`** — default outbound transport. Exercises batching, retry, backoff.

After those five, the remaining recipes can be written in any order. `llm-classifier`, `otlp-push`, and `sentinel-mesh` are explicitly lower priority (further from the 80% case).

---

## 13. Reference Implementations

Two sketches showing what common collectors look like when rebuilt on AppySentinel.

### 13.1 AngelEye-style collector (hook receiver + JSONL store + classifier)

**Recipes wired**: `hook-receiver` + `rest-interface` + `socketio-interface` + `jsonl-store` + `deterministic-classifier` + `heuristic-classifier` + `event-normaliser`.

Shape:

```typescript
// src/main.ts
import { createSentinel } from '@appydave/appysentinel';
import { hookReceiver } from './recipes/hook-receiver';
import { jsonlStore } from './recipes/jsonl-store';
import { deterministicClassifier } from './recipes/deterministic-classifier';
import { heuristicClassifier } from './recipes/heuristic-classifier';
import { mcpInterface } from './recipes/mcp-interface';
import { socketioInterface } from './recipes/socketio-interface';
import { restInterface } from './recipes/rest-interface';

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

// Interfaces
mcpInterface(sentinel, { /* resources, tools */ });
socketioInterface(sentinel, { port: 5051 });
restInterface(sentinel, { port: 5051 });

await sentinel.start();
```

What the boilerplate gives this collector for free: Signal envelope, event bus, lifecycle, atomic writes, serial queue, Pino logger, Zod config.

### 13.2 AppyRadar-style system monitor (orchestrator + snapshot + Supabase)

**Recipes wired**: `orchestrator-ssh` + `snapshot-capture` + `memory-buffer` + `supabase-push` + `mcp-interface` + `register-as-launchd`.

Shape:

```typescript
// src/main.ts
import { createSentinel } from '@appydave/appysentinel';
import { orchestratorSSH } from './recipes/orchestrator-ssh';
import { snapshotCapture } from './recipes/snapshot-capture';
import { memoryBuffer } from './recipes/memory-buffer';
import { supabasePush } from './recipes/supabase-push';
import { mcpInterface } from './recipes/mcp-interface';

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

// Local interface
mcpInterface(sentinel, { /* expose latest snapshot as a resource */ });

await sentinel.start();

// At install time, register-as-launchd wrote the plist — nothing to do here
```

What changes from the AppyRadar PoC: SSH layer, status detection, envelope, and Supabase client all come from recipes. The bespoke code is just domain config (which machines, which scripts).

---

## 14. What's Open

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
