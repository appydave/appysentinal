---
name: configure-sentinel
description: |
  Two modes for AppySentinel projects:

  CONFIGURE — Interview the developer about collectors, storage, bindings,
  transport, enrichment, and runtime; generate code for chosen recipes;
  smoke-test the result. Use on a fresh scaffold (appysentinel.json shows
  empty recipe arrays).

  REVIEW — Check existing code against AppySentinel architectural rules.
  Flags violations, confirms what is correct, suggests fixes. Use after
  generating code or before committing.

  Invoke as: /configure-sentinel        → configure mode (fresh scaffold)
             /configure-sentinel review → review mode (existing code)
---

# configure-sentinel

> **Architecture (CQRS-lite):** Access zone separates Query (`src/access/query/` — pure read
> functions returning `QueryResult<T>`) from Command (`src/access/command/` — stateless
> file-based writes to `src/state/`). Bindings (`src/access/bindings/`) are thin protocol
> adapters. CQRS applies to Access only. Collect and Deliver are separate patterns.

---

## Mode A — Configure (default)

Run when `appysentinel.json` shows empty recipe arrays or the user invokes
`/configure-sentinel` without arguments.

### Step 1 — Read project state

Before the interview, read:
- `appysentinel.json` — name, machine, current recipe selections
- `package.json` — dependency baseline
- `src/main.ts` — current wiring
- `.env.example` — current required environment variables

### Step 2 — Interview

Ask in order. Capture answers before generating anything.

#### Q1 — What does this Sentinel collect?

| Option | What it does |
|--------|-------------|
| `watch-directory` | Chokidar file watcher — detects creates/changes/deletes in a local path |
| `watch-logfile` | Tail a log file with rotation detection and line parsing |
| `poll-http` | Periodic GET against an HTTP endpoint; emits response + latency |
| `poll-command` | Run a shell command on a timer; emits stdout/stderr/exit-code |
| `orchestrator-ssh` | SSH from this machine to a fleet of remote machines. No remote agent install. Compound bash scripts per connection. Emits `machine.snapshot` (state) + `machine.offline` (event) per machine. Needs key-based auth. |
| `sql-diff-collector` | Poll a SQL/Supabase database; Tier 1 delta (watermark) + Tier 2 full-pull; PII scrub at write. |
| `hook-receiver` | HTTP webhook that accepts external push events and emits Signals |
| `subprocess-wrap` | Spawn + supervise a long-running subprocess; stream output into Signals |
| `snapshot-capture` | Combine multiple signals into a periodic structured snapshot |

#### Q2 — Is this data about what IS, or what HAPPENED?

> "Will the consumer mostly ask 'what is the current state?' or 'what events occurred over time?'"

- **Current state** → `snapshot-store` (single overwriting JSON file via `atomicWrite`)
- **Historical events** → `jsonl-store` (append-only)
- **Recent-only, ephemeral** → `memory-buffer` (in-memory ring buffer, lost on restart)
- **No local storage** → `none`

Do not default silently — ask explicitly. Wrong storage breaks downstream consumers.

#### Q3 — How will this Sentinel be read?

Choose zero or more bindings (`src/access/bindings/`). Each is a thin adapter — no logic.

| Option | What it does |
|--------|-------------|
| `mcp-binding` | MCP server (stdio). Tools call `src/access/query/` functions. Every tool response includes freshness metadata (`data_age_ms`, `stale`). Default for AI agent consumers. |
| `api-binding` | Hono HTTP API with Zod + OpenAPI. Foundation surface; reachable by any HTTP client. |
| `cli-binding` | Shell tool that queries the local Sentinel. For developer composition and on-machine loops. |
| `none-yet` | Skip for now. |

#### Q3a — Does the binding need a query layer, or is the snapshot simple enough to serve directly?

If the binding reshapes, filters, or aggregates data → wire a `src/access/query/` function.
If it returns the raw snapshot → direct read is fine.
If two bindings would duplicate the same shaping logic → extract to `src/access/query/`.

#### Q4 — Does this Sentinel need to accept commands?

Commands control the Sentinel itself — never the systems it observes. Examples: trigger
an immediate collection, pause collection, update config. Commands live in
`src/access/command/` and write to `src/state/` files. The collection loop reads
`src/state/` at the top of each tick.

Common commands: `trigger-collection`, `pause-collection`, `resume-collection`.

