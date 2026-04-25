# Forensic Exploration: AngelEye — Collector/Agent Observability Architecture

**Date:** 2026-04-25  
**Scope:** AngelEye at `/Users/davidcruwys/dev/ad/apps/angeleye/`  
**Purpose:** Extract collector/agent patterns for AppySentinel boilerplate reference.

---

## Executive Summary

AngelEye is a **read-side observability collector** for Claude Code sessions. It observes Claude Code's hook events (fire-and-forget webhooks) and JSONL transcripts, normalizes them into standardized event streams, classifies sessions with multi-tier deterministic rules, correlates related sessions into workflow instances, and exposes real-time updates via Socket.io + REST APIs.

**What it does:** Ingests telemetry (events + transcripts) → normalizes → classifies → correlates → exposes via dashboard.

**What it does NOT do:** Control sessions, execute commands, push to remote, authenticate users, LLM-enrich (Tier 3 is designed but not implemented).

The system is **intentionally observer-only** — it reads events but never fires them back, preventing infinite loops.

---

## 1. Purpose & Real Use Case

### Primary Purpose
Real-time observability dashboard for David to understand what Claude Code work happened across concurrent projects — specifically for the BMAD (Best Minds AI Development) multi-agent workflow where 5-8 AI agents (Bob, Amelia, Nate, Taylor, Lisa, Winston, Sally, John) collaborate on stories across a production pipeline (9 stations: WN → CS → VS → DS → DR → SAT-CS → SAT-RA → CU → SHIP).

### Real Use Case
A developer runs `/bmad-sm CS 2.4` (Bob doing ContextSpike on Story 2.4), which spawns a Claude Code session. That session fires 20+ hook events as Bob uses tools. AngelEye captures all events, classifies the session as BUILD/moderate scale, detects it's part of a multi-agent story (via shared story ID "2.4"), associates it with the workflow pipeline, and displays it in the dashboard alongside the other agents' sessions working on the same story.

### Scope
- **Session**: An atomic Claude Code conversation (1 session_id ≈ 1 conversation thread)
- **Event**: An observable point (session start, user prompt, tool call, session end) from hooks or transcript
- **Classification**: Enriching each session with type (BUILD/TEST/RESEARCH/KNOWLEDGE/OPS/ORIENTATION), scale, tool pattern, 20+ predicates
- **Affinity Group**: Clustering sessions that are related (shared story ID, temporal proximity, cross-project access)
- **Workflow Instance**: Mapping a story through a production-line pipeline (9 stations, each with 0+ sessions)
- **Domain Overlay**: Configuration-driven role/identity/action mappings (e.g., `/bmad-dev` role + DS action = Amelia builder station)

---

## 2. Data Sources & Ingestion Model

### Source 1: Hook Events (Live, Fire-and-Forget)
Claude Code's hook system fires HTTP POST to `http://localhost:5501/hooks/:event` for **24 event types**:

```
Original 7 events:
- SessionStart
- UserPromptSubmit → event: 'user_prompt', payload: { prompt: string }
- PostToolUse → event: 'tool_use', payload: { tool, tool_input, tool_result }
- Stop → event: 'stop', payload: { reason, last_assistant_message }
- SessionEnd
- SubagentStart → event: 'subagent_start', payload: { agent_type }
- SubagentStop

Wave 11 expansion (17 new events):
- PostToolUseFailure → event: 'tool_failure', payload: { error }
- StopFailure
- WorktreeCreate, WorktreeRemove
- CwdChanged, PreToolUse, InstructionsLoaded
- PreCompact, PostCompact
- PermissionRequest, Notification, TeammateIdle
- TaskCompleted, ConfigChange
- Elicitation, ElicitationResult
- FileChanged
```

**Mechanism:** POST request body contains:
```json
{
  "session_id": "abc123",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "...",
  "cwd": "~/dev/projects/foo",
  "agent_id": "uuid",
  "stop_hook_active": false
}
```

Hooks are **rate-unlimited** (excluded from API rate limiter) because they fire in rapid bursts during tool execution. Hooks are **always answered with `{ continue: true }`** even on errors, to prevent blocking Claude Code's session.

### Source 2: JSONL Transcripts (Backfill, Bulk Import)
When AngelEye starts, it scans `~/.claude/projects/*/` for JSONL transcript files (one per session). Each JSONL entry is Claude Code's native format:

```json
{ "type": "user", "message": { "content": "hello" }, "timestamp": "...", "cwd": "..." }
{ "type": "assistant", "message": { "content": [{ "type": "tool_use", "name": "Bash", ... }] }, ... }
{ "type": "custom-title", "customTitle": "My Session" }
```

Backfill **extracts events** from JSONL (user → user_prompt event, assistant tool_use blocks → tool_use events) and **merges into the registry**. This allows AngelEye to catch sessions that were active while it was offline.

**Backfill runs:**
1. **On startup** — auto-heal by importing missing sessions
2. **On-demand** via `POST /api/sync` — full reclassification + delta reporting
3. **With force flag** `?force=true` — re-read all sessions, reclassify even already-typed ones

