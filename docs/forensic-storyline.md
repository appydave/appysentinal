# Forensic Exploration: Storyline App

**Date**: 2026-04-25  
**Target**: `/Users/davidcruwys/dev/ad/flivideo/storyline-app/`  
**Purpose**: Identify collector-shaped patterns in Storyline that could inform AppySentinel design

---

## Executive Summary

Storyline App is fundamentally a **web UI for reviewing pre-processed video data**, not a collector or agent system. However, it does exhibit several **observation and state-synchronization patterns** that are worth understanding:

1. **File watchers** (Chokidar) monitoring external project directories
2. **Real-time status synchronization** via WebSocket and debounced polling
3. **Configuration-driven behavior** (project paths stored in JSON)
4. **Stateless server transformation** layer (loads, transforms, serves — never persists)
5. **Event-driven architecture** between watcher, sync service, and Socket.io broadcasts

**Verdict**: Storyline is **NOT a useful reference for building collectors**. It is an **observer of external state changes** and a **presentation layer** — roles orthogonal to collection. AppySentinel should not copy its patterns; instead, understand what Storyline consumes (processed JSON data) and build complementary collector patterns that feed systems like it.

---

## 1. File Watchers / Transcript Ingestion

### What Storyline Watches

**File watchers exist**: Yes. `FileWatcherService` (fileWatcher.service.ts) uses Chokidar to monitor:
- `{projectPath}/assets/original-images/`
- `{projectPath}/assets/scene-images/`

**What it detects**: File adds, deletes, changes, and directory adds/deletes. Emits typed events with:
- File type (original-images or scene-images)
- Shot number and variation number extracted from filenames (pattern: `001_02.jpg`)
- File size and extension metadata

### Transcript Ingestion

**Does Storyline ingest transcripts?** No.

Transcripts are explicitly handled **externally**. Per CONTEXT.md:
> "Does NOT manage Whisper transcription — word-level timing comes from external Python processing; the app only visualizes and validates timing data."

The storyline JSON (the input data) contains:
- `beatWords`: word-level timing *already computed* by external Whisper AI
- `globalWordIndex`: pre-assembled timeline of all words
- `timingValidation`: gaps already identified

**Collector implication**: Storyline is the *consumer*, not the source. A separate collector would ingest:
- Video files or transcript URLs
- Run Whisper transcription (or call an API)
- Segment into beats using LLM
- Generate image/animation prompts
- Write storyline.json
- Then Storyline watches for changes and presents them

---

## 2. External API Polling or Scraping

**Does Storyline poll YouTube, Wistia, or external sources?** No.

Grep results show:
- No `axios`, `fetch`, or HTTP client imports
- No API keys or credentials loaded
- No polling loops
- Mentions of "transcript-to-json-workflow" are in documentation, not code

All external data (video metadata, transcripts, image generation results) is expected to be written to local directories as JSON/image files. The app reads these static files, never polls upstream services.

**Collector implication**: If AppySentinel needs to collect from YouTube, Wistia, etc., those patterns belong elsewhere. Storyline teaches the inverse: assume collectors have already done the work.

---

## 3. Subprocess Wrapping

**Does Storyline spawn external tools?** Minimally.

Only instance: `index.ts` uses `execSync` for port cleanup:
```typescript
execSync(`lsof -ti:${port}`)  // Find processes on port
execSync(`kill -9 ${pid}`)     // Kill them
```

This is **infrastructure**, not domain logic. It's a workaround for dev server restarts, not a pattern for collecting data.

No evidence of:
- Whisper process spawning (external, pre-done)
- n8n workflow triggering (future v2 feature, not implemented)
- Subprocess chains for data processing

---

## 4. Background Workers / Long-Running Loops

**Explicit background workers?** No.

**What exists instead**:

1. **File watcher service** (`FileWatcherService`):
   - Starts watching a project's asset directories when client joins via WebSocket
   - Lazy initialization (not on server startup)
   - Emits `fileChange` events continuously

2. **Status sync service** (`StatusSyncService`):
   - Debounced (1-second debounce) reaction to file changes
   - Recalculates file status: `foundFiles`, `missingFiles`, `extraFiles`, etc.
   - Emits `statusUpdate` events

3. **No polling intervals**: No `setInterval`, `setTimeout`-based polling loops. Only debounce timers that clear after firing.

