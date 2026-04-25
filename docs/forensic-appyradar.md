# Forensic Analysis: AppyRadar

**Date**: 2026-04-25  
**Status**: MVP / Proof-of-Concept  
**Scope**: Collector architecture and patterns relevant to AppySentinel boilerplate

---

## 1. What Does AppyRadar Actually Do?

AppyRadar eliminates "token-burning" questions by continuously collecting telemetry from a Tailscale fleet (5 machines) and surfacing it in a unified way — without asking Claude.

**Real-world use**:
- "Is FliHub running?" (answer from port listening check, not token burn)
- "Which repos are dirty?" (answer from git scan, not token burn)  
- "How full is the M4 disk?" (answer from df, not token burn)

It conflates two separate concerns:
1. **Collector agent** — TypeScript script that SSHes into machines and gathers telemetry
2. **Dashboard** — Web UI (planned, not yet built) that visualizes the collector's output

### Two Products (Not One App)

| Component | Status | Purpose |
|-----------|--------|---------|
| **AppyRadar Collector** (`scripts/audit.ts`) | ✅ PoC-ready | SSHes into all Tailscale machines, collects structured telemetry, outputs JSON snapshots |
| **AppyRadar Dashboard** (Baku web app) | 🔧 Planned | React 18 + Supabase frontend — not yet scaffolded |

---

## 2. Where Is the Collector Code?

The collector is intentionally simple — it's a single orchestrator script that contains all the SSH collectors inline.

```
/Users/davidcruwys/dev/ad/apps/appyradar/
├── scripts/
│   ├── audit.ts                      ← Main collector (661 lines)
│   └── disk-usage/
│       ├── index.ts                  ← Disk-specific collector CLI
│       ├── collector.ts              ← SSH orchestration
│       ├── bash-scripts.ts           ← Bash template functions
│       ├── parser.ts                 ← Output parsing
│       ├── schema.ts                 ← TypeScript types
│       ├── reconcile.ts              ← df vs du reconciliation
│       └── __tests__/                ← Unit tests
├── snapshots/
│   ├── appyradar-latest.json         ← Most recent audit (stable path)
│   ├── appyradar-YYYY-MM-DD.json     ← Dated archives
│   ├── disk-usage-latest.json
│   └── disk-usage-YYYY-MM-DD.json
└── docs/
    ├── collector.md
    ├── architecture.md
    ├── machines.md
    ├── panels.md
    └── overview.md
```

### Core Collector Functions in `audit.ts`