### Source 3: Skill-Expanded Prompts (Wave 11)
When a user types `/bmad-sm VS 2.4`, Claude Code expands the skill and records XML in the JSONL:
```xml
<command-name>bmad-sm</command-name>
<command-args>VS 2.4</command-args>
```

The backfill service extracts this via regex and reconstructs the original command for trigger_command / trigger_arguments classification fields.

---

## 3. Runtime Model

### Execution Model: Multi-Process Daemon

**Not triggered by events.** Runs as a persistent **Express + Socket.io server on port 5051** (configured in `.env`).

**Startup sequence:**
1. **Node process starts** (via Overmind or nodemon)
2. **initAngelEyeDirs()** creates `~/.claude/angeleye/{sessions,archive,audit}` and `registry.json`
3. **backfillTranscripts()** runs non-blocking, imports any missed sessions from `~/.claude/projects/`
4. **Server listens on port 5051**, ready to accept hook POSTs

**Not on-demand.** Running the app via `npm run dev` or `overmind start` keeps the daemon alive. Hooks POST during user sessions; the server captures them in real-time.

### Hook Processing Flow

```
1. Claude Code fires POST /hooks/UserPromptSubmit { session_id, prompt, cwd, ... }
2. Hooks router receives, normalizes to AngelEyeEvent
3. Event written to ~/.claude/angeleye/sessions/session-<id>.jsonl (append-only)
4. Registry updated: { session_id, last_active, project_dir, ... }
5. Classifier runs on `stop` and `session_end` events, enriches registry with type/scale/predicates
6. Socket.io broadcast to all connected clients: `io.emit('angeleye:event', event)`
7. Respond `{ continue: true }` immediately (non-blocking)
```

**Concurrency handling:** Serial promise queue (`writeQueue`) in registry.service.ts ensures atomic writes. Single-process assumption (no multi-instance coordination).

### Dashboard Interaction

React dashboard (client, port 5050) connects to server via Socket.io, receives `angeleye:event` broadcasts, and updates views in real-time. User can also trigger manual operations (sync, workflow seed, git-sync) via REST buttons.

---

## 4. Configuration Model

### 4A. Domain Overlays (Pluggable, JSON-Driven)

Located: `server/src/config/overlays/bmad-v6.json`

Defines role ↔ identity ↔ action mappings for BMAD domain:
```json
{
  "domain": "bmad-v6",
  "role_mappings": {
    "/bmad-sm": { "role": "planner", "identity": "Bob", "actions": ["WN", "CS", "VS", "ER"] },
    "/bmad-dev": { "role": "builder", "identity": "Amelia", "actions": ["DS"] },
    "/bmad-dr": { "role": "reviewer", "identity": "Nate", "actions": ["DR"] },
    ...
  }
}
```

**How used:**
- When a session is classified, the `trigger_command` (e.g., `/bmad-dev`) is looked up in the overlay
- The matching role/identity/actions are stored as `workflow_role`, `workflow_identity`, `workflow_action` in the registry
- Workflow router later uses these fields to map sessions to pipeline stations

**Extensibility:** Adding a new domain (e.g., "ops-v1") requires:
1. Create `server/src/config/overlays/ops-v1.json`
2. Create corresponding workflow type config
3. Classifier detects trigger_command and applies overlay (already handles multiple overlays)

### 4B. Workflow Type Configs (Station Definitions)

Located: `server/src/config/workflows/bmad-regular-story.json`

Defines a production-line pipeline with 9 stations:
```json
{
  "id": "regular_story",
  "name": "BMAD Story",
  "domain": "bmad-v6",
  "stations": [
    { "position": 0, "action_code": "WN", "role": "planner", "identity": "Bob", ... },
    { "position": 1, "action_code": "CS", "role": "planner", "identity": "Bob", ... },
    ...
    { "position": 8, "action_code": "SHIP", "role": "shipper", "identity": null, ... }
  ]
}
```

Each station has:
- **position**: Sequence number (0-indexed)
- **action_code**: e.g., "CS", "DS", "DR" — parsed from session's workflow_action
- **role**: e.g., "planner", "builder", "reviewer" — parsed from overlay
- **identity**: Agent name (Bob, Amelia, Nate, etc.) or null for multi-agent stations (shipper)
- **requires_fresh_session**: Bool, whether this station must have a dedicated session
- **can_spawn_subagents**: Bool, whether this station's sessions can spawn subagents
- **backtrack_target**: Bool, whether sessions can retry back to this station

**Limitation:** Only **regular_story** type is routed. Epic Zero config exists but has no router logic.

### 4C. Environment Variables

`.env` file (example in `.env.example`):
```
NODE_ENV=development
PORT=5051
CLIENT_URL=http://localhost:5050
VITE_SOCKET_URL=http://localhost:5051
GIT_SYNC_POLL_MS=120000
```

All configuration is environment-based or JSON-in-config-dir. No database migrations or runtime config API yet.

---

## 5. Storage Model

### Directory Structure

