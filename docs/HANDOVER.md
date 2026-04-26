# AppySentinel — Session Handover (2026-04-26, revised)

This handover supersedes a prior version that was written before the architectural reframe of 2026-04-26 and is now stale on every priority recommendation. **Do not act on any priority list, recipe-name, or "next steps" you may have read in earlier handovers.** This document is the current truth.

---

## Read these in this order

| # | File | Why |
|---|------|-----|
| 1 | `docs/pattern-catalogue.md` | **Lead living doc.** Capability matrix and gap tracker. Read first; it drives priority. |
| 2 | `docs/appysentinel-spec.md` | Design-of-record. Updated this session — pay attention to §1 (reframe), §3 (architecture diagram), §7.0 (new — Collect/Expose/Deliver umbrellas), §7.1/§7.3/§7.4 (renames + §7.3 full reframe), §8.4, §13. |
| 3 | `packages/core/src/` | At least `signal.ts`, `bus.ts`, `create-sentinel.ts` — the API surface every pilot will use. |
| 4 | `docs/forensic-angeleye.md`, `docs/forensic-appyradar.md` | Reference app patterns — only when working a pilot. |
| 5 | `docs/design-synthesis.md` | Cross-cutting patterns + the original Q1–Q8. Read only for why-context. |

**Don't read** the prior session's recipe priority list (`event-normaliser`, `mcp-interface`, `watch-directory`, `jsonl-store`, `http-push` in that order). It uses old names and the strategy was rejected this session.

---

## Architectural state — locked this session

Decisions reached 2026-04-26. **Don't re-litigate; build with them.**

- **AppySentinel is a boilerplate for always-on local data coordinators.** Not "telemetry collector." Telemetry is one major use case alongside structured snapshots, DB mirroring, and event capture. OpenTelemetry alignment preserved at the Signal envelope.
- **Headless rule.** Sentinel has no UI. Visualisation is a separate Viewer application reached via the expose surface. The legacy AppyRadar and AngelEye repos violate this rule; pilots must enforce the split.
- **Three boundary umbrellas:** **Collect** (read from outside), **Expose** (let outside read me), **Deliver** (push to outside). Storage and enrichment are internal. Same technology can play different roles across umbrellas — role, not tech, picks the umbrella.
- **Expose follows Anthropic's API/CLI/MCP framework** (Claude.com blog 2026-04-22, *Building agents that reach production systems with MCP*). The set is `api-expose` / `cli-expose` / `mcp-expose`. The old `rest-interface` / `mcp-interface` / `socketio-interface` names are gone — Socket.io is dropped from the boilerplate (Viewer concern).
- **File-based storage is the default.** JSONL append or snapshot JSON. SQL is a non-default and must earn its place per case (fragility argument: schema migrations, multi-machine pain, debug cost).
- **Recipes own their own deps.** Core ships slim (`pino`, `ulid`, `zod` only). Transport libs (chokidar, hono, MCP SDK, etc.) are pulled in by the install agent only when a recipe is selected.
- **v1 validated by two pilots in parallel:** **AppyRadar Sentinel** + **SS Data Query Sentinel**. AngelEye is deferred as a future third pilot — note it, resist scope creep.
- **Multi-Sentinel push-to-central is unvalidated** by either pilot. AppyRadar dodges via SSH-from-one; SS is single-host. **Deferred to v2.**

---

## What's been built — still correct, do not rewrite

- 4-package Bun-workspaces monorepo: `core` / `config` / `cli` / `template`.
- 7 primitives in `packages/core/src/` (signal, bus, lifecycle, config, atomic-write, serial-queue, logger, create-sentinel).
- 27 Vitest tests passing in `core`.
- CLI scaffold pipeline works (copy + `{{PROJECT_NAME}}` / `{{MACHINE_NAME}}` substitution + `workspace:*` rewrite).
- Template smoke test: `bun src/main.ts` emits `sentinel.started`, idles until SIGINT.
- Committed as `b409f4b`, pushed to `github.com:appydave/appysentinel`.

### Spec ambiguities resolved during the build — still valid

The build agent had to make four small calls the spec didn't fully specify. They're correct; do not undo them:

1. **Workspace dep handling at scaffold time.** Template's `workspace:*` references for `@appydave/appysentinel-core` are rewritten to a published version range when the CLI copies the template out. Lives in `packages/cli/src/scaffold.ts` as a `PUBLISHED_VERSIONS` map. Manual bump required when core/config releases.
2. **Lifecycle logger injection.** `createLifecycle({ log })` accepts an optional log function so the lifecycle stays pure and only logs when wired to the Sentinel's Pino logger via `createSentinel`. Don't merge them.
3. **`emitAndWait` added** alongside the spec-mandated `emit`. Used for back-pressure (e.g. critical store flush before shutdown).
4. **`installSignalHandlers` opt-out** added as a constructor option (default `true`). Lets tests disable signal-handler installation cleanly.

---

## What is NOT next — correcting the prior handover

The prior handover listed three priorities. **All three are now wrong.**

- ❌ **Do not write 5 speculative recipe specs.** Names are stale (`mcp-interface` no longer exists), and the broader strategy of writing recipes before a pilot proves their need is exactly the speculative-spec trap this session rejected. Recipes are byproducts of pilots, not antecedents.
- ❌ **Do not flesh out `packages/template/.claude/skills/configure-sentinel/SKILL.md`** yet. The install interview is informed by which recipes exist. We don't know which recipes are real until pilots prove them.
- ❌ **Do not smoke-test via `bunx create-appysentinel my-test`.** Meaningless until real recipes exist. The right smoke test is a working pilot.

---

## What IS next — priority order

