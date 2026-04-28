# {{PROJECT_NAME}} — Claude Instructions

This is an **AppySentinel** project. AppySentinel builds headless, always-on local
data coordinators ("Sentinels"). No UI. No dashboard. Visualisation is a separate app
that consumes this Sentinel through its Access zone surfaces.

---

## Sentinel lifecycle

| Moment | What happens | How |
|--------|-------------|-----|
| **Scaffold** | Project skeleton created | `npx create-appysentinel` — already done |
| **Build** | Recipes wired, Sentinel made useful | `claude` in this directory — you are here |
| **Graduation gate** | Snapshot is trustworthy + something depends on it | See below |
| **Deploy** | Registered as always-on service | `bash scripts/install-service.sh` on the target machine |

Build and deploy are separate. Build on your dev machine; deploy runs wherever the Sentinel lives permanently.

**Graduation gate.** Don't install the service until two conditions hold: (1) running `bun src/main.ts` and inspecting the output produces correct, stable data; (2) something is consuming the snapshot other than you inspecting it manually — an MCP binding is registered and an agent is querying it, or an HTTP client is polling. Until then, Deployed mode adds operational overhead with no benefit.

**After a code change to a deployed Sentinel**, the service must be restarted:
```bash
launchctl kickstart -k gui/$(id -u)/com.appydave.<project-name>
```

**Dev-while-deployed workflow.** When actively iterating on a deployed Sentinel, unload the service first to avoid two processes fighting over the same files and ports:
```bash
launchctl unload ~/Library/LaunchAgents/com.appydave.<project-name>.plist
bun src/main.ts          # work manually
launchctl load ~/Library/LaunchAgents/com.appydave.<project-name>.plist
```

Full lifecycle detail: `docs/appysentinel-spec.md` §9.

**Install scripts are project-level.** `scripts/install-service.sh` and `scripts/uninstall-service.sh` live in this project, not in AppySentinel core. They are intentionally project-local — the service name, plist label, and paths are specific to this Sentinel. Do not treat them as a shared recipe.

---

## How to add a capability (recipe pattern)

A recipe is a function: takes `sentinel` + options, registers hooks, subscribes to the bus, emits Signals.

```typescript
// src/recipes/my-collector.ts
import type { Sentinel } from '@appydave/appysentinel-core';

export function myCollector(sentinel: Sentinel, options: { interval: number }) {
  sentinel.lifecycle.onStart(async () => {
    // open connections, start timers
  });

  sentinel.lifecycle.onStop(async () => {
    // clean up — always implement this
  });

  // emit a signal
  sentinel.emit({ source: 'my-collector', kind: 'event', name: 'thing.happened', payload: { ... } });
}
```

Wire it in `src/main.ts` before `sentinel.start()`:

```typescript
import { myCollector } from './recipes/my-collector.js';
myCollector(sentinel, { interval: 60_000 });
await sentinel.start();
```

---

## The Signal envelope

Every record emitted by this Sentinel is a `Signal`:

```
source: string        which recipe emitted it (e.g. 'watch-directory')
kind:   log | metric | event | state | span
name:   string        semantic label (e.g. 'file.created', 'fleet.snapshot')
payload: {}           recipe-specific — define a typed interface per recipe
```

Rule: `state` kind → one overwriting snapshot (use `snapshot-store`). `event`/`log` kind → append (use `jsonl-store`).

---

## Three zones

- **Collect** — data flows IN. Recipes in `src/collect/`. File watchers, SSH polls, HTTP webhooks, DB diffs, shell commands.
- **Access** — bidirectional interface layer. `src/access/` has three sub-layers:
    - `query/`    — read logic. Pure functions over snapshots. Returns `QueryResult<T>`. No transport knowledge.
    - `command/`  — sentinel self-management. Config changes, triggered collections, pause/resume. Never mutates observed systems.
    - `bindings/` — thin protocol adapters. MCP, HTTP, CLI. Call `query/` or `command/`, translate to protocol.
  Design pattern: **CQRS-lite** — Query is the read side, Command is the write side.
  CQRS applies to Access only. Collect and Deliver are separate patterns.