```
~/.claude/angeleye/
├── registry.json          # Central index of all sessions (key: session_id)
├── workspaces.json        # User-defined workspaces for grouping
├── sessions/              # Event JSONL files per session
│   ├── session-abc123.jsonl
│   ├── session-def456.jsonl
│   └── ...
├── archive/               # Ended sessions (after session_end event)
│   ├── session-abc123.jsonl
│   └── ...
└── audit/                 # Schema audit trails (Wave 11 validation)
    └── ...
```

### Storage Strategy: Flat Files, No Database

**Why flat files:**
- Zero external dependencies (no SQLite/Postgres setup)
- Human-readable and inspectable
- Local dev tool with ~1000 sessions (manageable scale)
- Events are append-only (immutable logs pattern)

**registry.json format:**
```json
{
  "session-abc123": {
    "session_id": "session-abc123",
    "project": "angeleye",
    "project_dir": "~/dev/ad/apps/angeleye",
    "started_at": "2026-04-25T10:00:00Z",
    "last_active": "2026-04-25T10:05:00Z",
    "name": "Refactor classifier",
    "status": "ended",
    "source": "hook",
    "session_type": "BUILD",
    "session_scale": "moderate",
    "tool_pattern": "edit-heavy",
    "workflow_role": "builder",
    "workflow_action": "DS 2.4",
    "has_git_outcome": true,
    ...
  },
  ...
}
```

**Event JSONL format:**
```
{ "id": "uuid", "session_id": "...", "ts": "...", "source": "hook", "event": "user_prompt", "prompt": "..." }
{ "id": "uuid", "session_id": "...", "ts": "...", "source": "hook", "event": "tool_use", "tool": "Bash", "tool_summary": {...} }
...
```

### Concurrency & Atomicity

**Serial write queue** in `registry.service.ts`:
```typescript
let writeQueue: Promise<void> = Promise.resolve();
export function updateRegistry(sessionId: string, updates: Partial<RegistryEntry>): Promise<void> {
  writeQueue = writeQueue.then(() => _doUpdateRegistry(...));
  return writeQueue;
}
```

**Atomic file write:** Temp file + rename pattern
```typescript
const tmp = _registryPath() + '.tmp';
await writeFile(tmp, JSON.stringify(registry, null, 2), 'utf-8');
await rename(tmp, _registryPath());
```

**Assumption:** Single-process (AngelEye should not run as multiple instances pointing at the same data dir).

### Size & Performance

Current state: ~222 MB under `~/.claude/angeleye/` (mostly accumulated JSONL transcripts from 1000s of sessions).

No pruning or archival policy yet. Files grow unbounded. Backfill scans all JSONL files on startup, which slows as volume grows.

---

## 6. Collector & Enrichment Pipeline

### Pipeline Architecture: Layered Classification

**Tier 1 (Deterministic Counts)**
- Tool call counts → detect session_scale (micro/light/moderate/heavy/marathon)
- Tool type percentages → detect tool_pattern (playwright-heavy, bash-heavy, edit-heavy, etc.)
- Predicates: has_playwright_calls, is_machine_initiated, has_git_outcome, etc.

**Tier 2 (Regex/Heuristic)**
- Pattern matching on prompt text → detect has_voice_dictation_artifacts, has_handover_context, has_closing_ceremony
- Brain file detection → has_brain_file_writes
- Cross-session refs → has_cross_session_refs

**Tier 3 (LLM Enrichment — Designed, Not Implemented)**
- Semantic classification (would cluster prompts by intent, detect intent changes mid-session, etc.)
- Infrastructure designed (API client, batch queue) but not built
- Would enrich 22 remaining classification items

**Phase 2c Behavioural Classifiers (Deterministic)**
- opening_style: typed_question | typed_instruction | voice_dictation | skill_invocation | ...
- closing_style: commit_push | summary_close | abrupt_abandon | ...
- delegation_style: conversational | directive | orchestrated | autonomous
- session_liveness: high | medium | low
- output_type: conversation_only | code_changes | knowledge_synthesis | ...

All tiers run synchronously in the `classifySession()` function on `stop` and `session_end` events. Results written back to registry atomically.

### Classification Accuracy Gates

**Scale-aware demotion:** Micro/light sessions misclassify as BUILD when they should be ORIENTATION. Classifier applies scale gates:
```
if scale === 'micro' && wouldBeBuild(toolPattern) → return 'ORIENTATION'
if scale === 'light' && wouldBeBuild(toolPattern) → return 'ORIENTATION' (or KNOWLEDGE if dir includes 'brain')
```

Validated against 924-session analysis campaign.

---

## 7. Correlation & Affinity Groups

### Signal 1: Shared Story ID (Deterministic)

Extract story ID "2.4" from `trigger_arguments` (e.g., "DS 2.4"). Group sessions with same story ID into `story_unit` affinity group.

Only group sessions within 7 days of each other (prevents stale associations across sprints).

### Signal 2: Temporal Proximity (Heuristic)

Sessions with same domain overlay + started within 4 hours → cluster into `ad_hoc` affinity group.

Skip clusters that are already fully covered by story_units (prevent double-grouping).

