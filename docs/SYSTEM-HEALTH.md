# System Health Report
**Generated:** 2026-04-28
**Codebase:** AppySentinel
**Stack:** Bun TypeScript monorepo (core + config + CLI + template)
**Layers reviewed:** Core Primitives (AR+BH) · Core Tests (UT) · CLI Scaffold (BH+EC) · Template (AR+CQ)

> **Note:** Layer 1 (Core Primitives) findings file was not persisted to disk by the audit agent.
> Critical and high findings from that layer are included from the agent notification summary.
> Full Layer 1 detail (17 findings) is available in the session transcript.

---

## Executive Summary

AppySentinel's runtime primitives and CLI scaffold are structurally sound — the bus, lifecycle, serial queue, and scaffold pipeline all work correctly. The critical risk is a single shared contract: **`QueryResult<T>` is not exported from the core package index, has zero test coverage, and provides no guidance in the template.** Recipe authors will silently bypass it. The second critical risk is the **template's Access sub-layer stubs are completely empty** — a developer opening these files has zero signal about what to put in them. Three additional gaps emerged from the AppyRadar pilot: the Sentinel graduation lifecycle (dev mode → deployed service) is undocumented, MCP registration defaults to the wrong scope for Sentinels, and install-service scripts are per-project with no shared recipe. Fix the two critical issues before any pilot project writes its first recipe; address the pilot-derived gaps before the second pilot launches.

---

## Critical

### QueryResult<T> is an underspecified contract (cross-layer: L1 + L2 + L4)

**Layers:** Core Primitives · Core Tests · Template
**Locations:**
- `packages/core/src/index.ts` — `./query` is not in the package exports
- `packages/core/src/query.ts` — no test file exists
- `packages/template/src/access/query/index.ts:1` — no import, no example signature

**Issue:** `QueryResult<T>` is the central contract between the query sub-layer and bindings. It is defined in `query.ts` and must be used by every query function in every scaffolded project. However: (1) it is not exported from the core package's main entry point so consumers cannot import it via `@appydave/appysentinel-core`; (2) no test file exists for `query.ts` — regressions are invisible; (3) the template's query index file contains only `// Wire query recipes here.` with no import, no example signature, and no comment pointing to the type.

**Risk:** Every recipe author writing a query function will return a raw object or `Promise<T>` instead of `QueryResult<T>`. The mistake silently compiles. By the time the pilot project's bindings try to use `data_age_ms` or `stale`, the missing fields will be discovered by runtime error — after the recipe was written and shipped.

**Fix:**
1. Add `"./query": "./dist/query.js"` to the `exports` field in `packages/core/package.json`
2. Create `packages/core/test/query.test.ts` with at least three cases: freshness calculation, `stale` derivation, and round-trip JSON serialisation
3. Add a commented example to `packages/template/src/access/query/index.ts`:
   ```ts
   // import type { QueryResult } from '@appydave/appysentinel-core/query';
   // export async function myQuery(): Promise<QueryResult<T>> { ... }
   ```

---

### Access sub-layer stubs provide zero structural guidance (L4 AR-1)

**Layer:** Template
**Locations:** `packages/template/src/access/bindings/index.ts:1`, `packages/template/src/access/query/index.ts:1`, `packages/template/src/access/command/index.ts:1`

**Issue:** Every Access sub-layer file contains only `// Wire recipes here.` None have placeholder structure, type imports, or example skeletons. A recipe author opening these files has zero signal about what shape their code should take.

**Risk:** The template's value proposition is to teach the architecture at the point of extension. Empty stubs mean CLAUDE.md is the sole teacher — and CLAUDE.md is not read during initial code exploration. Developers will write logic in the wrong layer, bypass the bindings pattern, or ignore `QueryResult<T>` entirely.

**Fix:**
- `query/index.ts`: Add a commented example import of `QueryResult<T>` and a function signature showing the return type
- `command/index.ts`: Add a comment explaining the `state/` file convention and prohibition on runtime references; add `src/state/.gitkeep`
- `bindings/index.ts`: Add a comment explaining the thin-adapter role (call query or command, translate to protocol)

---

## High

### Bus async error paths are untested (L2 UT-2, UT-3, UT-4)

**Layer:** Core Tests
**Locations:** `packages/core/test/bus.test.ts` (missing cases)