| Function | Purpose | Pattern |
|----------|---------|---------|
| `sshStatus(host)` | Probe connectivity (ok / auth_failure / unreachable) | Status detection with error categorization |
| `ssh(host, cmd)` | Run single command remotely | Simple pass-through |
| `sshScript(host, script)` | Run bash via stdin | **Core pattern** — no installation required |
| `collectIdentity()` | hostname, OS, arch, uptime, user, load | Parse key-value output from bash |
| `collectSystem()` | RAM, CPU cores | Parse system metrics |
| `collectDisk()` | All volumes, used/free/%, alert levels | Parse df output, compute alert thresholds |
| `collectTools()` | Installed versions (ruby, node, bun, python3, git, ansible, etc.) | Version detection via `--version` |
| `collectApps()` | Two-pass: path existence + port listening check | Cross-ref with `~/.config/appydave/apps.json` |
| `collectGitRepos()` | All repos in ~/dev/ad, ~/dev/clients, ~/dev/kgems | Parse git status/log output, compute dirty/unpushed |
| `collectRelay()` | Relay folders, file counts, Syncthing status | Parse ls + pgrep output |
| `collectOMI()` | File counts (total/enriched/pending), monthly breakdown | Parse ls + grep output, extract frontmatter |
| `collectSkills()` | Global skills, plugins, commands | ls ~/.claude/* |
| `collectBrains()` | Per-brain: status, activity level, stale detection (>60 days) | Parse INDEX.md frontmatter via awk |
| `collectAnsible()` | Playbook/role/inventory listing | find + xargs |
| `collectAngelEye()` | Session counts, active status, session types | Python3 script embedded in bash |

### Disk Usage Collector (v3 — Adaptive Recursion)

**Separate tool**: `scripts/disk-usage/index.ts` — independent from main audit, focuses on **where disk space is consumed**.

- **Algorithm**: Threshold-based adaptive recursion (drills into directories >N GB, stops at small ones)
- **Output**: Tree structure with cleanup candidates ranked by size
- **Key design**: `-x` flag on `du` prevents macOS firmlink loops (non-negotiable)
- **Status**: Includes Docker awareness, APFS snapshot detection, df vs du reconciliation

---

## 3. Runtime Model

### Manual PoC (Current)

```bash
# Full audit (slow — includes git scan ~5 min)
bun run scripts/audit.ts

# Fast mode (skip git — ~30 sec)
bun run scripts/audit.ts --skip-git

# Specific machines only
bun run scripts/audit.ts --machines=macbook-pro,mac-mini-m4

# Disk usage specific
bun run scripts/disk-usage/index.ts --machines=mac-mini-m4 --min-size=5g
```

### Intended Production Model (Not Yet Implemented)

1. **Daemon/scheduled job** on primary machine (macbook-pro)
   - launchd job (daily run) OR
   - appydave-tools `radar` command OR
   - Standalone binary (Go)
2. **Orchestrator pattern**: Any machine on Tailscale network can run it
3. **Supabase push** (not yet wired): POST telemetry to cloud DB
4. **No pre-installation**: SSH via stdin requires nothing on remote machines

### Machine Reachability

- **8-second SSH ConnectTimeout**: Tuned for normal Tailscale latency
- **Three states**: `online`, `offline`, `auth_failure` (distinguished, not lumped)
- **Graceful degradation**: Offline machines marked `{ status: "offline" }` with no other fields

---

## 4. Configuration Model

### Orchestrator Config (Hard-Coded)

Machine list in `audit.ts` (lines 26-32):
```typescript
const MACHINES = [
  { name: 'macbook-pro', host: 'macbook-pro' },
  { name: 'mac-mini-m4', host: 'mac-mini-m4' },
  { name: 'mac-mini-m2', host: 'mac-mini-m2' },
  { name: 'jan',         host: 'jans-mac-mini' },
  { name: 'mary',        host: 'marys-mac-mini' },
]

// Source of truth: Tailscale admin panel + ~/dev/ad/agent-os/ansible/inventory/host_vars/
```

**Limitation**: Hostnames are hard-coded. Can be overridden via env vars:
```bash
JAN_HOST=jans-new-hostname bun run scripts/audit.ts
```

### App Registry (External)

**Path**: `~/.config/appydave/apps.json` (on orchestrator machine only)

**Format**:
```json
{
  "apps": {
    "flihub": {
      "display": "FliHub",
      "path": "~/dev/ad/apps/flihub",
      "ports": { "client": null, "server": 5101 },
      "group": "flivideo",
      "tier": 1,
      "status": "active",
      "notes": ""
    }
    // ... 12 more apps
  }
}
```

**13 registered apps**: FliHub, FliDeck, Storyline, FliGen, DeckHand, ThumbRack, AngelEye, AWB v2, Digital Stage Summit, SupportSignal, VOZ, Signal Studio, Kiros

**Important constraint**: Registry is loaded **once on the orchestrator**, then those app definitions are checked on **all remote machines**. If orchestrator's `apps.json` is stale, all machine app data will be wrong — even if remotes are up to date.

### Git Search Paths (Hard-Coded)

```typescript
const GIT_SEARCH_PATHS = ['~/dev/ad', '~/dev/clients', '~/dev/kgems']
const MAX_REPOS = 100
```

---

## 5. Data Sources

What is AppyRadar collecting, from where, at what cadence?

### System Health Layer (Primary)

| Category | Source | Command(s) | Cadence |
|----------|--------|-----------|---------|
| **Identity** | macOS system | `hostname`, `sw_vers`, `uname`, `uptime`, `whoami` | On-demand |
| **System** | macOS system | `top -l1`, `sysctl -n hw.ncpu`, `sysctl -n hw.memsize` | On-demand |
| **Disk** | df (filesystem ground truth) | `df -Pkl` | On-demand |
| **Tools** | PATH + version output | `command -v X` + `X --version` for: ruby, node, bun, python3, ansible, git, brew, claude, tmux, docker, rbenv, ollama, tailscale | On-demand |
| **Apps** | Local files + ports | `lsof -iTCP -sTCP:LISTEN` (cross-ref against apps.json) | On-demand |
| **Git repos** | Git CLI | `find` (up to 100 repos) + `git status` + `git log` per repo | On-demand (slow!) |
| **Relay** | Filesystem + process | `ls` + `pgrep syncthing` | On-demand |
| **OMI** | Filesystem + grep | `ls ~/dev/raw-intake/omi` + `grep -rl "routing:"` | On-demand |
| **Skills** | Filesystem | `ls ~/.claude/skills/`, `.claude/plugins/`, `.claude/commands/` | On-demand |
| **Brains** | INDEX.md frontmatter | `find` + `awk` to extract frontmatter fields (status, activity_level, last_major_update, file_count) | On-demand |
| **Ansible** | Filesystem | `find` playbooks, roles, inventory hosts | On-demand |
| **AngelEye** | registry.json + Python script | `cat ~/.claude/angeleye/registry.json` + Python3 to parse sessions + port 5051 check | On-demand |

### Content Layer (Planned, Not Yet)

- **FliHub API** — Project list, relay sync state, activity log (currently 50-event in-memory ring buffer)
- **YouTube Data API** — Upload cadence (3 channels)
- **Skool API** — Community metrics
- **OMI webhook** — Native webhook on OMI device (2-4hrs to configure per CONTEXT.md)

### AI/Dev Activity Layer (Planned)

- **AngelEye hook listener** — Currently conflated with visual app; needs architectural split
- Needs to publish Claude Code sessions, tool use, skill invocations as telemetry

### Cadence

**Current**: Manual on-demand  
**Planned**: Daily via launchd or CLI command  
**Real-time**: None — PoC is periodic snapshots only

---

## 6. Storage — How Is Collected Data Stored Locally?

### Current (PoC)

**Format**: JSON snapshots, versioned by date

**Paths**:
```
snapshots/appyradar-latest.json      ← Always points to most recent
snapshots/appyradar-YYYY-MM-DD.json  ← Dated archive (one per day)
snapshots/disk-usage-latest.json
snapshots/disk-usage-YYYY-MM-DD.json
```

**Schema version**: `1.2` (audit), `3.0` (disk-usage)

**Size**: ~100-200 KB per snapshot (3 machines' data)

**Structure** (audit):
```json
{
  "schema_version": "1.2",
  "generated_at": "ISO 8601",
  "summary": {
    "total_machines": 5,
    "online": 3,
    "offline": 2,
    "offline_machines": ["jan", "mary"],
    "apps_registered": 13
  },
  "machines": [
    {
      "machine": "mac-mini-m4",
      "host": "mac-mini-m4",
      "status": "online",
      "checked_at": "ISO 8601",
      "identity": { ... },
      "system": { ... },
      "memory": { ... },
      "disk": [ ... ],
      "tools": { ... },
      "app_status": [ ... ],
      "relay": { ... },
      "omi": { ... },
      "skills": { ... },
      "brains": { ... },
      "ansible": { ... },
      "angeleye": { ... },
      "git_repos": [ ... ]
    }
  ]
}
```

### Planned (Cloud)

**Supabase table** (not yet provisioned):
```sql
create table telemetry (
  id            uuid primary key,
  source        text,           -- "collector", "angeleye", "omi-webhook", etc.
  machine       text,
  user_id       text,
  collected_at  timestamptz,
  type          text,           -- "snapshot", "event", "alert"
  payload       jsonb,          -- flexible structure per source
  schema_version text
);
create index on telemetry (machine, source, collected_at desc);
```

**Push model**: Collector POSTs to Supabase `/rest/v1/telemetry` (no custom API layer)  
**Query model**: Dashboard GETs via PostgREST queries  
**Real-time**: Supabase Realtime subscriptions for live updates

---

## 7. Transport / Push — How Does Data Leave the Machine?

### Current (PoC)

**Output**: Local JSON files only  
**No push**: Collectors run manually, output to `snapshots/`, that's it

### Planned (Intended Architecture)

**Transport**: HTTP POST to Supabase

**Envelope** (unified across all publishers):
```json
{
  "schema_version": "1.1",
  "source": "collector",          // or "angeleye", "omi-webhook", etc.
  "machine": "mac-mini-m4",
  "user": "davidcruwys",
  "collected_at": "2026-04-07T13:00:00Z",
  "type": "snapshot",             // or "event", "alert"
  "payload": { /* flexible */ }
}
```

**Not yet implemented in code**: The POST logic to Supabase is described in docs but not wired in `audit.ts`

### Multi-Publisher Architecture

AppyRadar is designed to accept data from multiple sources:
1. **Collector agent** — System health snapshots
2. **AngelEye** — AI/dev activity events (needs architectural split)
3. **OMI webhook** — Content intake events (needs native webhook config)
4. **FliHub API** — Project/activity events (API exists but not yet integrated)
5. **Future publishers** — Can write to same telemetry table

---

## 8. Interface (In/Out) — APIs, MCPs, IPC

### Output Interfaces

**For dashboard consumers**:
- **REST API** (planned): PostgREST auto-generated from Supabase schema
- **Realtime** (planned): WebSocket subscriptions via Supabase Realtime
- **JSON files** (current): Snapshots at `snapshots/appyradar-latest.json`

**For Claude skills** (planned):
- Read from Supabase directly OR
- Read from local snapshots if no cloud access

### Input Interfaces

**None yet** — the system is read-only observation. Planned "control actions" (start app, push repo, trigger enrichment) are explicitly de-prioritized.

### No MCP/IPC Currently

The collector is a batch script, not a daemon. No MCP server, no socket listener, no local IPC.

**Future consideration**: Could expose an MCP interface on the orchestrator for:
- Query latest snapshots without re-running
- Trigger ad-hoc collection
- Stream real-time events from Supabase

---

## 9. Multi-Machine Pattern — Coordination & Alignment

### Fleet Inventory (5 Machines)

| Machine | Role | Location | Status (2026-04-07) |
|---------|------|----------|-------------------|
| macbook-pro (M4 Pro, 24GB) | Field machine, Ansible control node, edit/planning | Thailand | Online, 71% disk |
| mac-mini-m4 (M4, 24GB) | Primary dev + streaming machine | Thailand | Online, **95% disk (CRITICAL)** |
| mac-mini-m2 (M2, 32GB) | Bot/automation node | Thailand | Online, 47% disk |
| jans-mac-mini (M2) | Remote agent node | Philippines | Offline (Tailscale not auto-start) |
| marys-mac-mini (M2) | Remote agent node | Philippines | Offline (Tailscale not auto-start) |

### Detected Alignment Gaps

| Gap | Machines | Action |
|-----|----------|--------|
| **Brains out of sync** | MBP: 63, M4: 66, M2: 60 | Need cross-machine sync investigation |
| **OMI not on M2** | M2 has no OMI archive | Decision: should M2 have OMI? |
| **Relay not on M2** | M2 has no relay folders | Decision: does M2 need relay? |
| **Ansible not on M2** | M2 missing checkout | Clone if M2 is to be managed |
| **Tailscale not auto-starting** | Jan + Mary machines | Needs Ansible launchd config |
| **M4 disk critical** | 406GB / 460GB (95%) | Immediate cleanup needed |
| **Git state mostly stale** | M4 + M2: 54 dirty repos each | Most are 1+ year old; noise not signal |

### Coordination Model

**Collector to Supabase**:
1. Orchestrator (any machine) collects from all others
2. All machines push their snapshots to Supabase independently (not yet implemented)
3. Dashboard reads all machines' latest snapshots in one query

**No peer-to-peer coordination**: Machines don't talk to each other about state. Coordination happens via the cloud database.

**Offline handling**: Machines that are unreachable are marked `{ status: "offline" }` and don't block the run.

---

## 10. Pain Points — What Was Hand-Rolled, What Should Be Boilerplate?

### Clear Candidates for Boilerplate

| Pattern | Why It Works | Cost of Hand-Rolling | Recommendation |
|---------|-------------|----------------------|-----------------|
| **SSH via stdin, no installation** | Single orchestrator, auditable collectors, no remote agent maintenance | High — error-prone bash piping, SSH opts tuning | **→ Core boilerplate** — provides "remote execution without installation" |
| **Status detection (ok / auth_failure / unreachable)** | Distinguishes "host down" from "key not installed" — saves debugging time | Medium — requires careful stderr parsing | **→ Reusable module** — include in SSH layer |
| **Key-value parser from bash output** | Simple, works across all collectors, no escaping issues | Low — trivial but repeated | **→ Shared utility** |
| **Threshold-based adaptive recursion** (disk usage) | Drills intelligently into large dirs, stops early at small ones — both efficient and insightful | Very high — requires careful algorithm design | **→ Reusable module or recipe** — disk scanning is a common need |
| **APFS snapshot + firmlink detection** (disk) | macOS-specific; detects hidden disk inflation — essential for accurate usage reports | Very high — non-obvious macOS gotchas | **→ Recipe or docs** — macOS-specific, not universal |
| **Unified telemetry envelope** | Single `{ source, machine, collected_at, type, payload }` lets diverse publishers feed one table | Medium — requires design discipline, not code | **→ Boilerplate in docs** — enforced by schema validation |
| **Two-pass app status check** (paths then ports) | Distinguishes "installed but not running" from "not installed" — valuable for dashboards | Low — straightforward logic | **→ Reusable function** |
| **Stale brain detection** (>60 days) | Identifies knowledge gaps — generalizes to any "lastModified" field | Very low | **→ Shared utility** |
| **Graceful degradation** on offline machines | System doesn't fail if some machines are down — resilience pattern | Medium — requires explicit handling | **→ Boilerplate** — part of core collector design |

### Hand-Rolled / Bespoke

| Pattern | Why It's Bespoke | Should It Generalize? |
|---------|-----------------|----------------------|
| **apps.json cross-reference** | AppyDave-specific app registry format + ports | **No** — other ecosystems will have different app metadata; recipe instead |
| **Git repo scanning** (~/dev/ad, ~/dev/clients, ~/dev/kgems) | Specific to David's monorepo layout | **No** — search paths are per-organization; recipe or config |
| **Relay folder structure** (david-jan, flihub-appydave) | Specific to David's Syncthing setup | **No** — relay is optional; recipe |
| **OMI intake enrichment tracking** | Specific to David's OMI pipeline | **No** — OMI is unique; could be a recipe |
| **Brains INDEX.md frontmatter parsing** | Specific to David's brain format | **No** — frontmatter parsing is reusable but fields are custom |
| **AngelEye session aggregation** | AngelEye-specific data structure | **No** — other organizations will have different hook sources |
| **Baku web app stack** | Okay as a recommendation but not mandated | **Recipe** — other orgs might use Vue, Svelte, etc. |

### Lessons Learned (from CONTEXT.md)

1. **AppyRadar is infrastructure, not the product** — the collector is just one publisher. Future publishers (AngelEye, OMI, FliHub) follow the same envelope contract. The boilerplate should make adding new publishers easy.

2. **Snapshot JSON is a design asset** — the real field names and edge cases (offline machines, 95% disks, brain count divergence) are visible in `appyradar-snapshot-2026-04-07.json`. Design the boilerplate to make consuming snapshot data trivial.

3. **Panel = publishing contract, not UI widget** — each panel needs:
   - A publisher writing to the telemetry table
   - A dashboard component reading from it
   - Missing publisher = no panel, regardless of UI design

4. **Offline machines are first-class** — graceful degradation is essential; don't hide machines with missing data.

5. **Git scan is the bottleneck** — 100 repos × 4 git commands via SSH takes minutes. Future: batch script or webhook.

6. **Supabase not yet provisioned** — architecture is designed but not implemented. Boilerplate should provide a reference implementation for POST + query patterns.

7. **Jan/Mary offline in practice** — Tailscale not set to auto-start on remote machines. System handles this gracefully, but it's a real operational concern.

8. **Brain/OMI/Relay divergence is invisible without cross-machine comparison** — the boilerplate should encourage panels that show machine-to-machine deltas, not just per-machine data.

---

## 11. Tech Stack

### Collector (scripts/audit.ts + disk-usage/)

| Layer | Technology |
|-------|-----------|
| **Language** | TypeScript (strict mode) |
| **Runtime** | Bun (`bun run scripts/audit.ts`) |
| **Remote execution** | SSH (`bash -s` via stdin) — no agent installation |
| **Network** | Tailscale MagicDNS (bare hostnames, no `.local`) |
| **Output** | JSON files (snapshots/) |
| **Build** | No build step — direct TS execution via Bun |
| **Testing** | Bun test framework (unit tests in `__tests__/`) |

### Dashboard (Not Yet Built)

| Layer | Technology |
|-------|-----------|
| **Framework** | React 18 (not React 19 — Baku-specific pin) |
| **Language** | TypeScript (strict mode) |
| **Build** | Vite |
| **Runtime** | Bun |
| **Styling** | Tailwind CSS |
| **Components** | shadcn/ui |
| **Charts** | Recharts |
| **Forms** | react-hook-form + zod |
| **Data fetching** | TanStack React Query |
| **Backend** | Supabase (DB, auth, realtime) |
| **Deployment** | Baku platform (claude.ai/claude-ship) |

### CLI / Execution

```bash
# Run collector
bun run scripts/audit.ts