### Signal 3: Cross-Project Access (Heuristic)

Sessions with `has_cross_project_reads=true` + nearby sessions (4 hours) in a different project → potential `ad_hoc` group.

### Merge Strategy: Union-Find with Type Guards

Candidates are merged using union-find to prevent cross-type merges:
- `story_unit` groups are separate from `ad_hoc` groups
- Type guard prevents story units merging with ad_hoc clusters (which was a pre-existing bug)

### Chain Metadata

For each group, compute:
- **chain_steps**: Ordered list of (role, action) pairs by started_at
- **backtracks**: Sessions revisiting the same (role, action) pair (e.g., retry DS twice)
- **backtrack_details**: Explicit list of backtracked stations

---

## 8. Workflow Routing (Factory Model)

### Concept: Production Line Pipeline

A **workflow instance** represents a story's journey through a factory:
- **Work Item**: Story (e.g., "2.4")
- **Stations**: Sequential steps (e.g., WN → CS → VS → DS → DR → SAT-CS → SAT-RA → CU → SHIP)
- **Workers**: Sessions (each session works at one or more stations)

A station can have **multiple sessions** (retries, backtracks). A station is "completed" when **all its sessions have ended**.

### Routing Algorithm: seedWorkflowsFromRegistry()

**Step 1:** Read registry, filter to BMAD sessions (trigger_command starts with "bmad")

**Step 2:** Parse workflow_action to extract (actionCode, storyId)
```
"DS 2.4" → { actionCode: "DS", storyId: "2.4" }
"WN" → { actionCode: "WN", storyId: null } ← gatekeeper, unroutable
```

**Step 3:** Validate:
- Must have workflow_action
- Must have workflow_role (for station lookup)
- Must parse to actionCode + storyId (except WN gatekeepers)

**Step 4:** Multi-level station lookup:
```
1. Primary: role:actionCode lookup (e.g., "builder:DS" → position 3)
2. Fallback: role-only lookup (e.g., "shipper:" for multi-agent stations)
3. Last resort: actionCode-only scan (e.g., "CU" from tester role routes to advisor:CU station)
```

Fallback strategies handle real-world mismatches (e.g., tester role with CU action routes to advisor station).

**Step 5:** Group sessions by storyId, find/create workflow instances

**Step 6:** Associate sessions with stations, mark stations in_progress, auto-detect completion

**Step 7:** Detect workflow closure:
- All populated stations must be completed AND
- Either the final station has sessions OR at least half of stations have sessions

### Routing Result Tracking

`unroutable_reasons` array tracks why sessions weren't routed:
- `"bmad session with null workflow_action"`
- `"gatekeeper session (WN) — pending workflow association"`
- `"no story id (actionCode: DS)"`
- `"no workflow_role for station disambiguation"`
- `"no station found for role=tester actionCode=XX"`

Users can inspect these to debug coverage gaps.

### Limitations

- **Only regular_story type is routed.** Epic Zero config exists but has no routing logic.
- **Concurrency guard:** Module-level `seedInProgress` boolean. If seed crashes, guard stays locked until process restarts → 409 Conflict on next attempt.
- **WN gatekeepers always unroutable.** No story ID means no workflow instance to attach to.

---

## 9. APIs & Interfaces

### Hook Endpoints (Internal, Fire-and-Forget)

```
POST /hooks/:event
  Body: { session_id, hook_event_name, prompt, cwd, agent_id, ... }
  Response: { continue: true } (always 200, never blocks)
```

24 event types mapped via `EVENT_MAP` in hooks.ts.

### REST APIs (External, Client-Facing)

```
POST /api/sync?force=true           # Backfill transcripts, reclassify all
GET  /api/sync/status               # Last sync timestamp

POST /api/workflows/seed?dry_run     # Route sessions to workflow stations
GET  /api/workflows                 # List workflow instances

POST /api/git-sync/pull             # Git fetch + pull AngelEye repo
GET  /api/git-sync/status           # Dirty/ahead/behind/diverged state

GET  /api/sessions                  # List all sessions
GET  /api/sessions/:id              # Get single session + events

GET  /api/projects                  # List projects with coverage stats
GET  /api/stats/fields              # Field distribution analysis

GET  /api/affinity-groups           # List affinity groups
```

### Socket.io Events (Real-Time)

**Server → Client:**
```typescript
'angeleye:event'  // Broadcast when hook event arrives
'angeleye:registry'  // Broadcast when session classification changes
'entity:created', 'entity:updated', 'entity:deleted'  // Generic entity events
```

**Client → Server:**
```typescript
'client:ping'  // Heartbeat
```

No authentication. Local tool assumption.

### MCP (Model Context Protocol)

**Not currently exposed.** Designed for future — would allow local AI agents to query telemetry and trigger actions (sync, seed, git-sync).

---

## 10. Data Sources Consumed

### From Claude Code (Hook System)

- **24 event types:** user_prompt, tool_use, stop, session_start/end, subagent_start/stop, tool_failure, worktree events, config changes, permissions, notifications, etc.
- **Payload fields:** prompt text, tool name & input/result, cwd, agent_id, error messages, permission mode
- **Metadata:** session_id, timestamp, hook_event_name, stop_hook_active guard