**Issue:** Three distinct error paths in the signal bus are not tested:
- **UT-2**: A handler that returns a rejected Promise in `emit()` (fire-and-forget). The bus catches this via `.catch` at line 73 — the catch branch is never exercised.
- **UT-3**: An async rejection inside `emitAndWait` calls `onError` and continues to the next handler. Only the happy path is tested.
- **UT-4**: When `createSignalBus()` is called with no `onError` option, the default `console.error` fallback installs. No test exercises this path.

**Risk:** Any change to bus error routing (a common target for "tidy this up" refactors) will not be caught before publication. The `emitAndWait` contract ("error is routed, not propagated; subsequent handlers still run") is the contract pilot recipes will depend on.

**Fix:** Add three test cases to `bus.test.ts` covering each path. For UT-4, spy on `console.error` in the test.

---

### Bus and lifecycle idempotency guards are untested (L2 UT-5, UT-6, UT-7, UT-8, UT-9)

**Layer:** Core Tests
**Locations:** `packages/core/test/bus.test.ts`, `packages/core/test/lifecycle.test.ts` (missing cases)

**Issue:** Five guard paths with non-trivial implementations are not tested:
- **UT-5**: Idempotent unsubscribe — `off()` called twice. The `active` flag at bus.ts:93-98 is never double-triggered.
- **UT-6**: Concurrent `stop()` — the `stopPromise` dedup guard at lifecycle.ts:124-125 is never hit.
- **UT-7**: `start()` idempotency while `starting` or `running` (lifecycle.ts:101) — guard could be deleted silently.
- **UT-8**: `stop()` from `idle` state (never started) — short-circuit at lifecycle.ts:123 untested.
- **UT-9**: Stop hook throw on the first-reversed hook — throwing hook is always placed in the middle in existing tests, never as the last registered (first to run in reverse).

**Risk:** Any one of these guards being accidentally removed would silently break real-world usage (concurrent callers, accidental double-registration, reload sequences).

**Fix:** Add one test per guard. For UT-6, call `stop()` twice without awaiting; use `Promise.all`.

---

### SIGHUP accumulation on reload (L1 BH-1)

**Layer:** Core Primitives
**Location:** `packages/core/src/` (signal handler registration)

**Issue:** On each `sentinel.reload()` call, POSIX signal handlers (`SIGHUP`, `SIGTERM`, `SIGINT`) are re-registered without first removing the previous handlers. After N reloads there are N+1 listeners. Node/Bun emits `MaxListenersExceededWarning` after 10 and will eventually call all handlers on shutdown, firing lifecycle hooks multiple times.

**Risk:** A sentinel that reloads on config change (a core use case) will accumulate handlers until Bun starts emitting warnings, and on graceful shutdown may trigger stop hooks multiple times — including `fsync` writes, service deregistration, or external notifications.

**Fix:** Store handler references and call `process.removeListener()` before re-registering on each reload.

---

### `drain()` race in SerialQueue (L1 BH-2)

**Layer:** Core Primitives
**Location:** `packages/core/src/serial-queue.ts`

**Issue:** `drain()` resolves when `pendingCount` reaches 0. If a task is enqueued between the moment `pendingCount` drops to 0 and the moment the `drain()` promise observer fires, `drain()` resolves prematurely — the queue is not actually empty.

**Risk:** Any code that calls `drain()` before shutdown (e.g., flush all pending writes before stopping) may stop before all tasks complete. Silent data loss path in crash recovery flows.

**Fix:** Resolve `drain()` only after the queue is empty and no task is currently running, using a microtask fence or a condition variable pattern.

---

### No cleanup path when scaffold fails mid-operation (L3 EC-1, EC-2)

**Layer:** CLI Scaffold
**Locations:** `packages/cli/src/scaffold.ts:61-84` (EC-1), `packages/cli/src/scaffold.ts:177` (EC-2)

**Issue:** Two failure points leave a partial project that blocks a re-run:
- **EC-1**: If `copyTemplate()` throws mid-walk (disk full, permission denied), `targetDir` exists with a partial copy. `runScaffold()` has no cleanup handler.
- **EC-2**: If both `bun install` and the `npm install` fallback fail, the directory exists with all template files applied but no `node_modules`. A second run fails with "not empty".

**Risk:** Any CI environment, low-disk machine, or permission issue leaves the developer with a broken project AND a blocked retry path. The user must manually remove the directory — with no printed instruction to do so.

**Fix:** Wrap the scaffold pipeline in a try/catch that removes `targetDir` on failure and prints a "Cleaned up — safe to retry" message.