1. **Commit current state.** Spec edits (§1, §3, §7.0, §7.1, §7.3, §7.4, §8.4, §13) and the new `docs/pattern-catalogue.md` are uncommitted. Review the diff first; commit before any new work.
2. **Pilot 1 discovery: AppyRadar Sentinel.** Substantially mapped already. Bespoke prior art at `~/dev/ad/apps/appyradar/scripts/audit.ts` (728 lines, pure SSH-orchestrator, zero remote footprint). Canonical data shape at `~/dev/ad/apps/appyradar/snapshots/appyradar-latest.json` (72KB, schema v1.2). Outstanding decisions: where the AppyRadar Sentinel half lives (split-in-place vs new repo), and what the Sentinel/Viewer boundary actually looks like for this app.
3. **Pilot 2 discovery: SS Data Query Sentinel.** Path TBD inside `~/dev/clients/supportsignal/`. Discovery questions: which DB, which entities have `updated_at`, any prior sync scripts, where MCP would expose the local mirror. Worth running in a parallel discovery window rather than inline.
4. **Identify the first recipe a pilot demands.** Per the gap summary in `docs/pattern-catalogue.md`, strongest candidates are `orchestrator-ssh` (AppyRadar — already proven bespoke) and a new `sql-diff-collector` (SS — not yet in spec §7.1). Whichever pilot moves first writes its recipe spec as a *byproduct of getting the pilot working*, not in advance.
5. **Build the pilot, let AppySentinel grow in response.** Lift common patterns into the boilerplate when both pilots demand them; let app-specific stay in the app.

---

## Open architectural questions — parked, not blocked

- **Sentinel/Viewer split mechanics.** Is AppyRadar Sentinel a fork of the legacy repo, a new repo that consumes its data, or a sub-package? Decide when starting Pilot 1.
- **Recipe authoring flow.** When a pilot needs a recipe, write the markdown spec first and generate, or build bespoke and extract afterward? Probably depends on the recipe; flag at decision time.
- **Security tier model (X4–X6 in pattern catalogue).** Localhost-bind / bearer-token / Cloudflare-Access. Tailscale ACLs cover most of David's fleet for free since all 5 machines are on a tailnet. Cloudflare/Vercel local-OAuth research available on request.
- **`snapshot-store` vs `jsonl-store`.** Spec §7.2 doesn't yet name them as siblings. AppyRadar uses snapshot; SS will use JSONL. Worth promoting `snapshot-store` as a distinct recipe.
- **`sql-diff-collector` as a new recipe.** Not in spec §7.1. Sibling of `poll-http` / `poll-command`. Add when SS pilot kicks off.

---

## Deferred (v1.1+)

- Span support (`SignalKind: 'span'` slot exists; correlation/context propagation not spec'd).
- Schema versioning policy across Sentinel versions.
- Recipe composition validation at install time.
- Sentinel-mesh (cross-Sentinel discovery + active MCP-client mode `C8` from the catalogue).
- `mcp-tools` opt-in mutation recipe.
- Single-binary signing / notarisation / update mechanism.
- Meta-telemetry — a Sentinel emitting its own ops metrics.
- **Multi-Sentinel push-to-central** (`D6` from the catalogue). Wait for a real use case to force it.
- Mochaccino-as-process-documentation. Parked. David is iterating on Mochaccino separately.
- The agentic upgrade flow (`appysentinel-upgrade`).

---

## Out of scope

- Viewer applications (AppyRadar Viewer, AngelEye dashboard, etc.) — separate projects; not AppySentinel's concern.
- Mochaccino pipeline skill (different repo).
- AppyStack work — don't touch.

---

## What NOT to do

- Don't re-litigate the architectural reframe (always-on coordinator, three umbrellas, headless rule, API/CLI/MCP framework).
- Don't use the old recipe names (`mcp-interface`, `rest-interface`, `socketio-interface`) — renamed or dropped.
- Don't write recipes ahead of pilot need.
- Don't bring AngelEye into scope as a third pilot.
- Don't reach for SQL storage as a default. File-based first.
- Don't change `docs/` for design reasons during routine work. If a design change is genuinely needed, do it explicitly with rationale and update the pattern catalogue alongside.
- Don't touch `packages/core/src/` primitives without updating their tests in lockstep.

---

## Reference paths

| Path | Purpose |
|---|---|
| `docs/pattern-catalogue.md` | **Lead living doc.** Capability matrix + gap tracker. |
| `docs/appysentinel-spec.md` | Updated design-of-record. |
| `docs/design-synthesis.md` | Original cross-cutting patterns + Q1–Q8. Why-context only. |
| `docs/forensic-angeleye.md`, `docs/forensic-appyradar.md` | Reference app patterns. |
| `packages/core/src/` | Implemented primitives — `signal.ts`, `bus.ts`, `lifecycle.ts`, `config.ts`, `atomic-write.ts`, `serial-queue.ts`, `logger.ts`, `create-sentinel.ts`. |
| `packages/template/.claude/skills/configure-sentinel/SKILL.md` | Placeholder. **Do not flesh out yet.** |
| `~/dev/ad/apps/appyradar/scripts/audit.ts` | AppyRadar pilot's bespoke prior art (SSH orchestrator). |
| `~/dev/ad/apps/appyradar/snapshots/appyradar-latest.json` | AppyRadar's canonical data shape (72KB). |
| `~/dev/clients/supportsignal/` | SS Data Query Sentinel discovery target (sub-path TBD). |
| `github.com/appydave/appysentinel` | Pushed remote, `main` branch. |

---

*End of revised handover. Read `docs/pattern-catalogue.md` next, then the updated `docs/appysentinel-spec.md`.*