#### Q5 — Does data need to leave this machine?

Choose zero or more transports (most Sentinels start with none):
`http-push` / `otlp-push` / `supabase-push` / `file-relay`

#### Q6 — Does data need semantic enrichment?

Choose zero or more (most Sentinels start with none):
`deterministic-classifier` / `heuristic-classifier` / `llm-classifier`

#### Q7 — How will this Sentinel run?

- **On-demand** — invoked when needed (MCP stdio, cron, manual). No service registration.
  The code is the same; skip `scripts/install-service.sh` for now.
- **Always-on (macOS)** — `bash scripts/install-service.sh` registers as launchd.
- **Always-on (Linux)** — `bash scripts/install-service.sh` registers as systemd.

Install scripts are project-level (not recipes) — they already exist in `scripts/`.

---

### Step 3 — Confirm before generating

Summarise choices back to the developer. Get explicit confirmation before writing files.

---

### Step 4 — Generate

For each chosen recipe:

1. Create the implementation in the correct zone directory:
   - Collectors → `src/collect/<recipe-slug>.ts`
   - Commands → `src/access/command/<recipe-slug>.ts`
   - Query functions → `src/access/query/<function-name>.ts`
   - Bindings → `src/access/bindings/<binding-name>.ts`
2. Wire in `src/main.ts` before `sentinel.start()`.
3. Add required deps to `package.json`.
4. Add required env vars to `.env.example`.
5. Update `appysentinel.json` recipe arrays with canonical zone labels
   (`collect`, `access`, `command`, `deliver`, `storage`, `enrichment`, `runtime`).

**Collector pattern** — factory function, lifecycle hooks, observer-only:
```typescript
export function myCollector(sentinel: Sentinel, options: { intervalMs: number }) {
  sentinel.lifecycle.onStart(async () => { /* start timers */ });
  sentinel.lifecycle.onStop(async () => { /* clean up */ });
}
```

**Command pattern** — stateless, writes to `src/state/` via `atomicWrite`, no shared memory:
```typescript
export async function triggerCollection(stateDir: string): Promise<void> {
  await atomicWrite(join(stateDir, 'trigger.json'),
    JSON.stringify({ requestedAt: new Date().toISOString() }));
}
export function consumeTrigger(stateDir: string): { requestedAt: string } | null { ... }
```

**Query pattern** — pure function, returns `QueryResult<T>`:
```typescript
import type { QueryResult } from '@appydave/appysentinel-core';
export async function getSnapshot(dataDir: string): Promise<QueryResult<MyData>> {
  return { data, generated_at, data_age_ms, stale };
}
```

**Binding pattern** — thin adapter, delegates to query/ and command/:
```typescript
server.tool('get_snapshot', {}, async () => {
  const result = await getSnapshot(opts.dataDir);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

**MCP stdio binding — critical constraint:** MCP stdio uses stdout for its JSON-RPC
protocol. Any `console.log`, `process.stdout.write`, or logger output to stdout
**will corrupt the connection and crash it**. This is the most common MCP failure mode.

Rules for every `mcp-binding`:
1. The MCP binding must be a **standalone entry point** — do not import or start `main.ts`
2. All logging inside the MCP process must go to **stderr only**:
   ```typescript
   const logger = pino({ level: 'info' }, pino.destination(2)); // fd 2 = stderr
   ```
3. Register MCP with Claude Code pointing at the binding file directly:
   ```bash
   claude mcp add --scope user <name> -- bun /path/to/src/access/bindings/mcp.ts
   ```
   **Never** point MCP registration at `src/main.ts` — main.ts logs to stdout.
4. The MCP binding file must suppress or redirect the sentinel's Pino logger before
   connecting to the transport.

**trigger_collect for on-demand sentinels:** When the Sentinel runs only via MCP
(no persistent loop), `trigger_collect` must run the collection **synchronously** and
return when done — not write a trigger file and wait for a background loop that
doesn't exist. Wire the collector's `collect()` method directly:
```typescript
server.tool('trigger_collect', {}, async () => {
  await collector.collect();
  return { content: [{ type: 'text', text: 'Collection complete.' }] };
});
```

---

### Step 4b — Generate test stubs

For every recipe zone generated, create `src/__tests__/<recipe-slug>.test.ts`.
Do not skip this step — tests are the primary defence against the most common
AppySentinel failure modes (stateful commands, missing QueryResult fields, tool drift).

**Golden rule: test pure logic, not infrastructure.** Don't test that Supabase
returns data — test that your parser/transformer converts it correctly. No SSH,
no live DB, no real HTTP calls in unit tests. Write fixture strings or fixture
files to a temp dir instead.

**Command layer test** — catches stateful bugs and file-signal correctness:
```typescript
// src/__tests__/trigger-collection.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { triggerCollection, consumeTrigger } from '../access/command/trigger-collection.js';

