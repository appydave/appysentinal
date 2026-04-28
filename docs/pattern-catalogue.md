# AppySentinel Pattern Catalogue & Capability Matrix

Living audit trail of:

1. Architectural patterns we encounter while building applications on AppySentinel
2. Which applications use which patterns
3. The gap between where AppySentinel is today and what real applications need

This is the canonical answer to: *"What have we proven works? What's only on paper? Where is AppySentinel still bespoke per-app?"*

Updated as we go. New patterns get added when we discover them; matrix cells get updated when an app is built or a recipe lands.

**Reference convention**: Code references in this document use GitHub repo paths — `github.com/appydave/<repo>/blob/main/<path>` — not absolute filesystem paths. This keeps references stable across machines and deployments. Relative paths within a single repo are acceptable.

---

## Apps tracked

| App | Role | Path | Status |
|-----|------|------|--------|
| AppyRadar (legacy) | Reference / pre-split | `~/dev/ad/apps/appyradar/` | Existing — Sentinel + Viewer conflated in one repo. `audit.ts` is the data half; `hotel-live.html` / Mochaccino panels / Baku app are the viewer half. |
| AppyRadar Sentinel | Pilot 1 (active) | `github.com/appydave/appyradar-sentinal` | Built on AppySentinel. SSH-central orchestration across 5 machines. Stress-test for C2 + I2 + E3. Graduation tracking: `docs/graduation-candidates.md` in that repo. |
| AppyRadar Viewer | Out of scope (here) | TBD — split from legacy | Separate project; consumes the Sentinel via API / MCP expose. |
| SS Data Query Sentinel | Pilot 2 (planned) | TBD under `~/dev/clients/supportsignal/` | To be built on AppySentinel. Source for stressing the SQL-diff + MCP-expose pattern. |
| AngelEye (legacy) | Reference / deferred pilot | `~/dev/ad/apps/angeleye/` | Existing — Sentinel + Viewer conflated. Future stress-test for multi-Sentinel push patterns; deferred as a third pilot for now. |

---

## Status legend

**Sentinel support:**

- ✅ **baked** — implemented in `packages/core/src/`
- 🛠️ **recipe** — recipe spec planned or written; generated per project by the install agent
- 🔮 **future** — theoretical, unvalidated, deferred to v2+
- ❓ **open** — design decision still open
- ⛔ **out of scope** — not AppySentinel's concern

**Per-app cells:**

- ✓ uses this pattern today (validated by being built)
- 🚧 planned to use
- — does not / will not use
- ? to investigate

---

## Patterns

### Foundation / lifecycle

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| F1 | Always-on loop | ✅ baked | `createSentinel()` + `Lifecycle` (start/stop/reload, SIGINT/SIGTERM/SIGHUP) |
| F2 | Headless / no UI | ✅ baked (architectural rule) | Spec §1. Visualisation is a separate Viewer app reached through the expose surface. |
| F3 | Sentinel/Viewer split | ❓ open | Architectural rule; not enforced by code. Should be guidance the install agent reinforces. |
| F4 | Signal envelope (OTel-aligned) | ✅ baked | `signal.ts` — id, ts, schema_version, source, machine, sentinel_id, kind, name, severity, attributes, payload |
| F5 | Internal pub/sub (SignalBus) | ✅ baked | `bus.ts` — emit / emitAndWait / on, isolated error handling |
| F6 | Hierarchical config + reload | ✅ baked | `config.ts` — defaults → file → env, Zod-validated, SIGHUP reload, onChange |