# Run disk usage
bun run scripts/disk-usage/index.ts

# No npm install, no build step — Bun handles everything
```

### Dependencies (Minimal)

Collector has **zero external dependencies** — only Node.js stdlib:
- `child_process` (execSync)
- `fs` (readFileSync, writeFileSync, mkdirSync)
- `path` (join)

This is intentional: keep the collector small and portable.

---

## 12. Tests & Deployment

### Testing (Collector)

**Disk usage collector has unit tests**:
```
scripts/disk-usage/__tests__/
├── parser.test.ts          ← du/df parsing
├── collector.test.ts       ← SSH orchestration
├── bash-scripts.test.ts    ← Bash template generation
└── reconcile.test.ts       ← df vs du reconciliation
```

**Main audit collector**: No tests yet (PoC status)

**Run tests**:
```bash
bun test scripts/disk-usage/__tests__/*.test.ts
```

### Deployment (Current PoC)

**Manual execution** — developer runs `bun run scripts/audit.ts` on demand

**Output locations**:
- `snapshots/appyradar-latest.json` — stable path, clobbered on each run
- `snapshots/appyradar-YYYY-MM-DD.json` — dated archive

**Dashboards and tools** read from `appyradar-latest.json` directly (git-ignored or committed? Not clear in repo structure)

### Deployment (Intended)

**Option A**: launchd job on macbook-pro (primary machine)
```
~/Library/LaunchAgents/com.appydave.appyradar.plist
└── runs `bun run scripts/audit.ts` daily or on-demand
```

**Option B**: appydave-tools Ruby gem extension
```bash
radar --machines=... --skip-git  # new CLI command
```

**Option C**: Standalone binary (Go)
```bash
appyradar-collect --config ./machines.json
```

**Cloud sync** (planned): POST snapshots to Supabase via HTTPS (API key-based auth)

---

## 13. Comparison to AppySentinel Architecture Brief

### Where AppyRadar Aligns with AppySentinel

| Concept | AppySentinel Brief | AppyRadar Implementation |
|---------|-------------------|--------------------------|
| **Sentinel** = local agent collecting telemetry | ✅ Aligns | `scripts/audit.ts` is a collector/sentinel |
| **MCP interface** for querying data | 🔧 Planned in AppySentinel | Not yet in AppyRadar (PoC) |
| **Local-first design** | ✅ Aligns | Works offline; no cloud dependency for collection |
| **Push to central system** | ✅ Aligns | POST to Supabase (planned, not implemented) |
| **Pull config from central** | 🔧 Planned | Hard-coded machine list in AppyRadar; could be dynamic |
| **Telemetry data shapes** (logs, metrics, events, state snapshots) | ✅ Aligns | AppyRadar uses "snapshots" (state); doesn't emit logs/metrics/events (yet) |
| **OTEL-inspired envelope** | ✅ Partially | AppyRadar has unified envelope but simpler than OTEL |
| **Multi-sentinel coordination** | 🔧 Planned | AppyRadar collects from multiple machines; coordination via cloud DB |

### Key Differences

| Aspect | AppySentinel Brief | AppyRadar PoC |
|--------|-------------------|--------------|
| **Configuration** | Pulled from central system | Hard-coded in orchestrator script |
| **MCP interface** | Required for local agents | Not yet implemented |
| **Data model** | OTEL-inspired (logs, metrics, events, spans) | Single "snapshot" type; custom payload |
| **Deployment** | Daemon on each machine | Single orchestrator runs periodically |
| **Real-time** | Supports (OTEL push) | Batch/periodic only |

---

## 14. Recommendations: Patterns Worth Promoting to Boilerplate

### Tier 1: Core Boilerplate Patterns (High Reuse, Universal)

1. **SSH Orchestration Layer**
   - `sshStatus()` — connectivity detection with error categorization
   - `sshScript()` — execute bash via stdin without remote installation
   - Consistent SSH options tuning (ConnectTimeout=8s, BatchMode, StrictHostKeyChecking)
   - **Why**: Every collector will need to reach remote machines. This eliminates per-project SSH setup.
   - **Where**: `lib/ssh-orchestrator.ts` (reusable module)

2. **Status Detection & Graceful Degradation**
   - Three-state machine: `online`, `offline`, `auth_failure`
   - Explicitly handle unreachable machines without crashing the run
   - **Why**: Essential for multi-machine reliability. Prevents "one broken machine breaks everything" failures.
   - **Where**: `lib/machine-status.ts`

3. **Unified Telemetry Envelope**
   - `{ schema_version, source, machine, user, collected_at, type, payload }`
   - Type system for all telemetry records
   - **Why**: Multiple publishers (collector, hooks, webhooks) need to write compatible data. Enforce this at the type level.
   - **Where**: `lib/telemetry-schema.ts` (TypeScript interfaces)

4. **Supabase Integration Module**
   - Authenticated POST to telemetry table
   - Query helpers (latest snapshot per machine, filtered by date range, etc.)
   - **Why**: All sentinels will push to cloud. Provide SDK-like helpers.
   - **Where**: `lib/supabase-client.ts`

5. **File Output Versioning**
   - Write both `appyradar-YYYY-MM-DD.json` (dated) and `appyradar-latest.json` (stable path)
   - **Why**: Snapshots are valuable design assets. Keep them. Stable path lets tools read latest without scripting.
   - **Where**: `lib/snapshot-writer.ts`

### Tier 2: Reusable Modules (Medium Reuse, With Configuration)

6. **Adaptive Disk Recursion Algorithm**
   - Threshold-based drilling into directories (not fixed-depth)
   - Cleanup candidate ranking
   - **Why**: Disk scanning is common. The adaptive algorithm is elegant and efficient.
   - **Where**: `lib/disk-scanner.ts` (with macOS-specific quirks documented)
   - **Note**: Provide as recipe + reference implementation, not mandatory

7. **Bash Script Template System**
   - Keep bash scripts as named TypeScript functions (not inline)
   - Makes them testable and inspectable
   - **Why**: Transparency + auditability. Easy to understand what's being run remotely.
   - **Where**: `lib/bash-templates.ts` (pattern + examples)

8. **Data Parsing Utilities**
   - Key-value parser from bash output
   - Unit tests for bash output parsing
   - **Why**: Reduces parsing bugs; promotes consistency.
   - **Where**: `lib/parsers.ts`

9. **Cross-Machine Comparison Helpers**
   - Detect alignment gaps (e.g., "3 different brain counts across fleet")
   - Diff state between machines
   - **Why**: AppyRadar revealed that per-machine data hides cross-machine problems.
   - **Where**: `lib/fleet-analysis.ts` (recipe)

### Tier 3: Recipes (Organization-Specific, Can Be Copied & Modified)

10. **App Registry Pattern**
    - Load app definitions from JSON, cross-reference against ports
    - Distinguish "installed but not running" from "not installed"
    - **Where**: `recipes/app-status-collector.ts`
    - **Note**: apps.json schema is AppyDave-specific; provide as example only

11. **Git Repo Scanner**
    - Find repos recursively, extract branch/dirty/unpushed/last-commit
    - Configure search paths per environment
    - **Where**: `recipes/git-scanner.ts`
    - **Note**: Very slow via SSH; include `--skip-git` flag pattern in boilerplate CLI args

12. **Knowledge Base Staleness Detection**
    - Parse INDEX.md frontmatter (status, activity_level, last_major_update)
    - Flag stale items (>60 days)
    - **Where**: `recipes/brain-health-scanner.ts` or `recipes/knowledge-base-scanner.ts`
    - **Note**: Field names are custom per org; provide as example/template

13. **Tailscale Fleet Inventory**
    - Machine list with IP addresses, locations, roles
    - Source of truth mapping (e.g., Ansible inventory)
    - **Where**: `recipes/machines-config.ts` (example + docs)

14. **Baku Dashboard Scaffold**
    - React 18 + shadcn/ui + Recharts + Supabase integration
    - Pre-built "fleet grid" panel (machine cards with disk alerts)
    - **Where**: Not in boilerplate; but provide as reference scaffold (`examples/dashboard-baku/`)

---

## 15. Patterns That Should NOT Generalize

- **AppyDave-specific app metadata** (apps.json schema, port assignments, group/tier taxonomy)
- **David's monorepo structure** (~/dev/ad, ~/dev/clients, ~/dev/kgems search paths)
- **Relay folder names** (david-jan, flihub-appydave, app, paperclip)
- **OMI enrichment tracking** (specific to David's content pipeline)
- **AngelEye hook registry format** (will differ per organization)
- **Baku as the only UI framework** (recommend, not mandate)

These should be provided as **recipes** (copy-and-modify examples) rather than boilerplate (enforce on all projects).

---

## 16. Final Assessment: Fit for AppySentinel Boilerplate

### What AppyRadar Gets Right (Patterns to Adopt)

1. ✅ **SSH orchestration without remote installation** — core pattern, universally applicable
2. ✅ **Status detection with error categorization** — prevents "one machine breaks everything"
3. ✅ **Unified envelope contract** — lets multiple publishers feed one system
4. ✅ **Graceful offline handling** — first-class, not error case
5. ✅ **Snapshot + latest stable path** — design asset preservation
6. ✅ **Threshold-based adaptive recursion** — efficient and insightful (disk-specific)
7. ✅ **Bash templates as TypeScript functions** — auditability + testability
8. ✅ **Type-safe data parsing** — avoids bugs

### What AppyRadar Needs (Before It Can Be Production Boilerplate)

1. 🔧 **Supabase push wired** — POST logic needs to be implemented in audit.ts
2. 🔧 **MCP interface** — local clients need to query sentinel without re-running collection
3. 🔧 **Configuration externaliza­tion** — machine list and search paths should be in config files, not hard-coded
4. 🔧 **Daemon/scheduled execution** — not just manual `bun run`
5. 🔧 **Real-time event streaming** — not just periodic snapshots (OMI webhook, AngelEye hooks)
6. 🔧 **Multi-sentinel coordination** — how sentinels on different machines talk to each other

### Recommended Next Steps for AppySentinel Boilerplate

**Phase 1** (Foundation — extract from AppyRadar):
- Extract SSH orchestration layer → `lib/ssh-orchestrator.ts`
- Generalize status detection → `lib/machine-status.ts`
- Define unified envelope → `lib/telemetry-schema.ts`
- Create Supabase integration module → `lib/supabase-client.ts`

**Phase 2** (Completeness — implement missing pieces):
- Wire Supabase POST in collector template
- Add MCP server skeleton for local querying
- Externalize configuration (machines, paths, apps)
- Document daemon setup (launchd, systemd, cron patterns)

**Phase 3** (Ecosystem):
- Real-time event support (not just snapshots)
- Multi-sentinel coordination patterns
- Dashboard scaffold (Baku reference + examples for other frameworks)
- Example recipes (git scanner, app registry, brain staleness, etc.)

**Phase 4** (Hardening):
- Error retry logic and exponential backoff
- Telemetry validation (schema enforcement, payload sanitization)
- Observability (collector logs, metrics, health checks)
- Rate limiting and quota management (don't hammer Supabase)

---

## Summary

AppyRadar is a **well-structured PoC** that demonstrates clean patterns for multi-machine telemetry collection. Its **core insight** — that SSH via stdin + unified envelope + graceful degradation solves the "how do we coordinate across machines" problem — is exactly what AppySentinel needs.

The **boilerplate should extract** the SSH orchestration, status detection, envelope schema, and Supabase integration patterns. The **recipes should include** disk scanning, git repo discovery, app status checking, and knowledge base staleness detection — but as copy-and-modify examples, not enforced patterns.

AppyRadar's **PoC status** (no Supabase, no daemon, hard-coded config, no MCP) means it needs one more iteration before it becomes the foundation for AppySentinel. But the **direction is right**, and the patterns are **highly reusable**.

---

## Quick Navigation Index

**Start here if you want to:**
- **Understand AppyRadar's purpose** → Section 1
- **Find the code** → Section 2
- **Understand how it runs** → Section 3
- **See configuration patterns** → Section 4
- **Understand data flow** → Sections 5-7
- **See the architecture** → Sections 8-9
- **Identify reusable patterns** → Section 10 (pain points) + Section 14 (boilerplate recommendations)
- **Check deployment readiness** → Section 12
- **Compare to AppySentinel brief** → Section 13
- **Get actionable recommendations** → Section 14 (Tier 1/2/3 patterns)

**Key files to examine:**
- Collector: `/Users/davidcruwys/dev/ad/apps/appyradar/scripts/audit.ts` (661 lines)
- Disk scanner: `/Users/davidcruwys/dev/ad/apps/appyradar/scripts/disk-usage/index.ts`
- Latest snapshot: `/Users/davidcruwys/dev/ad/apps/appyradar/snapshots/appyradar-latest.json`
- Architecture docs: `/Users/davidcruwys/dev/ad/apps/appyradar/docs/architecture.md`

**Key insights for AppySentinel boilerplate:**
- Tier 1 reusable: SSH orchestration, status detection, unified envelope, Supabase client
- Tier 2 reusable: Disk scanner algorithm, bash template system, parsing utilities, cross-machine comparison
- Recipes (copy-and-modify): App registry, git scanner, brain staleness, machines inventory
- Don't generalize: AppyDave-specific metadata, org-specific folder structures, AngelEye schema

