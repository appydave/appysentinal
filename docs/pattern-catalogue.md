# AppySentinel Pattern Catalogue & Capability Matrix

Living audit trail of:

1. Architectural patterns we encounter while building applications on AppySentinel
2. Which applications use which patterns
3. The gap between where AppySentinel is today and what real applications need

This is the canonical answer to: *"What have we proven works? What's only on paper? Where is AppySentinel still bespoke per-app?"*

Updated as we go. New patterns get added when we discover them; matrix cells get updated when an app is built or a recipe lands.

---

## Apps tracked

| App | Role | Path | Status |
|-----|------|------|--------|
| AppyRadar (legacy) | Reference / pre-split | `~/dev/ad/apps/appyradar/` | Existing — Sentinel + Viewer conflated in one repo. `audit.ts` is the data half; `hotel-live.html` / Mochaccino panels / Baku app are the viewer half. |
| AppyRadar Sentinel | Pilot 1 (planned) | TBD — split from legacy | To be built on AppySentinel. Source for stressing the orchestrator-SSH + snapshot pattern. |
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

### Collect (boundary umbrella 1 — §7.1)

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| C1 | Pulse-driven local poll | 🛠️ recipe | `poll-command`, `poll-http` |
| C2 | Pulse-driven SSH multi-host orchestration | 🛠️ recipe | `orchestrator-ssh`. PoC validated 2026-04-27 (`appyradar-sentinal-safe/`). Design decisions locked: **compound scripts** (7 SSH/machine, down from 12) over ControlMaster (revisit only if intervals drop below 5min or harness lands). Machine collection is currently sequential; `Promise.all` is the harness upgrade path. Machine config: `{ name, host }`. Signal shapes: `machine.snapshot` (state) + `machine.offline` (event). Collection intervals are a ConfigLoader concern, not hardcoded. Full spec: `appyradar-sentinal-safe/docs/orchestrator-ssh-recipe.md`. |
| C3 | Pulse-driven SQL diff (DB mirror) | 🛠️ recipe | New, needed for SS pilot. Reads remote DB by `updated_at`, writes JSONL of changed records locally. Sibling of `poll-http` / `poll-command`; not yet in spec §7.1. |
| C4 | Event-driven file watch | 🛠️ recipe | `watch-directory` (chokidar) — priority recipe per spec §12 |
| C5 | Event-driven webhook receiver | 🛠️ recipe | `hook-receiver` — AngelEye pattern |
| C6 | Event-driven log tail | 🛠️ recipe | `watch-logfile` |
| C7 | Subprocess wrap | 🛠️ recipe | `subprocess-wrap` — long-running supervised subprocess |
| C8 | Active MCP client | 🔮 future | Sentinel-as-MCP-client reading from another MCP server. The mirror of `mcp-expose`. Door to Sentinel-to-Sentinel mesh. Defer until use case. |
| C9 | Snapshot capture | 🛠️ recipe | `snapshot-capture` — combine signals into structured snapshot. AppyRadar pattern. |

### Expose (boundary umbrella 2 — §7.3)

Per Anthropic's API/CLI/MCP framework. Mature Sentinels ship all three.

| # | Pattern | Sentinel support | Notes |
|---|---|---|---|
| E1 | API expose (HTTP) | 🛠️ recipe | `api-expose` (Hono). Foundation per Anthropic ladder. |
| E2 | CLI expose | 🛠️ recipe | `cli-expose`. Local-first developer composition (pipe to jq / grep, on-machine agent loops). |
| E3 | MCP expose | 🛠️ recipe | `mcp-expose`. PoC validated 2026-04-27. Design confirmed: **read-only layer over snapshot-store** — MCP server reads the snapshot file, does not touch collectors or live systems. Layering: `collector → sentinel-latest.json → MCP server → agents`. Data-age field is first-class on every response (agents need to know how fresh data is). Tool granularity: summary tool + detail tool + domain-specific aggregated tools (the aggregated tools are where MCP adds value over just reading raw JSON). One command-like tool (`trigger_collect`) is acceptable — spawns a subprocess, does not mutate machine data; observer-only invariant holds. Full spec: `appyradar-sentinal-safe/docs/mcp-surface.md`. |

### Deliver (boundary umbrella 3 — §7.4)

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