### Collect (zone 1 — §7.1)

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| C1 | Pulse-driven local poll | 🛠️ recipe | `poll-command`, `poll-http` |
| C2 | Pulse-driven SSH multi-host orchestration | 🛠️ recipe | `orchestrator-ssh`. PoC validated 2026-04-27 (`appyradar-sentinal-safe/`). Design decisions locked: **compound scripts** (7 SSH/machine, down from 12) over ControlMaster (revisit only if intervals drop below 5min or harness lands). Machine collection is currently sequential; `Promise.all` is the harness upgrade path. Machine config: `{ name, host }`. Signal shapes: `machine.snapshot` (state) + `machine.offline` (event). Collection intervals are a ConfigLoader concern, not hardcoded. Full spec: `appyradar-sentinal-safe/docs/orchestrator-ssh-recipe.md`. |
| C3 | Pulse-driven SQL diff (DB mirror) | 🛠️ recipe | New, needed for SS pilot. Reads remote DB by `updated_at`, writes JSONL of changed records locally. Sibling of `poll-http` / `poll-command`; not yet in spec §7.1. |
| C4 | Event-driven file watch | 🛠️ recipe | `watch-directory` (chokidar) — priority recipe per spec §12 |
| C5 | Event-driven webhook receiver | 🛠️ recipe | `hook-receiver` — AngelEye pattern |
| C6 | Event-driven log tail | 🛠️ recipe | `watch-logfile` |
| C7 | Subprocess wrap | 🛠️ recipe | `subprocess-wrap` — long-running supervised subprocess |
| C8 | Active MCP client | 🔮 future | Sentinel-as-MCP-client reading from another MCP server. The mirror of `mcp-expose`. One concrete use case: when a capability graduates from inline plugin to standalone sentinel (see Capability Graduation section), the host sentinel replaces its SSH-scraping collector with a C8 client that speaks to the graduated sentinel's expose surface. Defer until first graduation event. |
| C10 | Ingest gesture | 🛠️ recipe | A Collect sub-category for capabilities that pull from external data sources (wearables, file feeds, external services) rather than reading machine state directly. Ingest gestures graduate faster than point-metric collectors because they represent full domains (transcripts, events, files). Example: OMI wearable transcript ingestion in AppyRadar Sentinel (`github.com/appydave/appyradar-sentinal/blob/main/src/collectors/parsers.ts`). Graduation trigger: when the domain has its own enrichment pipeline or storage needs beyond what the host sentinel should own. |
| C9 | Snapshot capture | 🛠️ recipe | `snapshot-capture` — combine signals into structured snapshot. AppyRadar pattern. |

### Access (zone 2 — §7.3)

Per Anthropic's API/CLI/MCP framework. Mature Sentinels ship all three bindings. Each binding is a thin adapter that routes to `query/` or `command/` in `src/access/`.

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| A1 | API binding (HTTP) | 🛠️ recipe | `api-binding` (Hono). Foundation per Anthropic ladder. Thin adapter; routes to `query/` or `command/`. |
| A2 | CLI binding | 🛠️ recipe | `cli-binding`. Local-first developer composition (pipe to jq / grep, on-machine agent loops). Thin adapter; routes to `query/`. |
| A3 | MCP binding | 🛠️ recipe | `mcp-binding`. PoC validated 2026-04-27 (as `mcp-expose`). Design confirmed: **read-only layer over snapshot-store** — MCP server reads the snapshot file, does not touch collectors or live systems. Layering: `collector → sentinel-latest.json → MCP binding → agents`. Data-age field is first-class on every response (agents need to know how fresh data is). Tool granularity: summary tool + detail tool + domain-specific aggregated tools. One command-like tool (`trigger_collect`) is acceptable — spawns a subprocess, does not mutate machine data; observer-only invariant holds. Full spec: `appyradar-sentinal-safe/docs/mcp-surface.md`. |
| A4 | Query layer | 🛠️ recipe | `query-layer` — `src/access/query/` convention, returns `QueryResult<T>`. Pure functions over snapshot data. No transport knowledge. Called by bindings. |
| A5 | Command layer | 🛠️ recipe | `command-layer` — `src/access/command/` convention, sentinel-only writes. Config changes, triggered collections, pause/resume. Never mutates observed systems. |