---

### Template `main.ts` does not wire zone files (L4 AR-4)

**Layer:** Template
**Location:** `packages/template/src/main.ts` (full file)

**Issue:** The architectural expectation is that `main.ts` is the wiring surface. Zone directories exist but `main.ts` imports nothing from them and has no comment showing where zone wiring slots relative to `sentinel.start()`. A recipe author must add the import by hand with no anchor in the file.

**Risk:** The correct ordering (register recipes → `sentinel.start()`) is documented in CLAUDE.md but not illustrated at the point of use. Developers will place recipes after `start()` and see non-deterministic ordering as the file grows.

**Fix:** Add commented-out import blocks and `// Register collect recipes below`, `// Register access bindings below`, `// Register deliver recipes below` markers placed before `sentinel.start()`.

---

### Command layer stub has no `state/` guidance (L4 AR-3)

**Layer:** Template
**Location:** `packages/template/src/access/command/index.ts:1`

**Issue:** The architectural rule is explicit: command functions write effects through `state/` files, never through shared memory or runtime references. The empty stub communicates none of this. There is no `state/` directory in the template either.

**Risk:** Recipe authors will hold references to the sentinel runtime or shared objects — the singleton anti-pattern explicitly refactored out in the AppyRadar pilot.

**Fix:** Add a comment explaining the convention; add `src/state/.gitkeep` to the template.

---

### Zone index files carry no JSDoc (L4 CQ-1)

**Layer:** Template
**Locations:** All five zone/sub-layer index files — bindings, command, query, collect, deliver

**Issue:** All five files have a single comment `// Wire [zone] recipes here.` No JSDoc, no note on whether functions should be exported or called in-place, no pointer to CLAUDE.md.

**Risk:** Logic ends up in the wrong zone. Bindings grow business logic instead of staying as thin adapters. This is the most common misuse pattern.

**Fix:** A brief block comment per file (3-5 lines) is sufficient: what belongs here, what does not, one pointer to CLAUDE.md.

---

### Smoke test does not exercise the signal bus (L4 CQ-2)

**Layer:** Template
**Location:** `packages/template/src/__tests__/sentinel.test.ts`

**Issue:** The test confirms `start()` / `stop()` state transitions but does not test `sentinel.emit()` or `sentinel.on()`. Every recipe will call these first.

**Risk:** A recipe author who breaks the bus (throwing in a subscriber, emitting malformed input) gets no feedback from the smoke test. The "does this still work after I wired my recipe?" baseline is incomplete.

**Fix:** Add one test case: emit a signal, assert the subscriber receives it.

---

### ~~Sentinel graduation lifecycle is undocumented~~ ✓ Fixed (pilot-derived)

**Layer:** Spec / Template
**Location:** `docs/appysentinel-spec.md`, `packages/template/CLAUDE.md`

**Issue:** The current spec defines three lifecycle moments (Scaffold / Build / Deploy) and the CLAUDE.md mentions them correctly. However the gap between Build and Deploy — the *iteration loop* — is completely undocumented. Discovered during AppyRadar Sentinel pilot when `install-service.sh` was run against an actively changing project.

The pattern that emerged from practice:

- **Development mode** — run manually (`bun src/main.ts`), observe output, kill with Ctrl-C. Use while wiring recipes, changing parsers, iterating on collectors.
- **Graduated / deployed** — install as a launchd/systemd service. Use when the Sentinel is stable enough to run unattended. Code changes require a service restart (`launchctl kickstart -k gui/$(id -u)/com.<name>`).
- **The graduation signal** — the snapshot is trustworthy and you're consuming it (via MCP, HTTP, or another app) rather than inspecting it directly.
- **Iteration workflow during active development on a deployed Sentinel** — `launchctl unload`, work manually, `launchctl load` when done.

**Risk:** Without this documented, developers either never install the service (losing the always-on benefit) or install it too early and fight the restart discipline. Every pilot project will rediscover this pattern independently.

**Fix:** Add a §"Sentinel Lifecycle" section to `docs/appysentinel-spec.md` alongside the existing three moments. Summarise in `packages/template/CLAUDE.md` under "Build" with the graduation signal and the restart command.

---

## Medium

### Injected escape hatches not tested (L2 UT-12, UT-13)

**Layer:** Core Tests — `packages/core/test/create-sentinel.test.ts`