### From JSONL Transcripts

- **Entry types:** user, assistant, custom-title, agent-name, system, turn_duration
- **Extracted:** user prompts, tool use blocks, timestamps, working directory, custom session names
- **Parsed:** Skill-expanded commands (XML: `<command-name>`, `<command-args>`)

### From Runtime

- **Project directories:** `~/.claude/projects/*/` (JSONL transcripts)
- **Environment:** NODE_ENV, PORT, CLIENT_URL, git repo state
- **File system:** AngelEye's own data dir (`~/.claude/angeleye/`)

### What's NOT Consumed

- No remote API calls (local-only)
- No database (file-based storage)
- No authentication/identity system (trusts all hook sources)
- No LLM enrichment yet (Tier 3 designed but not implemented)

---

## 11. Transport & Push Model

### No Remote Push

AngelEye **does not push** anywhere. It is entirely local, pulling from Claude Code's file system and hook events, storing in `~/.claude/angeleye/`, and serving via HTTP + Socket.io to localhost.

**Future:** Architecture brief mentions central system (optional, for multi-machine coordination), but not implemented.

### Polling: Git Sync Only

`GitSyncService` polls the AngelEye repository itself every GIT_SYNC_POLL_MS (default 120s):
```
fetch origin
check status (clean, dirty, ahead, behind, diverged)
auto-pull if clean and behind
```

Used to keep AngelEye's own source code in sync (not the monitored projects).

---

## 12. Pain Points: Bespoke vs. Reusable

### BESPOKE TO CLAUDE CODE (Don't Generalize)

1. **Hook system integration:** The entire 24-event hook API is Claude Code-specific. Generic collector boilerplate should accept hooks as a **plugin interface**, not hardcode Claude Code's event types.

2. **JSONL transcript parsing:** Claude Code's specific JSONL format (user/assistant/custom-title entries, XML skill expansion) is unique. Backfill logic should be **swappable** for other applications' transcript formats.

3. **trigger_command / trigger_arguments extraction:** BMAD workflow commands (`/bmad-sm`, `/bmad-dev`, etc.) are application-domain-specific. The **overlay pattern** is reusable; the BMAD content is not.

4. **Skill-expanded command regex:** The XML pattern for extracted skills (`<command-name>`, `<command-args>`) is Claude Code-specific. Should be a pluggable parser.

5. **Agent naming & BMAD workflow model:** Bob, Amelia, Nate, Taylor, Lisa, Winston, Sally, John are BMAD-specific roles. The **workflow pipeline concept** (stations, agents, retries) is generalizable.

### REUSABLE PATTERNS (Promote to Boilerplate)

1. **Multi-tier classification pipeline:**
   - Tier 1: Deterministic counts (pattern-matched fields)
   - Tier 2: Regex/heuristic enrichment
   - Tier 3: LLM-based semantic enrichment
   
   This is generalizable. Any collector could layer these.

2. **Observer-only architecture:**
   - No bidirectional control (no session injection, no command execution)
   - Read-side projection only
   - Prevents feedback loops
   
   Core principle: **Only observe, never act.**

3. **Event normalization:**
   - Raw source events → normalized AngelEyeEvent
   - Source tagging (hook vs. transcript)
   - Uniform timestamp, session_id, event_type
   
   Pattern: Define a minimal event envelope, map diverse sources to it.

4. **Registry-as-index:**
   - Central JSON file mapping entity IDs to enriched metadata
   - Append-only event JSONL per entity
   - Serial write queue for concurrent updates
   
   Pattern: Use flat files with atomic writes (temp + rename) for single-process safety.

5. **Configuration-driven overlays:**
   - JSON files define domain-specific role/action mappings
   - No hardcoded domain logic
   - Pluggable for new domains
   
   Pattern: Move domain knowledge out of code into config.

6. **Affinity grouping via signals:**
   - Signal 1: Direct ID matching (deterministic)
   - Signal 2: Temporal proximity (heuristic)
   - Signal 3: Cross-entity access (heuristic)
   - Merge with type guards
   
   Pattern: Layered correlation, not monolithic clustering.

7. **Workflow router with fallback strategies:**
   - Primary lookup (exact key match)
   - Fallback lookups (partial match, role-only, entity-only)
   - Detailed unroutable reason tracking
   
   Pattern: Graceful degradation + observability.

8. **Real-time Socket.io broadcasting:**
   - All clients receive entity updates instantly
   - No client polling loop
   - Clean subscription pattern
   
   Pattern: Event stream + broadcast, not request-response.

9. **Serial async queue for concurrent writes:**
   - Promise chaining to serialize I/O
   - Non-blocking to caller (returns immediately)
   - Handles rapid bursts (e.g., hook events)
   
   Pattern: Backpressure without blocking.

10. **Scale-aware quality gates:**
    - Micro/light sessions demoted from high-confidence to low-confidence classification
    - Validated empirically (924-session campaign)
    
    Pattern: Adjust classifier output based on data quality signals.