### Deliver (zone 3 — §7.4)

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| D1 | HTTP push (batched, retry, backoff) | 🛠️ recipe | `http-push` |
| D2 | File-relay | 🛠️ recipe | `file-relay` — rsync / Syncthing / network mount |
| D3 | Supabase push | 🛠️ recipe | `supabase-push` |
| D4 | OTLP push | 🛠️ recipe | `otlp-push` — translate Signal → OTLP |
| D5 | Socket.io emit (deliver role) | 🛠️ recipe | Push to a remote Socket.io server. Deliver role only — Socket.io's expose role removed (Viewer concern). |
| D6 | Multi-Sentinel push-to-central | 🔮 future | "5 Sentinels each on a host pushing to a central aggregator." NOT validated by either pilot. AppyRadar dodges via SSH-from-one. Defer until a real use case demands per-host collection. |

### Internal (storage + enrichment — §7.2 / §7.5)

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| I1 | File-based store (JSONL append) | 🛠️ recipe | `jsonl-store`. Default. Append-only + index JSON. AngelEye / FliHub pattern. |
| I2 | File-based store (snapshot JSON) | 🛠️ recipe | `snapshot-store`. PoC confirmed 2026-04-27 as a distinct recipe from `jsonl-store` — different purpose (current state, not history), different read pattern (single JSON.parse, no index), different write pattern (full overwrite, not append). Convention: `snapshots/sentinel-latest.json` (always-current) + dated archive. Spec §7.2 needs updating to name this distinctly. |
| I3 | Memory ring buffer | 🛠️ recipe | `memory-buffer`. Ephemeral, configurable size. |
| I4 | SQL store | 🛠️ recipe (non-default) | `sqlite-store`. Reserved for cases that genuinely earn it. File-based is default per fragility argument (schema migrations, multi-machine pain, debug cost). |
| I5 | Atomic file write | ✅ baked | `atomic-write.ts` — temp + rename + optional fsync |
| I6 | Serial async queue | ✅ baked | `serial-queue.ts` |
| I7 | Structured logger (Pino) | ✅ baked | `logger.ts` |
| I8 | Deterministic classifier (Tier 1 enrichment) | 🛠️ recipe | AngelEye Tier 1 — rules-based |
| I9 | Heuristic classifier (Tier 2 enrichment) | 🛠️ recipe | AngelEye Tier 2 — regex / patterns |
| I10 | LLM classifier (Tier 3 enrichment) | 🛠️ recipe | AngelEye Tier 3 — semantic. Lower priority. |
| I11 | Event normaliser | 🛠️ recipe | `event-normaliser` — canonical Signal envelope + payload reference. Priority recipe per spec §12. |

### Operational (runtime — §7.6)

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| O1 | Run as launchd service | 🛠️ recipe | `register-as-launchd` (macOS) |
| O2 | Run as systemd service | 🛠️ recipe | `register-as-systemd` (Linux) |
| O3 | Run as PM2 process | 🛠️ recipe | `register-as-pm2` |
| O4 | Run in Docker container | 🛠️ recipe | `register-as-docker` |

### Cross-cutting (coordination + security — §7.7 / TBD §7.8)

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| X1 | Config-pull from central endpoint | 🛠️ recipe | `config-pull` — periodic pull, hot-reload |
| X2 | Machine-role branching | 🛠️ recipe | `machine-role` — recorder / editor / orchestrator capability switch |
| X3 | Sentinel-mesh discovery | 🔮 future | `sentinel-mesh` — Sentinels discover and read from each other |
| X4 | Security: localhost-bind only (Tier 0) | ❓ open | Default for solo machines. No auth needed. |
| X5 | Security: bearer token (Tier 1) | ❓ open | Multi-machine reach over Tailscale / LAN. Belt-and-braces with Tailscale ACLs. |
| X6 | Security: public OAuth (Tier 2) | ❓ open | Cloudflare Tunnel + Access, or Tailscale Funnel + OAuth proxy. Rare. |
| X7 | Tailscale ACLs | ⛔ out of scope | Provided by Tailscale itself; AppySentinel relies on it implicitly when host is on a tailnet. Captured for awareness only. |

---

## Capability Graduation

Architectural doctrine for how capabilities move through the AppySentinel ecosystem. Direction of travel is always forward — capabilities do not regress.