4. **Event-driven, not loop-driven**: Work happens in response to file system events, WebSocket messages, or debounce timeouts — not periodic checks.

**Collector implication**: Storyline uses **reactive event handling** (good). AppySentinel should consider similar: collectors should react to triggers (new files, API responses, configuration changes) rather than spin polling loops.

---

## 5. Local IPC / MCP / API Surface

**Does Storyline expose an MCP interface or API for external tools to drive it?** Limited.

### What Exists

**Express REST API**:
- `GET /api/health` — health check
- `GET /api/data/:projectName` — load storyline JSON
- `GET /api/images/:projectName/...` — serve images
- `PATCH /api/data/:projectName` — update project metadata
- `POST /api/project/configure` — update project config
- etc.

**Socket.io Events** (two-way):
- Client → Server: `join:project`, `leave:project`, `watcher:start`, `watcher:stop`, `status:refresh`, etc.
- Server → Client: `file:change`, `status:updated`, `watcher:error`, etc.

### What's Missing

**No MCP server**: Storyline does NOT implement the Model Context Protocol. It's a standalone web app, not an MCP server that Claude or other agents could call.

**No agent interface**: No webhooks, no trigger mechanism for external tools to ask Storyline to do something. The relationship is one-way: external tools write files, Storyline watches and displays.

**Collector implication**: If AppySentinel is meant to be driven by Claude or other local agents, it needs an MCP interface (or similar). Storyline shows the *consumer* side of that pattern (receiving data via file system), but not the *producer* side (pushing status/events to agents).

---

## 6. Snapshot or State Collection

**Does Storyline capture snapshots of system state over time?** Minimally.

### Project Configuration Snapshots

`project-config.json` (in server root):
```json
{
  "currentProject": "boy-baker",
  "projects": [
    {
      "projectName": "boy-baker",
      "projectPath": "/path/to/boy-baker",
      "status": "active",
      "lastUsed": "2026-04-25T10:00:00Z"
    }
  ]
}
```

This is **state storage**, not a snapshot stream. It's read on every request and written back on project switch.

### File Status Cache

`StatusSyncService` maintains:
- A `Map<projectName, FileStatus>` cache
- Compares old vs. new status to detect meaningful changes
- No time-series history, no audit trail

Per the code:
```typescript
private hasStatusChanged(oldStatus, newStatus): boolean {
  // Checks if foundFiles, missingFiles, extraFiles arrays changed
  // Returns true/false — no historical record
}
```

**Collector implication**: No time-series snapshots. This is appropriate for a UI — you only care about current state. AppySentinel, if it needs to track *changes over time*, should emit events to a central log (as per architecture-brief: "State Snapshot" data type with timestamp).

---

## 7. Configuration Patterns

### Project Configuration

**File**: `server/project-config.json`

**Structure**:
```json
{
  "currentProject": "string",
  "projects": [
    {
      "projectName": "string",
      "projectPath": "/absolute/path",
      "status": "string",
      "lastUsed": "ISO8601"
    }
  ]
}
```

**Behavior**:
- Loaded once on server startup (cached in memory)
- Written back only when project is switched (via UI POST request)
- No validation schema — trust user input
- No environment variables; hardcoded to `process.cwd()/project-config.json`

### Per-Project Configuration

External projects define their own layout:
```
{projectPath}/
├── data/
│   └── storyline.json  (or {projectName}-storyline.json)
├── assets/
│   ├── original-images/
│   └── scene-images/
└── ...
```

Server reads `storyline.json` on every data request (no caching).

### Environment Variables