### THINGS THAT WERE HAND-ROLLED (Should Become Recipes)

1. **Skill prompt extraction from XML:**
   - Specific regex for Claude Code's skill expansion format
   - Would be a recipe: "Extract skill commands from expanded JSONL"

2. **BMAD domain overlay + workflow config:**
   - Complete BMAD v6 overlay and regular_story workflow type
   - Would be a recipe: "Set up BMAD multi-agent workflow observability"

3. **Phase 2c behavioural classifiers:**
   - Specific heuristics for opening_style, closing_style, delegation_style
   - Would be a recipe: "Add behavioural classification" (reusable pattern, domain-specific heuristics)

4. **Git sync polling loop:**
   - AngelEye-specific (polling the AngelEye repo itself)
   - Would be a recipe: "Add git auto-sync for live code updates"

5. **Campaign analysis & dashboard views:**
   - CampaignDashboardView, CampaignInfographicView
   - Would be a recipe: "Build analytics/visualization layer"

---

## 13. Tech Stack & Deployment

### Runtimes & Frameworks

- **Node.js 22** (inferred from devDependencies)
- **Express 5** (server)
- **React 19 + Vite 7** (client, compiled to static assets)
- **Socket.io 4** (real-time communication)
- **TypeScript 5** (all code)
- **Pino** (logging)
- **Zod** (environment validation)
- **Vitest + Supertest** (testing)
- **Nodemon** (dev watch)
- **Overmind** (process management)

### Build & Run

```bash
npm run build         # TypeScript → JS, Vite bundles client
npm run dev           # Start server (nodemon) + client (Vite) concurrently
npm run test          # Vitest (server + client)
./scripts/start.sh    # Production: builds shared, checks ports, launches via Overmind
```

### Workspace Structure (npm workspaces monorepo)

```
angeleye/
├── shared/src/      # Shared types (TypeScript interfaces only)
├── server/src/      # Express app + services
├── client/src/      # React app
├── package.json     # Root workspace config
└── data/            # Runtime: registry.json, sessions/, workflows/
```

Data is written to `data/` at monorepo root, not inside any package's `src/` (prevents nodemon restart loops).

### Configuration