**Issue:** `createSentinel()` accepts optional pre-built `bus`, `lifecycle`, `logger`. No test verifies that injected instances are wired rather than silently replaced. `sentinel.reload()` delegation to lifecycle is also untested end-to-end.

**Fix:** Add tests with `vi.fn()` spy mocks for each injected instance.

---

### `signal` test gaps — ULID format and conditional fields (L2 UT-10, UT-11)

**Layer:** Core Tests — `packages/core/test/signal.test.ts`

**Issue:**
- **UT-11**: Generated `id` is only checked for non-empty length, not valid ULID format (26-char Crockford base32). A swap to UUID would pass the current test.
- **UT-10**: `severity` and `attributes` are tested when absent but not when present.

**Fix:** Assert `s.id` matches `/^[0-9A-HJKMNP-TV-Z]{26}$/i`. Add a `mintSignal` call with both fields and assert they appear.

---

### `atomic-write` option paths untested (L2 UT-14, UT-15, UT-16)

**Layer:** Core Tests — `packages/core/test/atomic-write.test.ts`

**Issue:** Three option paths in `atomic-write.ts` are never exercised: binary `Uint8Array` content (line 55-57 branch), `fsync: true` (line 58), and `mode` file permission option. The `fsync` path is the primary crash-safety guarantee of the primitive.

**Fix:** One test per path. For `mode`, assert `fs.stat().mode` matches the expected value on Linux CI.

---

### `serial-queue` live size counter not tested (L2 UT-17)

**Layer:** Core Tests — `packages/core/test/serial-queue.test.ts`

**Issue:** `size` is only checked after drain (0 at rest). No test verifies it increments on enqueue and decrements on complete — confirming it reflects in-flight work.

**Fix:** Enqueue a pausing task, assert `size === 1`, let it complete, assert `size === 0`.

---

### `handoff.ts` is compiled but never called (L3 BH-1)

**Layer:** CLI Scaffold — `packages/cli/src/index.ts`, `packages/cli/src/handoff.ts`

**Issue:** `handoff.ts` exports `runHandoff()` and `buildPrompt()` with full implementation. `index.ts` never imports or calls either. The CLAUDE.md statement "if `claude` is not on PATH, exits non-zero" is false for the published CLI.

**Fix:** Either wire up `runHandoff()` or delete `handoff.ts` and remove it from the compile target.

---

### `targetDir` computed twice — one is thrown away (L3 BH-2)

**Layer:** CLI Scaffold — `packages/cli/src/index.ts:21`, `packages/cli/src/prompts.ts:49`

**Issue:** `prompts.ts` computes `targetDir` and returns it in `ScaffoldAnswers`. `index.ts` discards that value and recomputes using `resolve()`. The two expressions differ in normalisation. `answers.targetDir` is never read.

