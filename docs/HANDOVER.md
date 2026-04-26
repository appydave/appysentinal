# AppySentinel — Session Handover (2026-04-26)

This document is for a Claude Code session opened in this repo (`appysentinal/`). The previous session built the design package and the Option B monorepo scaffold. This handover transfers context.

---

## Current state — at a glance

- **Design**: complete. All Q1–Q8 design decisions resolved. Spec written.
- **Code**: walking-skeleton scaffold built. 4-package Bun monorepo. 7 primitives implemented. 27 Vitest tests passing. Committed as `b409f4b` and pushed to `github.com:appydave/appysentinel`.
- **What's next**: write the `configure-sentinel` interview script, then the 5 priority recipe specs.

---

## Read these first (in this order)

| # | File | Why |
|---|------|-----|
| 1 | `docs/appysentinel-spec.md` | THE buildable spec. Q1–Q8 decisions, stack, baked-in plumbing, Signal envelope, recipe catalogue, install model. ~600 lines. Read in full. |
| 2 | `DEVELOPMENT.md` | Monorepo developer guide. How to run, test, iterate. |
| 3 | `packages/core/src/` | Read at least `signal.ts`, `bus.ts`, `create-sentinel.ts` to internalise the primitives the recipes will use. |
| 4 | `docs/design-synthesis.md` | Cross-cutting patterns + the 8 design questions and how they were answered. Read only if you need *why* context. |
| 5 | `docs/forensic-angeleye.md` and `docs/forensic-appyradar.md` | Reference apps. Read only if you need pattern detail when writing recipes. |

**Don't bother reading**: `docs/forensic-flihub.md` (out of scope as a use case), `docs/forensic-storyline.md` (confirms what AppySentinel is *not*), `docs/mochaccino-*` (unrelated tangent — handed off to a different repo).

---

## What's been built

### Repo layout

```
appysentinal/
├── docs/                          # Design package — see "Read first" above
├── packages/
│   ├── core/                      # @appydave/appysentinel-core — the runtime library
│   ├── config/                    # @appydave/appysentinel-config — shared lint/ts/prettier/vitest
│   ├── cli/                       # create-appysentinel — Layer-1 static scaffold
│   └── template/                  # Minimal walking-skeleton scaffold the CLI copies
├── DEVELOPMENT.md
├── package.json                   # Bun workspaces root
└── tsconfig.json
```

### Primitives implemented (`packages/core/src/`)

All seven from spec §5 are in place with tests:

- `signal.ts` — `Signal<P>`, `SignalKind`, `SignalPayload`, `mintSignal()`
- `bus.ts` — `createSignalBus()` with `emit`, `emitAndWait`, `on`/unsubscribe, isolated error handling
- `lifecycle.ts` — SIGINT/SIGTERM/SIGHUP handlers, reverse-order stop hooks, idempotent stop
- `config.ts` — defaults → file → env layering, Zod-validated, reload + onChange
- `atomic-write.ts` — temp+rename with optional fsync
- `serial-queue.ts` — promise-chain serial queue, errors don't poison
- `logger.ts` — Pino factory with bindings + optional pretty mode
- `create-sentinel.ts` — wires it all together, returns `{ start, stop, reload, emit, on, bus, lifecycle, logger }`

### Verification

- `bun run typecheck` — green across all 4 packages
- `bun run test` — 27/27 in core, others stubbed
- `bun run build` — core + cli compile cleanly
- Template `bun src/main.ts` smoke test — emits `sentinel.started` Signal, idles until SIGINT
- Scaffold pipeline (copy + `{{PROJECT_NAME}}`/`{{MACHINE_NAME}}` substitution + `workspace:*` rewrite) validated via `/tmp` clone

---

## Spec ambiguities resolved during build (do NOT re-litigate)

The build agent had to make four small calls the spec didn't fully specify. Document these so the next session doesn't undo them:

1. **Workspace dep handling at scaffold time** — template's `workspace:*` references for `@appydave/appysentinel-core` are rewritten to a published version range (e.g. `^0.1.0`) when the CLI copies the template out. Lives in `packages/cli/src/scaffold.ts` as a `PUBLISHED_VERSIONS` map. Manual bump required when core/config releases.
2. **Lifecycle logger injection** — `createLifecycle({ log })` accepts an optional log function so the lifecycle stays pure and only logs when wired to the Sentinel's Pino logger via `createSentinel`. Clean separation; don't merge them.
3. **`emitAndWait` added** — alongside spec-mandated `emit(): void`. Used for back-pressure cases (e.g. critical store flush before shutdown). Doesn't change the documented contract.
4. **`installSignalHandlers` opt-out** — added as a constructor option (default `true`) so tests can disable signal-handler installation cleanly. Invisible to spec users.