- **.env**: NODE_ENV, PORT, CLIENT_URL, GIT_SYNC_POLL_MS
- **server/src/config/env.ts**: Zod schema, runtime validation
- **server/src/config/logger.ts**: Pino logger setup
- **server/src/config/overlays/**: Domain JSON files
- **server/src/config/workflows/**: Workflow type JSON files
- **server/src/config/projects/**: Project-specific config (caching issue — no live reload)

### Deployment

Not currently designed for remote deployment (no auth, no multi-instance coordination). Runs as local daemon on developer's machine.

Future: Would need authentication, multi-machine sync (mentioned in architecture brief as B044), and resilience for remote hosting.

---

## 14. Tests & Quality

### Test Coverage

- **Server:** Vitest + Supertest
  - Routes (hooks, sync, workflows, sessions, etc.)
  - Services (classifier, correlator, workflow-router, backfill)
  - Middleware (rate limiter, error handler)
  - Config & env validation

- **Client:** Vitest + Testing Library + jsdom
  - Hooks (useSocket, useServerStatus)
  - Utils (session helpers, API calls)
  - Components (SessionEventsPanel)

- **E2E:** Playwright smoke tests

### Gaps

- No workflow router E2E tests (integration with actual registry + workflows)
- No full-stack tests of hook → classification → workflow routing flow
- Limited coverage of edge cases (e.g., concurrent hook bursts, registry corruption recovery)
- No performance/load tests (scales to 1000s sessions, not tested under concurrent load)

### Key Failures Documented

**CONTEXT.md** failure modes section details 12 edge cases:
- Silent event loss from hook errors (mitigated by POST /api/sync?force=true)
- Registry corruption from process crash (atomic rename pattern helps; orphaned .tmp files can accumulate)
- Backfill missing sessions if JSONL format changes (no version detection)
- Correlator over-merging via union-find bridges (fixed by type guards)
- Workflow router unroutable sessions lack UI surface (only visible in API response)
- Git sync mutex doesn't prevent Overmind restart races
- Seed concurrency guard can get stuck (simple boolean, not timeout-based)
- Project config cache stale after file edits (no invalidation)
- SessionEventsPanel blank state if events API slow (no timeout/retry)

---

## 15. Explicit Recommendations

### PATTERNS WORTH PROMOTING TO BOILERPLATE

These are architectural principles that generalize beyond AngelEye:

1. **Multi-tier enrichment pipeline** (deterministic → heuristic → semantic)
   - Reusable: Any telemetry collector needs layered classification
   - Not domain-specific

2. **Observer-only architecture** (read-side projection, never write-side)
   - Reusable: Prevents feedback loops, simpler to reason about
   - Core principle for trustworthy observability

3. **Event normalization envelope** (unified event type with source tagging)
   - Reusable: Standardizes diverse input sources
   - Pattern: Map diverse sources to minimal schema

4. **Flat-file storage with atomic writes** (temp + rename for single-process safety)
   - Reusable: Zero external dependencies, human-readable
   - Limitation: Single-process assumption (add disclaimer)

5. **Serial async queue for concurrent I/O** (Promise chaining for serialization)
   - Reusable: Handles bursts without blocking, non-blocking API
   - Pattern: Backpressure without explicit locks

6. **Configuration-driven domain overlays** (JSON files, no hardcoded logic)
   - Reusable: Pluggable domains, extensible without code changes
   - Pattern: Move domain knowledge to config

7. **Registry-as-index pattern** (central metadata, append-only event logs)
   - Reusable: Decouples enrichment from data storage
   - Pattern: CQRS-lite (command query responsibility segregation)

8. **Affinity grouping with signals** (layered correlation, type guards)
   - Reusable: Multi-signal clustering without over-merging
   - Pattern: Compositional matching (Signal 1, Signal 2, Signal 3)

9. **Workflow router with fallback lookups** (primary → fallback → last-resort)
   - Reusable: Handles real-world messy data gracefully
   - Pattern: Graceful degradation with detailed reason tracking

10. **Scale-aware classifier gates** (adjust confidence based on data quality)
    - Reusable: Empirically validated accuracy improvements
    - Pattern: Quality gates as a classification layer

### THINGS THAT SHOULD BECOME RECIPES

These are patterns that are reusable but domain-specific implementations:

1. **Skill command extraction from expanded JSONL**
   - Recipe: "Extract commands from transcript expansion"
   - Specific to Claude Code; could be adapted for other SKDs

2. **BMAD multi-agent workflow setup**
   - Recipe: "Set up production pipeline with role-based agents"
   - Domain: BMAD; reusable pattern but specific config

3. **Behavioural classification heuristics** (opening_style, closing_style, etc.)
   - Recipe: "Add session behaviour analysis"
   - Pattern is reusable; heuristics are domain-specific

4. **Git auto-sync polling loop**
   - Recipe: "Add git polling for live code updates"
   - AngelEye-specific; could generalize to other git-based workflows

5. **Dashboard + analytics visualization**
   - Recipe: "Build multi-view observability dashboard"
   - Reusable pattern (list view, detail view, analytics view)

6. **Campaign analysis & field distribution**
   - Recipe: "Analyze classifier distributions and accuracy"
   - Generalizable: Any classifier can have field distribution analysis

### THINGS THAT WERE CLAUDE-SPECIFIC (DON'T GENERALIZE)

These should NOT be promoted to boilerplate — they are implementation details tied to Claude Code:

1. **Hook event types (24 types, Claude Code-specific)**
   - Don't generalize: Hardcoding hook names couples boilerplate to Claude Code
   - Instead: Make boilerplate a hook event **consumer interface** (pluggable event mappers)

2. **JSONL transcript format (Claude Code's native format)**
   - Don't generalize: Would need to support many transcript formats (other IDEs, etc.)
   - Instead: Make backfill **pluggable** (transcript parser interface)

3. **Skill command parsing (Claude Code skills, XML expansion)**
   - Don't generalize: Specific to Claude Code's skill system
   - Instead: Make prompt extraction **pluggable** (transcript entry parser)

4. **BMAD agents and workflow (Bob, Amelia, Nate, Taylor, etc.)**
   - Don't generalize: Domain-specific to BMAD project
   - Instead: Document as **recipe** (template for setting up multi-agent workflows)

5. **Tool pattern detection (Bash, Edit, Playwright, etc.)**
   - Don't generalize: Each application has different tools
   - Instead: Make tool classification **pluggable** (tool name → category mapping)

6. **PII detection patterns (email, AWS keys, etc.)**
   - Don't generalize (yet): Very Claude Code-specific
   - Instead: Document as **recipe** with extensibility notes

---

## 16. Architectural Strengths & Tradeoffs

### Strengths

1. **Deterministic classification:** No LLM calls = instant, free, reproducible. Validated across 924 sessions (70% accuracy without Tier 3).

2. **Observer-only design:** Prevents infinite loops, simpler reasoning, no session control complexity.

3. **Layered enrichment:** Tiers decouple count-based detection from heuristics from semantic understanding. Each tier can improve independently.

4. **Pluggable domains:** New workflows added via JSON config, no code changes.

5. **Real-time updates:** Socket.io broadcasts mean dashboard is always live, no polling.

6. **Append-only events:** JSONL transcripts are immutable logs. Replay is always possible.

7. **Graceful degradation:** Workflow router falls back through 3 lookup strategies rather than hard-failing.

### Tradeoffs

1. **Single-process assumption:** Serial queue prevents multi-instance. Would need file locking or cluster coordination for distributed deployment.

2. **No database:** Flat files are human-readable but scale poorly. Scanning all JSONL files on startup becomes slow as volume grows.

3. **No remote push:** Local-only design. Multi-machine coordination requires additional sync layer (mentioned as B044 in backlog).

4. **Hardcoded event types:** 24 event types mapped in code. New Claude Code hooks require code change (though routable via payload field).

5. **Tier 3 not implemented:** LLM enrichment designed but not built. 22 classification items still unresolved.

6. **No cache invalidation:** Project configs cached in memory, no live reload. File edits during runtime invisible until restart.

7. **WN gatekeepers unroutable:** Sessions with no story ID can't be associated with workflows. By design, but creates blind spots.

---

## 17. Data Flow Diagram (Text)

```
Claude Code Sessions
        │
        ├─→ Hook Events (fire-and-forget POST /hooks/:event)
        │        │
        │        └─→ Hooks Router (normalize to AngelEyeEvent)
        │                 │
        │                 ├─→ Event Writer (append to session-*.jsonl)
        │                 ├─→ Registry Updater (atomic write registry.json)
        │                 ├─→ Classifier (on stop/session_end)
        │                 └─→ Socket.io Broadcaster (→ Dashboard)
        │
        └─→ JSONL Transcripts (~/.claude/projects/*/*)
                 │
                 └─→ Backfill Service (POST /api/sync)
                      │
                      ├─→ Custom Title Extractor
                      ├─→ Skill Prompt Extractor (XML parsing)
                      ├─→ Event Extractor (user_prompt, tool_use)
                      ├─→ Classifier (Tier 1 + Tier 2)
                      └─→ Registry Writer
                           │
                           ├─→ Registry Index (~/.claude/angeleye/registry.json)
                           ├─→ Overlay Resolver (BMAD v6 role/action mapping)
                           └─→ Classifier Result
                                │
                                ├─→ Affinity Correlator
                                │    ├─ Signal 1: Story ID matching
                                │    ├─ Signal 2: Temporal proximity
                                │    ├─ Signal 3: Cross-project access
                                │    └─→ Affinity Groups
                                │
                                └─→ Workflow Router (seedWorkflowsFromRegistry)
                                     ├─ Parse workflow_action
                                     ├─ Multi-level station lookup
                                     ├─ Associate sessions → stations
                                     └─→ Workflow Instances (w/ station states)
                                          │
                                          └─→ Dashboard
                                               ├─ Observer View (real-time sessions)
                                               ├─ Workflows View (pipeline list)
                                               ├─ WorkflowDetailView (pipeline + chat)
                                               └─ Inspector View (schema + data)