**Fix:** Remove `targetDir` from `ScaffoldAnswers` (it's unused) or have `index.ts` use `answers.targetDir` directly after normalising it once.

---

### Silent `npm install` fallback swallows real failures (L3 BH-3)

**Layer:** CLI Scaffold — `packages/cli/src/scaffold.ts:121-128`

**Issue:** `bunInstall()` catches all errors and falls back to `npm install`. A `bun install` failure due to network error or peer conflict silently triggers `npm install`, which also fails — producing a confusing second error with no explanation of why bun was skipped.

**Fix:** Check for `ENOENT` (binary not found) specifically; re-throw other errors.

---

### Recipe registry uses legacy zone labels (L4 AR-5)

**Layer:** Template — `packages/template/appysentinel.json:14-20`

**Issue:** The `recipes` block uses keys `input`, `interface`, `transport` — informal aliases or old names superseded by `collect`, `access`, `deliver`. If the `configure-sentinel` agent reads this file to place recipes, it will work from stale labels.

**Fix:** Update keys to `collect`, `access`, `deliver` (with `access` optionally split into `access.query`, `access.command`, `access.bindings`).

---

### `sentinel.emit()` called at top-level after `start()` (L4 AR-6)

**Layer:** Template — `packages/template/src/main.ts:33-40`

**Issue:** The startup signal is emitted at top-level async scope immediately after `await sentinel.start()`. This teaches recipe authors that top-level emission is normal. Top-level emission also fires before any recipe `onStart` hooks registered later in `main.ts`.

**Fix:** Move the startup signal into an `onStart` hook, or add a comment explaining why top-level placement is intentional.

---

### `globals: true` in vitest config contradicts explicit imports in test (L4 CQ-3)

**Layer:** Template — `packages/template/vitest.config.ts:5`

**Issue:** `globals: true` injects `describe`/`it`/`expect` as globals, but `sentinel.test.ts` uses explicit imports. Mixed signals to recipe authors about which style is expected.

**Fix:** Remove `globals: true` (or set `false`) and standardise on explicit imports — the community convention for Vitest.

---

### `dev` script undocumented in CLAUDE.md (L4 CQ-4)

**Layer:** Template — `packages/template/package.json:7`

**Issue:** `package.json` has `"dev": "bun --watch src/main.ts"` but CLAUDE.md documents `bun src/main.ts` as the live-run command. If `dev` is the intended iteration command, it should be documented; otherwise, remove it.

**Fix:** Either document `bun run dev` in CLAUDE.md and the README, or remove the `dev` script.

---

### `scaffoldVersion` hardcoded to `"0.1.0"` (L4 CQ-5)

**Layer:** Template — `packages/template/appysentinel.json:5`

**Issue:** The CLI replaces `{{PROJECT_NAME}}` but not the scaffold version. Every scaffolded project fingerprints itself as `"0.1.0"` regardless of the CLI version actually used.

**Fix:** Add a `{{SCAFFOLD_VERSION}}` placeholder replaced by the CLI's own version at scaffold time, or remove the field.

---

### `runScaffold` accepts unsanitised `projectName` (L3 EC-7)

**Layer:** CLI Scaffold — `packages/cli/src/scaffold.ts:86-119`

**Issue:** The interactive path enforces `^[a-z0-9][a-z0-9-_]*$/i`. `runScaffold()` itself performs no validation. Path traversal sequences like `../evil` would point `targetDir` outside the intended parent.

**Fix:** Add a shared validator called in both `prompts.ts` and `runScaffold()`.

---

### TOCTOU race in empty-directory check (L3 EC-3)

**Layer:** CLI Scaffold — `packages/cli/src/scaffold.ts:163-172`

**Issue:** Between `existsSync(targetDir)` and `mkdirSync()`, another process could create the directory. `mkdirSync({ recursive: true })` succeeds silently even if the directory was just created with files in it.

**Risk:** Low on single-user machines. Real on CI or shared build agents.

**Fix:** Use `mkdirSync` with `{ recursive: true }` then immediately check if the directory is empty — treat non-empty as a hard error.

---

### Files over 1 MB silently skip placeholder substitution (L3 EC-4)

**Layer:** CLI Scaffold — `packages/cli/src/scaffold.ts:96`

**Issue:** `replacePlaceholders()` skips files over 1 MB with no log warning. If a template file grows past 1 MB and contains `workspace:*` or `{{PROJECT_NAME}}`, those placeholders survive into the scaffolded project.

**Fix:** Log a warning when skipping a file due to size, so the failure mode is visible.

---

### `LOG_LEVEL` env var fallback not tested (L2 UT-18)

**Layer:** Core Tests — `packages/core/test/logger.test.ts`

**Issue:** `logger.ts` line 34 reads `process.env['LOG_LEVEL']` when `options.level` is not provided. This path is never exercised in tests.

**Fix:** One test: set `process.env.LOG_LEVEL = 'warn'`, call `createLogger({})`, assert level is `'warn'`. Restore in `afterEach`.

---

### ~~MCP registration defaults to `--scope project` — wrong for Sentinels~~ ✓ Fixed (pilot-derived)

**Layer:** Spec / Template / CLI
**Location:** `docs/appysentinel-spec.md` §12 (MCP binding), `packages/template/CLAUDE.md`

**Issue:** When `claude mcp add name -- ...` is run without a scope flag, Claude Code registers the MCP server at **project scope** — tools are only available when Claude Code is opened in that project folder. For Sentinels, this is almost always the wrong default. Sentinels are machine-resident daemons; their MCP tools (fleet query, command triggers) are useful in *any* Claude Code session, not just the project folder they happen to live in.

The correct scope for a deployed Sentinel MCP binding is `--scope user` (`claude mcp add --scope user name -- ...`), which makes tools available in all sessions on that machine.

**Risk:** The AppySentinel spec and template currently document MCP registration without mentioning scope at all. Every developer who follows the scaffold will end up with project-scoped tools and wonder why fleet commands aren't available in their other projects.

**Fix:** Update spec §12 and template CLAUDE.md to recommend `--scope user` for Sentinel MCP bindings, with a note explaining why (Sentinels are user-scoped daemons, not project-scoped tools). Add a note in the graduation lifecycle section.

---

### ~~`install-service` pattern is not a shared recipe in core~~ ✓ Documented as intentional (pilot-derived)

**Layer:** Template / Core
**Location:** `packages/template/scripts/install-service.sh`, `packages/core/`

**Issue:** The launchd/systemd service installation scripts (`install-service.sh`, `launchd.plist`, `systemd.service`) exist in the template and are shipped to every scaffolded project. However, the AppySentinel core has no recipes directory — these are project-level scripts, not a reusable recipe. Any improvement to the install pattern (e.g., better error handling, cross-platform detection, MCP re-registration on reinstall) must be made in each project individually.

**Risk:** As more Sentinels are created, the install scripts will diverge. Improvements to the AppyRadar Sentinel's scripts won't propagate to the SS Data Query Sentinel, etc.

**Fix (decision required):** Either (a) accept that install scripts are project-level and document this explicitly in the template CLAUDE.md, or (b) promote the install pattern to a proper recipe in `packages/core/` so the scaffold always ships the latest version. Option (b) is a minor version bump and requires adding a `recipes/` directory convention to core — worth planning before the second pilot.

---

## Low / Observations

- **BH-4 (CLI)**: `buildPrompt()` references `.claude/skills/configure-sentinel/SKILL.md` which the template does not ship. If absent, Layer 2 Claude agent has no grounding document.
- **BH-5 (CLI)**: `PUBLISHED_VERSIONS` map in `scaffold.ts` is a two-step indirection from `generated-versions.ts`. Adding a third package requires updating both files.
- **BH-6 (CLI)**: Project name validator uses `i` flag — allows uppercase npm package names. Remove the `i` flag.
- **BH-7 (CLI)**: `git -c commit.gpgsign=false` silently suppresses GPG signing for the initial scaffold commit, not documented to the user.
- **BH-8 (CLI)**: Dead setup line in `scaffold.test.ts:92-93` — creates a file that plays no role in the assertion.
- **EC-5 (CLI)**: `targetDir` in `prompts.ts` uses hardcoded `/` separator — broken on Windows paths even though the `engines` field doesn't restrict the platform.
- **EC-6 (CLI)**: `runHandoff()` returns `{ status: 'launched' }` even when `claude` exits non-zero. Non-zero exit is silently swallowed.
- **EC-8 (CLI)**: `generate-versions.ts` uses a hardcoded relative path `join(here, '../../..')` — fails silently when run outside the expected monorepo layout.
- **CQ-6 (Template)**: `.env.example` line 13 contains `{{PROJECT_NAME}}` inside a comment — correct after scaffold but looks like an unreplaced token in the raw template.

---

## Praise

### CLAUDE.md and service scripts are model-quality (L4 CQ-7)

**Location:** `packages/template/CLAUDE.md`, `packages/template/scripts/install-service.sh`

The template CLAUDE.md does everything right: separates the three lifecycle moments (Scaffold / Build / Deploy), provides a correct recipe pattern with lifecycle hooks, documents `installSignalHandlers: false` with an explicit code example, distinguishes live-run from test, and accurately describes all three zones with their sub-layers. The install/uninstall scripts are robust (`set -euo pipefail`, cross-platform, clear output). These files set the right expectations immediately when a developer opens the project in Claude Code. The quality here should be the model for all template files.

---

## Clean — No Issues

No entire layers came back clean. All layers had actionable findings.

---

## Review Coverage

| Layer | Dimensions | Findings | Critical | High | Medium | Low | Praise |
|-------|-----------|---------|---------|------|--------|-----|--------|
| L1 Core Primitives | AR + BH | ~17 (partial) | 1 | 2+ | ? | ? | — |
| L2 Core Tests | UT | 18 | 1 | 8 | 8 | 1 | — |
| L3 CLI Scaffold | BH + EC | 16 | 0 | 2 | 8 | 6 | — |
| L4 Template | AR + CQ | 13 | 1 | 5 | 5 | 1 | 1 |
| Pilot (AppyRadar) | AR (spec) | 3 | 0 | 1 | 2 | 0 | — |
| **Total** | | **~67** | **3** | **18+** | **23+** | **8+** | **1** |

> L1 findings file was not persisted. Counts marked `+` are minimums; see session transcript for full L1 detail.
> Pilot findings derive from AppyRadar Sentinel development (MCP scope, graduation lifecycle, install-service recipe gap).