Zod-validated via `server/src/config/env.ts`:
- `PORT` (default 5301)
- `CLIENT_URL` (default http://localhost:5300)
- `NODE_ENV` (development/production)

Validated at startup; throws immediately if invalid.

**Collector implication**: 
- Storyline's approach: **per-instance config in a JSON file**, read once, cached
- Recommendation for AppySentinel: Similar, but add schema validation (Zod). Consider hierarchical config: global defaults + instance overrides.

---

## 8. Storage

### No Persistent Data Store

**Database?** None. No SQLite, MongoDB, or schema.

**All data is read from external files:**
1. Project configuration → `project-config.json` (read-once, in-memory cache)
2. Storyline data → `{projectPath}/data/storyline.json` (read per request)
3. Images → `{projectPath}/assets/{original,scene}-images/` (served as static files)

**Writes**:
- Only to `project-config.json` when user switches projects
- No mutations to storyline.json or images (all read-only)

### State In Memory

- File watchers: `Map<projectName, FileWatcherInstance>`
- Status cache: `Map<projectName, FileStatus>`
- Debounce timers: `Map<projectName, NodeJS.Timeout>`

All ephemeral. Lost on server restart.

**Collector implication**: 
- Storyline: **stateless transformation layer**, rely on external files
- AppySentinel: Likely needs persistent state (logs, metrics, event journal). Consider local SQLite or JSON Lines files for simplicity.

---

## Summary Table: Collector-Shaped Patterns

| Pattern | Present? | Details | Relevant for AppySentinel? |
|---------|----------|---------|---------------------------|
| File watchers | ✅ Yes | Chokidar monitors image directories | ✅ Could use similar for log files, config changes |
| Transcript ingestion | ❌ No | Handled externally by Whisper | ❌ Not a reference |
| External API polling | ❌ No | No YouTube/Wistia integration | ❌ Not a reference |
| Subprocess wrapping | ⚠️ Minimal | Only for port cleanup | ⚠️ Port cleanup trick could be reused |
| Background workers | ⚠️ Limited | Event-driven, not loop-based | ✅ Event-driven approach worth adopting |
| MCP/agent interface | ❌ No | REST + Socket.io only | ❌ AppySentinel should have MCP |
| State snapshots | ❌ No | Current state only, no history | ❌ Not a reference |
| Configuration | ✅ Yes | JSON file + in-memory cache | ✅ Simple pattern, but add validation |
| Storage | ✅ Yes | File-system + RAM caching | ⚠️ Good for simple cases; AppySentinel may need SQLite |

---

## Architecture Observations

### Storyline's Three-Layer Model

1. **External Projects** (sibling directories)
   - Own the data: `storyline.json`, images, configuration
   - Storyline doesn't persist here; it only reads

2. **Server** (Express + Node.js)
   - Stateless: Loads external data, transforms schema versions (V2→V1), serves over HTTP
   - Event hub: File watcher → status sync → Socket.io broadcasts
   - Light state: Project config, watcher map, status cache

3. **Client** (React + Vite)
   - Reads data via REST API
   - Joins WebSocket room for project
   - Receives real-time file change events
   - Displays and curates (no persistence)

### Key Design Principle: "External Data, Not Embedded"

From CONTEXT.md:
> "The app is stateless regarding content — useless without at least one external project configured. If you delete the external project directory, the app has nothing — no cached copy, no database backup."

This is intentional. Decoupling content from the app lets multiple tools operate on the same project files simultaneously.

**Implication for AppySentinel**: 
- If AppySentinel collects data (logs, metrics, events), it should write to a local store (files, SQLite)
- External tools (dashboards, agents) should read that store via an API or MCP interface
- Don't embed the data in the collector; let it flow through to storage

---

## Recommendations: "Collector-Shaped Patterns Storyline Uses That AppySentinel Should Support"

### 1. File System Monitoring (✅ Adopt)

**What Storyline does**: Chokidar watches directories for changes, emits typed events.

**Recommendation for AppySentinel**:
- Use Chokidar (or similar) to watch configured log file locations, transcript directories, or API response caches
- Emit structured events (`file:added`, `file:changed`, etc.)
- Debounce rapid changes (Storyline uses 1-second debounce)
- Lazy-start watchers on demand (Storyline starts when client joins, not on server startup)

### 2. Debounced Status Synchronization (✅ Adopt)

**What Storyline does**: `StatusSyncService` reacts to file changes with debounced recalculation of aggregate state.

**Recommendation for AppySentinel**:
- When a collector gathers new data, debounce the computation of metrics/summaries
- Emit events only when meaningful change is detected
- Cache the previous state for comparison

Example for AppySentinel:
```typescript
// When a log file is updated:
// 1. Debounce for N seconds (e.g., 1s)
// 2. Recompute: { logCount, errorCount, latestTimestamp, ... }
// 3. Compare against cached state
// 4. Emit 'metrics:updated' if different
```

### 3. Event-Driven Architecture (✅ Adopt)

**What Storyline does**: File watcher → Status sync → Socket.io emit. No polling loops.

**Recommendation for AppySentinel**:
- Use EventEmitter or similar for internal communication
- Collectors should trigger events (e.g., `transcription:completed`)
- Listeners (status sync, API endpoints) react to events
- Avoid `setInterval`-based polling in favor of explicit triggers

### 4. Configuration in JSON, Loaded Once (✅ Adopt with Enhancement)

**What Storyline does**: `project-config.json`, read on startup, cached in memory, written only on mutation.

**Recommendation for AppySentinel**:
- Use similar pattern for collector configuration
- **Enhancement**: Add Zod or similar for schema validation
- **Enhancement**: Support hierarchical config (global + instance-specific)
- **Enhancement**: Watch config file for changes and reload (use file watcher pattern from #1)

### 5. Stateless Server, External State Storage (✅ Adopt)

**What Storyline does**: Server doesn't own data; external projects do.

**Recommendation for AppySentinel**:
- Collectors should write telemetry to a local store (file system, SQLite, etc.)
- Sentinel runs as a service that:
  - Reads configuration from JSON
  - Spawns/manages collectors
  - Aggregates data from collectors
  - Exposes data via HTTP / MCP to external tools
  - Does NOT store that data itself; delegates to a backing store

### 6. Project-Scoped Rooms / Isolation (✅ Adopt)

**What Storyline does**: Socket.io rooms (`project:${name}`) isolate events per project.

**Recommendation for AppySentinel**:
- If managing multiple data sources or environments, use similar isolation
- Example: `source:logs`, `source:metrics`, `source:events`
- Allows selective event subscriptions without cross-contamination

### 7. MCP Interface (❌ Storyline Lacks; AppySentinel Needs)

**What Storyline lacks**: No MCP server.

**Recommendation for AppySentinel**:
- Implement MCP server (per architecture-brief)
- Expose tools for local agents to:
  - Query collected data
  - Trigger actions (start/stop collectors, refresh config)
  - Configure behavior
- This is AppySentinel's unique requirement vs. Storyline

### 8. Graceful Shutdown / Resource Cleanup (✅ Adopt)

**What Storyline does**: Handles SIGINT/SIGTERM, closes file watchers, disconnects WebSocket clients.

**Recommendation for AppySentinel**:
- Implement similar shutdown handlers
- Close file watchers, flush buffered data, stop background processes
- 10-second timeout before force-exit

---

## Honest Assessment: Was Storyline Worth Forensic Exploration?

**Verdict**: **No, not for collector design specifically. Useful for understanding data consumption patterns.**

### Why Not Useful for Collectors

1. **Storyline is a consumer, not a producer**. It watches external files but doesn't collect them.
2. **No polling, scraping, or ingestion logic**. Data is pre-processed externally.
3. **No persistence layer**. Collectors need to write data somewhere; Storyline only reads.
4. **No background workers or job queues**. Collectors typically run long-lived loops.
5. **No integration with external services**. Collectors often call APIs, spawn subprocesses, etc.

### Why It Was Worth Checking

1. **Real-time synchronization pattern** (`FileWatcherService` + `StatusSyncService`) is solid and reusable.
2. **Event-driven architecture** is the right mental model for AppySentinel.
3. **Configuration pattern** (JSON file, validated at startup) is simple and effective.
4. **Graceful shutdown** is a good example of infrastructure discipline.
5. **Stateless server principle** aligns with AppySentinel's architecture brief.

### Better Reference for Collectors

Look instead at:
- **Whisper AI integration** (external tool that ingests video, produces JSON) — this is a collector
- **n8n workflows** (mentioned as future integration) — these orchestrate sub-collectors
- **Log ingestion tools** (Filebeat, Fluent Bit) — these are real collectors
- **OpenTelemetry collectors** — reference implementation of AppySentinel's inspiration

### Conclusion

Storyline App taught us how to **consume** and **synchronize** collected data, not how to **collect** it. The patterns are complementary: AppySentinel should produce data that systems like Storyline can consume. Use Storyline as a reference for the "observation of external state changes" and "real-time synchronization" concerns, but don't copy it wholesale for collector responsibilities.

---

**Report Completed**: 2026-04-25  
**Forensic Depth**: Medium (skipped UI, planning docs; focused on backend service architecture)