```

---

## 18. Summary & Next Steps for AppySentinel

### For AppySentinel Boilerplate

**Import these patterns:**

1. Multi-tier enrichment pipeline framework
2. Observer-only architecture principle
3. Event normalization + source tagging
4. Flat-file registry with atomic writes + serial queue
5. Configuration-driven overlays pattern
6. Affinity grouping with layered signals
7. Workflow router with fallback strategies
8. Scale-aware quality gates for classification
9. Socket.io real-time broadcasting
10. Detailed unroutable/failure reason tracking

**Do NOT directly copy:**

1. Hook event types (Claude Code-specific)
2. JSONL parsing logic (Claude Code-specific)
3. BMAD workflow configs (domain-specific)
4. Agent/role naming (domain-specific)

**Make pluggable:**

1. Hook event mapper (allow custom event types)
2. Transcript parser (allow different formats)
3. Tool classifier (allow custom tool → category mappings)
4. Domain overlay loader (JSON-driven, extensible)

---

## 19. Files Referenced (Key Source Paths)

```
/Users/davidcruwys/dev/ad/apps/angeleye/

# Shared Types
shared/src/angeleye.ts           # AngelEyeEvent, RegistryEntry, WorkflowInstance
shared/src/types.ts              # Socket.io event interfaces

# Server Entry
server/src/index.ts              # Express app, Socket.io setup, startup sequence

# Data Access
server/src/services/registry.service.ts       # Read/update registry, serial queue
server/src/services/sessions.service.ts       # Event JSONL write/read

# Ingestion
server/src/routes/hooks.ts                    # Hook event normalization (24 types)
server/src/services/backfill.service.ts       # JSONL transcript parsing + skill extraction

# Classification
server/src/services/classifier.service.ts     # Tier 1 + Tier 2 + Phase 2c classifiers

# Correlation
server/src/services/correlator.service.ts     # 3-signal affinity grouping

# Workflow Routing
server/src/services/workflow-router.service.ts # Parse action, station lookup, instance routing
server/src/services/overlay.service.ts        # Domain overlay resolution

# Configuration
server/src/config/overlays/bmad-v6.json       # BMAD role mappings
server/src/config/workflows/bmad-regular-story.json # 9-station pipeline

# API Routes
server/src/routes/sync.ts                     # POST /api/sync, backfill trigger
server/src/routes/workflows.ts                # POST /api/workflows/seed, workflow CRUD
server/src/routes/sessions.ts                 # GET /api/sessions, session list/detail

# Client
client/src/views/WorkflowDetailView.tsx       # Pipeline visualization + chat panel
client/src/components/SessionEventsPanel.tsx  # Event → turn grouping, conversation replay
```

---

**Report generated:** 2026-04-25  
**Scope:** Read-only forensic analysis  
**Status:** Complete