- **Deliver** — data flows OUT. Recipes in `src/deliver/`. HTTP push, Supabase, OTLP, file relay.

Storage and enrichment sit between zones — they process data after collection, before access or delivery.

OpenTelemetry: we follow OTel conventions (signal kinds, attributes, timestamps). We do not depend on OTel libraries.

---

## Testing your Sentinel

**Two modes — do not confuse them:**

| Mode | Command | What it does |
|------|---------|-------------|
| **Live run** | `bun src/main.ts` | Starts the real loop. Blocks. SIGINT (Ctrl-C) to stop. Registers OS signal handlers. |
| **Tests** | `bun run test` / `bun run test:watch` | Vitest. Does NOT run the live loop. Must start and stop the sentinel within each test. |

**Rule for every test:** always pass `installSignalHandlers: false` to `createSentinel()`. Without it, the sentinel registers SIGINT/SIGTERM handlers and Vitest cannot exit cleanly.

```typescript
// src/__tests__/my-recipe.test.ts
const sentinel = createSentinel({
  name: 'test',
  machine: 'test-machine',
  installSignalHandlers: false,   // required — prevents signal handler leak in Vitest
});
await sentinel.start();
// ... test assertions ...
await sentinel.stop('manual');
```

**Watch mode while developing:** `bun run test:watch` — Vitest re-runs only tests affected by files you change. Leave it open in a terminal split while wiring recipes.

**Pre-push hook (Husky):** `.husky/pre-push` runs `bun run test && bun run typecheck` automatically before every push. Fix failures — do not bypass with `--no-verify`.

**Test one file per zone — what to test and how:**

| Zone | What to test | How |
|------|-------------|-----|
| Command | write trigger → consume returns data + removes file; consume empty dir → null | temp dir via `mkdtemp` |
| Query | every function returns `QueryResult<T>` shape (data, generated_at, data_age_ms, stale) | write fixture JSON to temp dir |
| Collector | parsers/transformers: string/object → typed result | string fixtures, no real infra |
| MCP binding | TOOLS list contains every expected tool name | import TOOLS const directly |

**Golden rule: test pure logic, not infrastructure.** Don't test that your data source returns data — test that your parser converts it correctly. No live DB, no real SSH, no real HTTP in unit tests. Fixture strings that mirror real output are enough. This is what catches the most bugs for the least effort.

**Parser test pattern** (most valuable for collectors):
```typescript
it('never throws on null/empty input', () => {
  expect(() => myParser('')).not.toThrow();
  expect(() => myParser(null as never)).not.toThrow();
});
```
Write this for every parser function. It costs one line and has caught real bugs.

---

## Hard rules

- **Observer-only by default** — read, never mutate the systems this Sentinel observes.
- **File-based storage is the default** — SQLite must earn its place (query complexity, multi-reader).
- **Recipes own their deps** — add libraries to `package.json` only when wiring a recipe that needs them.
- **`src/main.ts` is wiring only** — no business logic in main; recipes go in `src/collect/`, `src/access/`, or `src/deliver/`.
- **Run `bun src/main.ts` after every recipe addition** — smoke-test before moving on.
- **MCP stdio = stdout is reserved** — the MCP stdio protocol owns stdout entirely. Never log to stdout inside the MCP process. Use `pino.destination(2)` (stderr). Register MCP pointing at the binding file directly, never at `src/main.ts`. Any stdout output crashes the connection silently.

---

## Useful commands

```bash
bun src/main.ts                    # run in dev (Ctrl-C to stop)
bun run test                       # run tests once
bun run test:watch                 # run tests in watch mode (leave open while developing)
bun run typecheck                  # TypeScript check
bash scripts/install-service.sh   # register as always-on service (deploy time)
bash scripts/uninstall-service.sh  # remove service registration

# Register MCP binding at user scope (recommended — Sentinels are machine-resident daemons,
# not project-specific tools; user scope makes the binding available in all Claude Code sessions)
claude mcp add --scope user <name> -- bun /path/to/this/project/src/main.ts mcp
```