### The three-stage lifecycle

| Stage | Name | What it means | How the host sentinel talks to it |
|-------|------|---------------|----------------------------------|
| **1** | Inline collector | Capability lives inside the host sentinel as a direct SSH / file / API collector | Direct function call within `collectMachine()` or equivalent |
| **2** | Standalone sentinel | Capability has its own always-on process, its own lifecycle, and its own expose surface | Via the graduated sentinel's expose surface — MCP (C8), REST (E1), or CLI (E2), whichever the host needs |
| **3** | Recipe | Pattern proven across two or more independent pilots; extracted into AppySentinel for scaffolding | Generated into future sentinels by `configure-sentinel`; no longer a runtime relationship |

### Promotion triggers

- **Stage 1 → 2**: The capability has its own data lifecycle, its own storage needs, its own consumers beyond the host sentinel, or its own enrichment pipeline. One is enough.
- **Stage 2 → 3**: The same sentinel pattern appears in two or more independent pilots without bespoke variation. That's the signal to extract it as a recipe.

### Inter-sentinel communication (Stage 2+)

When a capability graduates to a standalone sentinel, the host sentinel speaks to it via its expose surface. The expose surface is not prescribed — it depends on what the host needs:

- **MCP** — for agent / Claude integration (pattern C8)
- **REST API** — for programmatic consumption (pattern E1)  
- **CLI** — for local scripting and composability (pattern E2)

**Key invariant**: once a capability has its own expose surface, the host sentinel never SSH-scrapes its internals. The expose surface is the contract.

### Ingest gestures and graduation pressure

Ingest gestures (C10) — capabilities that pull from external data sources rather than machine telemetry — tend to graduate faster. They represent full domains (transcripts, events, files) with their own enrichment and storage concerns. When an ingest gesture starts accumulating its own pipeline logic, that's the graduation trigger.

### Per-app graduation tracking

Each sentinel that contains inline collectors should maintain a `docs/graduation-candidates.md` tracking the current stage of each capability, what would trigger promotion, and any blockers. AppyRadar Sentinel example: `github.com/appydave/appyradar-sentinal/blob/main/docs/graduation-candidates.md`.

---

## Capability matrix

Pattern × app. `✓` = uses today; `🚧` = planned; `—` = does not / will not; `?` = to investigate.

| Pattern | AR (legacy) | AR Sentinel (pilot 1) 🟢 | SS Sentinel (pilot 2) | AngelEye (legacy) |
|---|:---:|:---:|:---:|:---:|
| **F1** Always-on loop | — (one-shot) | ✓ | 🚧 | ✓ |
| **F2** Headless / no UI | — (conflated) | ✓ | 🚧 | — (conflated) |
| **F3** Sentinel/Viewer split | — | ✓ | 🚧 | — |
| **F4** Signal envelope | — | ✓ | 🚧 | — (custom shape) |
| **F5** SignalBus | — | ✓ | 🚧 | — |
| **F6** Config + reload | — | ✓ | 🚧 | ? |
| **C2** SSH multi-host poll | ✓ | ✓ | — | — |
| **C3** SQL diff mirror | — | — | 🚧 | — |
| **C4** File watch | — | — | ? | ? |
| **C5** Webhook receiver | — | — | — | ✓ |
| **C8** Active MCP client | — | — | — | — |
| **C9** Snapshot capture | ✓ | ✓ | 🚧 | — |
| **C10** Ingest gesture | — | ✓ (OMI) | — | — |
| **A1** API binding | — | 🚧 | 🚧 | ✓ (legacy) |
| **A2** CLI binding | — | ? | ? | — |
| **A3** MCP binding | — | ✓ | 🚧 | ? |
| **D1** HTTP push | — | — | — | — |
| **D3** Supabase push | — | ? | — | — |
| **D6** Multi-Sentinel push-to-central | — | — | — | — |
| **I1** JSONL store | — | ? | 🚧 | ✓ |
| **I2** Snapshot JSON store | ✓ | ✓ | — | — |
| **I3** Memory ring buffer | — | — | — | ? |
| **I4** SQL store | — | — | ? | ? |
| **I5** Atomic write | — | ✓ | 🚧 | ✓ |
| **I8** Deterministic classifier | — | — | — | ✓ |
| **I9** Heuristic classifier | — | — | — | ✓ |
| **I11** Event normaliser | — | 🚧 | 🚧 | ? |
| **O1** launchd | — | 🚧 (next) | ? | ? |
| **X1** Config-pull | — | ? | — | — |
| **X4** Localhost-bind security | — | 🚧 | 🚧 | ? |
| **X5** Bearer-token security | — | ? | ? | — |