---

## Pending immediate work (priority order)

### 1. Flesh out `configure-sentinel` SKILL.md
Currently a placeholder at `packages/template/.claude/skills/configure-sentinel/SKILL.md`. This is the **Layer-2 install interview** — what runs when `create-appysentinel` finishes the static scaffold and auto-launches `claude -p`. It should walk the user through:
- Interface choice (suggested default: MCP) → applies the chosen interface recipe
- Input collectors (which to wire from §7.1)
- Storage (§7.2) — default `jsonl-store`
- Transport (§7.4) — may be "none" for local-only
- Runtime (§7.6) — may be "none" for dev-only
- Smoke-test: run once, emit one signal, confirm green

### 2. Write the 5 priority recipe specs (markdown, NOT code)

Per spec §12, in this order. Each lands as a single markdown file in `packages/template/.claude/skills/recipe/references/<recipe-name>.md` (or wherever the recipe skill ends up — confirm location during work).

Each recipe spec must include: purpose, interface contract, dependencies, generated code shape (illustrative TypeScript, not a copy-paste template), composition notes.

1. **`event-normaliser`** — canonical reference for the Signal envelope + payload pattern. All other recipes reference this. Write first.
2. **`mcp-interface`** — default interface, primary consumer surface. Needed for the install agent's smoke test.
3. **`watch-directory`** — canonical input recipe. Exercises chokidar, debounce, normalisation. Most visual and easiest to stress-test.
4. **`jsonl-store`** — default storage recipe. Uses the atomic-write and serial-queue primitives.
5. **`http-push`** — default outbound transport. Exercises batching, retry, backoff.

### 3. Walking skeleton end-to-end
After (1) and (2), prove the install pipeline works: run `bunx create-appysentinel my-test`, complete the interview, confirm a Signal flows through `watch-directory` → bus → `jsonl-store` → `http-push` (mock target).

---

## Deferred items (open, not next-up)

From spec §14, parked for v1.1+:

- Span support (`SignalKind: 'span'`) — type slot exists; correlation/context propagation not spec'd
- Schema versioning policy across Sentinel versions
- Recipe composition validation at install time
- Sentinel-mesh protocol (cross-Sentinel discovery)
- `mcp-tools` opt-in mutation recipe (waives observer-only)
- Single-binary distribution: signing, notarisation, update mechanism
- Meta-telemetry — how a Sentinel emits its own operational metrics

The agentic upgrade flow (`appysentinel-upgrade`) is also v1.1, not v1.

---

## What NOT to do

- **Do not re-run** any forensic research. The four forensic reports are authoritative.
- **Do not re-decide** Q1–Q8. They're locked. If something forces a revision, document it explicitly as a *change* with rationale, don't quietly rewrite.
- **Do not change** the docs in `docs/` for design reasons. They're the audit trail. Add new docs (e.g. `RECIPE-AUTHORING.md`) for new content.
- **Do not implement recipes as code templates**. Recipes are markdown capability specs. The install agent generates per-project code from the spec + project context. This is the AppyStack March-2026 lesson, baked in.
- **Do not touch** `packages/core/src/` primitives without updating their tests in lockstep.
- **Do not work on AppyStack**. AppyStack-related questions raised in the previous session were tangents. AppySentinel only.

---

## Out of scope (handed off elsewhere)

- **Mochaccino pipeline skill** — handed off to `appydave-plugins/docs/x-men.md`. A new quartet of skills (`mochaccino`, `mocha`, `peter`, `shelly`) was created in another window during the previous session — that work is no longer relevant here.
- **AppyStack install B** — speculative, never authorised, not in flight. If you're asked about it, the answer is "not this session."

---

## Reference paths (live)

| Path | Purpose |
|---|---|
| `docs/appysentinel-spec.md` | The buildable spec (~600 lines, 14 sections) |
| `docs/design-synthesis.md` | Cross-cutting patterns + 8 design questions |
| `docs/architecture-brief.md` | Original concept brief |
| `docs/forensic-angeleye.md` | Strongest reference app (observer-only) |
| `docs/forensic-appyradar.md` | Strongest reference app (orchestrator-style — though that pattern was relocated to dashboards) |
| `packages/core/src/` | The 7 primitives, implemented |
| `packages/template/` | What the CLI copies on scaffold |
| `DEVELOPMENT.md` | Monorepo dev guide |
| `github.com/appydave/appysentinal` | Pushed remote, `main` branch |

---

*End of handover. Read `docs/appysentinel-spec.md` next.*