describe('trigger-collection command', () => {
  it('write → consume returns data and removes file', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sentinel-test-'));
    try {
      await triggerCollection(stateDir);
      const result = await consumeTrigger(stateDir);
      expect(result).not.toBeNull();
      expect(result?.requestedAt).toBeDefined();
      expect(await consumeTrigger(stateDir)).toBeNull(); // file removed
    } finally { await rm(stateDir, { recursive: true }); }
  });

  it('consume on empty dir returns null — command is stateless', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sentinel-test-'));
    try {
      expect(await consumeTrigger(stateDir)).toBeNull();
    } finally { await rm(stateDir, { recursive: true }); }
  });
});
```

**Query layer test** — validates QueryResult<T> contract (all four fields required):
```typescript
// src/__tests__/get-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getSnapshot } from '../access/query/get-snapshot.js';

describe('getSnapshot query', () => {
  it('returns QueryResult<T> shape with all required fields', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'sentinel-test-'));
    try {
      await writeFile(join(dataDir, 'snapshot.json'), JSON.stringify({ /* fixture */ }));
      const result = await getSnapshot(dataDir);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('generated_at');
      expect(result).toHaveProperty('data_age_ms');
      expect(result).toHaveProperty('stale');
    } finally { await rm(dataDir, { recursive: true }); }
  });

  it('returns null data (not throws) when snapshot missing', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'sentinel-test-'));
    try {
      const result = await getSnapshot(dataDir);
      expect(result.data).toBeNull();
    } finally { await rm(dataDir, { recursive: true }); }
  });
});
```

**Collector logic test** — test parsers/transformers in isolation, no real infra:
```typescript
// src/__tests__/my-collector.test.ts
// Pattern: pure string/object → typed result. No network, no filesystem.
// Fixture strings should mirror real output from the source system.
import { describe, it, expect } from 'vitest';
import { parseMyData } from '../collect/my-collector.js';

describe('parseMyData', () => {
  it('parses all expected fields', () => {
    const fixture = 'field1:value1\nfield2:42';
    const result = parseMyData(fixture);
    expect(result.field1).toBe('value1');
    expect(result.field2).toBe(42);
  });

  it('returns safe defaults for missing fields', () => {
    const result = parseMyData('');
    expect(result.field2).toBe(0);
  });

  it('never throws on null/empty input', () => {
    expect(() => parseMyData('')).not.toThrow();
    expect(() => parseMyData(null as never)).not.toThrow();
  });
});
```

**MCP tool list test** — prevents tool definition drift between entry points:
```typescript
// src/__tests__/mcp-binding.test.ts
import { describe, it, expect } from 'vitest';
// Export TOOLS as a named const from bindings/mcp.ts so it can be tested here
import { TOOLS } from '../access/bindings/mcp.js';