---

## Gap summary (where AppySentinel needs to grow)

Synthesised from pattern × app — patterns the pilots need that AppySentinel doesn't yet provide as a recipe:

1. **`orchestrator-ssh` recipe** — Design locked by PoC (2026-04-27). Compound scripts, 7 SSH/machine, signal shapes defined. Ready to formalise into AppySentinel recipe. Full spec at `appyradar-sentinal-safe/docs/orchestrator-ssh-recipe.md`.
2. **`sql-diff-collector` recipe** — SS pilot blocks on this. **New pattern not yet in spec §7.1.** Sibling of `poll-http` / `poll-command`. Needed to formalise.
3. **`snapshot-store` recipe** — PoC confirmed as distinct from `jsonl-store` (2026-04-27). Spec §7.2 needs updating. Convention: `snapshots/sentinel-latest.json`.
4. **`mcp-binding` recipe** — Pattern locked by PoC (2026-04-27). Read-only over snapshot-store. Data-age field first-class. Full spec at `appyradar-sentinal-safe/docs/mcp-surface.md`.
5. **`api-binding` recipe** — AppyRadar Sentinel needs this so the AppyRadar Viewer (Baku app, hotel-live.html, Mochaccino panels) can consume snapshots.
6. **Sentinel/Viewer split guidance (F3)** — Not a recipe but an install-agent rule. Both legacy apps violate it; both pilots must enforce it. Capture as a §1 architectural commitment + install-agent prompt.
7. **Security tier model (X4–X6)** — All three cells are 🚧 or ❓ across both pilots. Needs a spec §7.8 once we riff on it. Tailscale-default + bearer-token covers most of David's footprint.

What's deferred (no current pilot validates):

- **D6** Multi-Sentinel push-to-central — revisit when AngelEye becomes a pilot or AppyRadar genuinely needs per-host collection.
- **C8 / X3** Active MCP client / Sentinel-mesh — symmetric, no use case yet.
- **I4** SQL storage — kept available, file-based is default; SQL has to earn it case by case.

---

## Change log

| Date | Change |
|------|--------|
| 2026-04-28 | v0.2.0 vocabulary refactor: Expose → Access (zone 2). E1/E2/E3 renamed A1/A2/A3 (`api-binding`, `cli-binding`, `mcp-binding`). Added A4 query-layer, A5 command-layer. All boundary umbrella references updated to zones. |
| 2026-04-27 | Added Capability Graduation section (three-stage lifecycle, inter-sentinel communication, ingest gesture graduation pressure). Added C10 Ingest gesture pattern. Added GitHub path reference convention. Updated C8 note to reference graduation. Updated capability matrix: AR Sentinel pilot 1 promoted from 🚧 to ✓ on F1-F6, C2, C9, C10, E3, I2, I5. AppyRadar Sentinel now has real GitHub path. |
| 2026-04-27 | C2 / I2 / E3 updated with PoC-validated design decisions from `appyradar-sentinal-safe/`. Gap summary updated to reflect C2/I2/E3 now have locked designs. |
| 2026-04-26 | Initial catalogue. Seeded from spec §5–§7 + AppyRadar / AngelEye forensic notes + the Collect/Expose/Deliver reframe + the Anthropic API/CLI/MCP framing. |

---

*Append new patterns / apps / status changes above as the project evolves. Treat the gap summary as the current to-do for AppySentinel itself.*