## Capability matrix

Pattern × app. `✓` = uses today; `🚧` = planned; `—` = does not / will not; `?` = to investigate.

| Pattern | AR (legacy) | AR Sentinel (pilot 1) | SS Sentinel (pilot 2) | AngelEye (legacy) |
|---|:---:|:---:|:---:|:---:|
| **F1** Always-on loop | — (one-shot) | 🚧 | 🚧 | ✓ |
| **F2** Headless / no UI | — (conflated) | 🚧 | 🚧 | — (conflated) |
| **F3** Sentinel/Viewer split | — | 🚧 | 🚧 | — |
| **F4** Signal envelope | — | 🚧 | 🚧 | — (custom shape) |
| **F5** SignalBus | — | 🚧 | 🚧 | — |
| **F6** Config + reload | — | 🚧 | 🚧 | ? |
| **C2** SSH multi-host poll | ✓ | 🚧 | — | — |
| **C3** SQL diff mirror | — | — | 🚧 | — |
| **C4** File watch | — | — | ? | ? |
| **C5** Webhook receiver | — | — | — | ✓ |
| **C8** Active MCP client | — | — | — | — |
| **C9** Snapshot capture | ✓ | 🚧 | 🚧 | — |
| **E1** API expose | — | 🚧 | 🚧 | ✓ (legacy) |
| **E2** CLI expose | — | ? | ? | — |
| **E3** MCP expose | — | 🚧 | 🚧 | ? |
| **D1** HTTP push | — | — | — | — |
| **D3** Supabase push | — | ? | — | — |
| **D6** Multi-Sentinel push-to-central | — | — | — | — |
| **I1** JSONL store | — | ? | 🚧 | ✓ |
| **I2** Snapshot JSON store | ✓ | 🚧 | — | — |
| **I3** Memory ring buffer | — | — | — | ? |
| **I4** SQL store | — | — | ? | ? |
| **I5** Atomic write | — | 🚧 | 🚧 | ✓ |
| **I8** Deterministic classifier | — | — | — | ✓ |
| **I9** Heuristic classifier | — | — | — | ✓ |
| **I11** Event normaliser | — | 🚧 | 🚧 | ? |
| **O1** launchd | — | 🚧 | ? | ? |
| **X1** Config-pull | — | ? | — | — |
| **X4** Localhost-bind security | — | 🚧 | 🚧 | ? |
| **X5** Bearer-token security | — | ? | ? | — |

---

## Gap summary (where AppySentinel needs to grow)

Synthesised from pattern × app — patterns the pilots need that AppySentinel doesn't yet provide as a recipe:

1. **`orchestrator-ssh` recipe** — Design locked by PoC (2026-04-27). Compound scripts, 7 SSH/machine, signal shapes defined. Ready to formalise into AppySentinel recipe. Full spec at `appyradar-sentinal-safe/docs/orchestrator-ssh-recipe.md`.
2. **`sql-diff-collector` recipe** — SS pilot blocks on this. **New pattern not yet in spec §7.1.** Sibling of `poll-http` / `poll-command`. Needed to formalise.
3. **`snapshot-store` recipe** — PoC confirmed as distinct from `jsonl-store` (2026-04-27). Spec §7.2 needs updating. Convention: `snapshots/sentinel-latest.json`.
4. **`mcp-expose` recipe** — Pattern locked by PoC (2026-04-27). Read-only over snapshot-store. Data-age field first-class. Full spec at `appyradar-sentinal-safe/docs/mcp-surface.md`.
5. **`api-expose` recipe** — AppyRadar Sentinel needs this so the AppyRadar Viewer (Baku app, hotel-live.html, Mochaccino panels) can consume snapshots.
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
| 2026-04-27 | C2 / I2 / E3 updated with PoC-validated design decisions from `appyradar-sentinal-safe/`. Gap summary updated to reflect C2/I2/E3 now have locked designs. |
| 2026-04-26 | Initial catalogue. Seeded from spec §5–§7 + AppyRadar / AngelEye forensic notes + the Collect/Expose/Deliver reframe + the Anthropic API/CLI/MCP framing. |

---

*Append new patterns / apps / status changes above as the project evolves. Treat the gap summary as the current to-do for AppySentinel itself.*