describe('MCP binding tools', () => {
  it('exposes all expected tools', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('trigger_collect');
    expect(names).toContain('get_mirror_status');
    // Add every tool name — if a tool disappears silently, this test fails
  });
});
```

---

### Step 5 — Smoke test

```bash
bun src/main.ts   # let it run ~5 seconds, Ctrl-C
```

Verify at least one Signal appears in the log. Report success or surface diagnostics.

---

### What configure mode will NOT do

- Make architectural choices without asking.
- Touch `@appydave/appysentinel-core` primitives.
- Run `git commit`.
- Skip the confirmation step.

---

## Mode B — Review

Run when the user invokes `/configure-sentinel review` or asks to check/audit existing code.

Read every file in `src/collect/`, `src/access/`, and `src/main.ts`. Check each rule below.
Report: ✓ pass, ✗ violation (with file + line), or — not applicable.

### Rule 1 — Command layer is stateless (Critical)

Every file in `src/access/command/` must have no shared mutable state. Flag:
- Module-level `let` / `var` that are mutable
- Closure-captured mutable variables (e.g. `let running = false` inside a factory)
- Runtime object references stored in module scope (sentinel instance, collector instance)

**Correct:** command functions call `atomicWrite` to write `src/state/*.json`. No memory
shared between the command layer and the collection loop.

### Rule 2 — `src/state/` directory exists if commands exist (High)

If `src/access/command/` has any implementation files, `src/state/` must exist
(check for `.gitkeep` or any JSON file). If absent, commands have no write target.

### Rule 3 — Query functions return `QueryResult<T>` (Critical)

Every exported function in `src/access/query/` must return `Promise<QueryResult<T>>`
or `QueryResult<T>`. The returned object must include `data`, `generated_at`,
`data_age_ms`, and `stale`. Flag any raw return type.

### Rule 4 — Bindings are thin adapters (High)

Files in `src/access/bindings/` must contain only protocol setup and delegation.
Flag: data transformation, sorting, filtering, joins, file reads, or business logic
inside a binding. Move these to `src/access/query/`.

### Rule 5 — Wiring order in `main.ts` (High)

All recipe wiring must precede `await sentinel.start()`. Flag any collector, command,
or binding registered after `sentinel.start()` is called.

### Rule 6 — `appysentinel.json` uses canonical zone labels (Medium)

`recipes` block must use: `collect`, `access`, `command`, `deliver`, `storage`,
`enrichment`, `runtime`, `coordination`. Flag legacy labels: `input`, `interface`,
`transport`, `coordination` (when used as a zone, not a sub-key).

### Rule 7 — Collectors use lifecycle hooks (High)

Every collector must register setup in `sentinel.lifecycle.onStart()` and teardown
in `sentinel.lifecycle.onStop()`. Flag `setInterval`/`setTimeout` or connection
opens outside a lifecycle hook.

### Rule 8 — Observer-only invariant (Critical)

Collectors must never write to the systems they observe. Flag SQL mutations
(`INSERT`/`UPDATE`/`DELETE`) or write-verb API calls against source systems.
Writing to the local mirror/snapshot (`dataDir`, `mirrorDir`) is correct.

### Rule 9 — MCP binding does not pollute stdout (Critical)

MCP stdio uses stdout for JSON-RPC. Any stdout output from the MCP process corrupts
the protocol and crashes the connection silently. Flag:
- `console.log` anywhere in the MCP binding file or files it imports
- Pino / any logger configured without an explicit destination (defaults to stdout)
- `process.stdout.write` in any file loaded by the MCP entry point
- MCP registration pointing at `main.ts` (which logs to stdout) instead of the
  binding file directly

**Correct pattern:** logger writes to stderr (`pino.destination(2)`), MCP registration
points at `src/access/bindings/mcp.ts`, not `src/main.ts`.

**On-demand trigger_collect:** If the Sentinel has no persistent collection loop
(on-demand deployment), `trigger_collect` must call `collector.collect()` directly
and await it — not write a trigger file expecting a background loop to pick it up.
Flag any `trigger_collect` implementation that returns before collection completes.

---

### Review output format

```
/configure-sentinel review — {{PROJECT_NAME}}

Rule 1 — Command layer stateless
  ✓ src/access/command/trigger-collection.ts — atomicWrite to state/trigger.json

Rule 2 — state/ directory exists
  ✓ src/state/.gitkeep present

Rule 3 — QueryResult<T> return type
  ✓ src/access/query/get-incident.ts
  ✓ src/access/query/list-incidents.ts
  ✗ src/access/query/get-summary.ts — returns raw object, missing data_age_ms

Rule 4 — Bindings are thin adapters
  ✓ src/access/bindings/mcp.ts

Rule 5 — Wiring order in main.ts
  ✓ sentinel.start() called after all recipe wiring

Rule 6 — appysentinel.json zone labels
  ✗ appysentinel.json — uses "input" (should be "collect"), "interface" (should be "access")

Rule 7 — Collectors use lifecycle hooks
  ✓ src/collect/sql-diff-collector.ts

Rule 8 — Observer-only
  ✓ No mutations to source systems detected

Summary: 6 pass · 2 violations
Critical: Rule 3 (get-summary.ts return type)
Medium:   Rule 6 (appysentinel.json labels)
```

Offer to fix violations immediately after reporting.
