# Forensic Exploration: FliHub Collector/Observer Patterns

**Date**: 2026-04-25
**Examined**: `/Users/davidcruwys/dev/ad/flivideo/flihub/`
**Context**: FliHub is NOT primarily a collector/agent, but a web app managing video workflows. However, it contains several "watching and ingestion" patterns relevant to AppySentinel architecture.

---

## 1. File Watchers — Chokidar-Based Observation

### Implementation
FliHub uses **chokidar** for persistent filesystem observation. The `WatcherManager.ts` encapsulates all watcher lifecycle.

**Nine Active Watchers:**

1. **zip** — Downloads folder for thumbnail batch imports
2. **incoming-images** — Incoming image assets source directory
3. **assigned-images** — Project images/ folder
4. **recordings** — Project recordings/ + recording-shadows/
5. **projects** — Parent directory of projects (top-level project creation/deletion)
6. **inbox** — Project inbox/ with 2-level depth (FR-59)
7. **transcripts** — Project recording-transcripts/
8. **thumbs** — Project assets/thumbs/
9. **relay** — Network relay directory (if enabled) with `awaitWriteFinish`

### Key Patterns

**Debouncing**:
- Default 200ms debounce on all events
- Relay watcher: 1000ms (large video files need stability)
- Projects watcher: 500ms (directory creation is slower)
- Configurable per watcher via `debounceMs` parameter

**Event Filtering**:
- Most watchers observe only `add` and `unlink` (file creation/deletion)
- Some watch `change` events (assigned-images, transcripts, thumbs)
- Projects watcher watches `addDir`/`unlinkDir` only (no file-level noise)
- Relay watcher has special handling: `awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 }` to wait for large writes to complete before firing

**Socket.io Emission**:
```typescript
const emitChange = () => {
  const existingTimeout = this.debounceTimeouts.get(config.name);
  if (existingTimeout) clearTimeout(existingTimeout);
  
  const timeout = setTimeout(() => {
    this.io.emit(config.event);
  }, config.debounceMs ?? 200);
  
  this.debounceTimeouts.set(config.name, timeout);
};
```

**Startup Behavior**:
- `ignoreInitial: true` — Existing files do NOT trigger events on startup
- **Pain point**: If a file appears while server is down, the UI won't see it until the user manually refreshes the page. This is a known issue documented in CONTEXT.md as "Silent file drop missed on startup."

**Config-Driven Restart**:
Watchers restart when their parent directories change in config (e.g., `projectDirectory` changes).

```typescript
updateFromConfig(oldConfig: Config | null, newConfig: Config): void {
  if (!oldConfig || oldConfig.projectDirectory !== newConfig.projectDirectory) {
    this.startAssignedImagesWatcher(newConfig.projectDirectory);
    this.startRecordingsWatcher(newConfig.projectDirectory);
    // ... restart all project-scoped watchers
  }
}
```

### Relevance to Sentinel
- **Multiple watch targets** with different event types (add/unlink/change/addDir) and debounce strategies
- **Real-time emission via Socket.io** (not polling)
- **Graceful restart on config change**
- **Pain point**: `ignoreInitial: true` means startup doesn't catch backlog; need explicit "scan on startup" API

---

## 2. Polling Loops & Background Workers

### Transcription Queue (In-Memory Task Queue)

**Pattern**: Serialized job processor with in-memory queue and state.

```typescript
let queue: TranscriptionJob[] = [];
let activeJob: TranscriptionJob | null = null;
let recentJobs: TranscriptionJob[] = []; // Last 5 for status queries
let activeProcess: ChildProcess | null = null;

function processNextJob(): void {
  if (activeJob || queue.length === 0) return;
  
  activeJob = queue.shift()!;
  activeJob.status = 'transcribing';
  activeJob.startedAt = new Date().toISOString();
  
  // Spawn Whisper subprocess...
  activeProcess = spawn(whisperBinary, whisperArgs);
  
  // Stream stdout/stderr to Socket.io clients
  activeProcess.stdout?.on('data', (data) => {
    io.emit('transcription:progress', { jobId: currentJobId, text });
  });
  
  activeProcess.on('close', (code) => {
    // Handle completion, log telemetry, process next job
    activeJob = null;
    processNextJob();
  });
}
```

**Queue API**:
- `POST /api/transcription/queue` — Enqueue a video
- `GET /api/transcription/status` — Get queue + active job status
- `DELETE /api/transcription/{jobId}` — Cancel a job (soft: mark cancelled, hard: kill process)

**No explicit polling loop** — Queue processes on-demand via `processNextJob()` called after job completion.

**Status Checks in Routes** (implicit polling):
- Rename is blocked if transcription is active: `getActiveJob()` / `getQueue()` checks
- UI must poll `/api/transcription/status` to show live progress

### Relay Activity Log (Ring Buffer)

```typescript
const activityLog: RelayActivityEvent[] = [];
const MAX_ACTIVITY = 50;

export function logRelayActivity(event: Omit<RelayActivityEvent, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  activityLog.unshift({ ...event, id });
  if (activityLog.length > MAX_ACTIVITY) activityLog.length = MAX_ACTIVITY;
}
```

Activity log is **in-memory only** — cleared on server restart.
Tracks push/collect/promote events for the relay UI activity feed.

### Sync Hub Git Operations (Async with Per-Repo Locks)

```typescript
const repoLocks = new Map<string, Promise<void>>();

async function withRepoLock<T>(repoDir: string, fn: () => Promise<T>): Promise<T> {
  const existing = repoLocks.get(repoDir);
  let release: () => void;
  const lock = new Promise<void>((resolve) => { release = resolve; });
  
  const run = (existing ?? Promise.resolve()).then(fn).finally(() => {
    if (repoLocks.get(repoDir) === lock) repoLocks.delete(repoDir);
    release!();
  });
  repoLocks.set(repoDir, lock);
  return run;
}
```

**No background polling** — Git operations triggered on-demand via UI requests to `/api/sync/status`, `/api/sync/push`, etc.

### Relevance to Sentinel
- **Queued async operations** with in-memory state tracking
- **Per-operation locks** to prevent race conditions
- **Streaming output** from long-running subprocess to clients
- **Status API** for polling
- **Pain points**:
  - No persistent queue (server restart loses pending jobs)
  - No background scheduler (no "wake up every 5 minutes and scan for new recordings")
  - Activity log is ephemeral

---

## 3. Subprocess Wrapping — External Tool Integration

### MLX Whisper Transcription

```typescript
const whisperBinary = expandPath(config.whisperBinary || '~/.pyenv/shims/mlx_whisper');
const whisperModel = config.whisperModel || 'mlx-community/whisper-large-v3-turbo';
const whisperLanguage = config.whisperLanguage || 'en';

activeProcess = spawn(whisperBinary, whisperArgs);

activeProcess.stdout?.on('data', (data) => {
  const text = data.toString();
  activeJob.streamedText = (activeJob.streamedText || '') + text;
  io.emit('transcription:progress', { jobId: currentJobId, text });
});

activeProcess.stderr?.on('data', (data) => {
  // Whisper outputs progress info to stderr — captured and streamed
  io.emit('transcription:progress', { jobId: currentJobId, text });
});

activeProcess.on('close', (code) => {
  if (code === 0) {
    activeJob.status = 'complete';
    // Log telemetry
  } else {
    activeJob.status = 'error';
  }
});
```

**Configuration**:
- Binary path: `~/.pyenv/shims/mlx_whisper` (version-agnostic shim, not hardcoded path)
- Model: configurable, default `mlx-community/whisper-large-v3-turbo`
- Language: configurable, default `en`
- Initial prompt: optional (uses `config.glingDictionary` if set)

**Output Handling**:
- Spawns Whisper, waits for completion
- Deletes unwanted transcript formats (vtt, tsv) — only keeps txt, srt, json
- Logs telemetry: timing, file size, duration ratio

**Error Handling**:
- Non-zero exit code → status = 'error', shown in UI
- Spawn ENOENT → transcription fails with "Failed to start Whisper" message (documented failure mode)

### FFmpeg/FFprobe for Shadow Files

```typescript
const ffprobe = spawn('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1',
  videoPath,
]);

let stdout = '';
ffprobe.stdout.on('data', (data) => { stdout += data.toString(); });
ffprobe.on('close', (code) => {
  if (code !== 0) resolve(null);
  const duration = parseFloat(stdout.trim());
  resolve(isNaN(duration) ? null : duration);
});
```

Shadow file creation spawns ffmpeg with custom arguments for 240p transcode.

**Arguments**:
- Input video path
- Output height (configurable, default 240p)
- Video codec: libx264, preset: fast, crf: 28
- Audio codec: aac, bitrate: 128k (good enough for Whisper)

### Rsync for Relay Sync

```typescript
const { stdout } = await execFileAsync('rsync', [
  '-av',
  '--delete',
  ...rsyncExcludeArgs(), // .DS_Store, ._*, .gitkeep, etc.
  projectDir + '/',
  destDir + '/',
]);
```

Rsync handles push/collect operations. Excludes list prevents macOS junk files from syncing.

### Relevance to Sentinel
- **Multiple external tools** (Whisper, ffmpeg, ffprobe, rsync, git)
- **Streaming output capture** from long-running processes
- **Telemetry logging** after process completion
- **Version-agnostic shim paths** (e.g., `~/.pyenv/shims/mlx_whisper`)
- **Configurable arguments** per tool
- **Error handling** via exit codes and spawn errors
- **Pain points**:
  - No timeout on Whisper spawn (can hang indefinitely)
  - No output size limits (large stderr could bloat memory)
  - No kill/cleanup on server shutdown

---

## 4. External System Integration — IPC & API Surface

### Local MCP (Model Context Protocol) / API Surface

FliHub exposes an HTTP+Socket.io interface for local tools (Claude, Storyline, etc.) to control it.

**Query Routes** (`/api/query/*`):
- `GET /api/query/projects` — List all projects with stats
- `GET /api/query/projects/{code}` — Get project details
- `GET /api/query/projects/{code}/recordings` — List recordings
- `GET /api/query/projects/{code}/transcripts/text` — Get combined transcript
- `GET /api/query/projects/{code}/images` — List assigned images
- `GET /api/query/projects/{code}/export` — Export manifest

**Mutation Routes** (`/api/*`):
- `POST /api/rename` — Rename a recording
- `POST /api/transcription/queue` — Queue transcription
- `POST /api/relay/push` — Push files to relay
- `POST /api/relay/collect` — Collect files from relay
- `POST /api/manage/batch-rename` — Bulk rename with undo

**System Routes**:
- `POST /api/system/open-finder` — Open folder in Finder
- `GET /api/system/status` — Health check
- `POST /api/storage/hold` — Move project to archive

**Poem WUI Integration** (external workflow):
- `POST /api/poem-wui/send` — Send transcript to POEM intake URL
- Configured URL: `config.poemWuiUrl`

**Socket.io Events** (real-time push):
- `file:new` — New recording detected
- `recordings:changed` — Recording folder changed
- `transcription:started`, `transcription:progress`, `transcription:complete`
- `relay:changed` — Relay folder changed
- `sync:status` — Git sync status updated

### Configuration Source of Truth

Single `server/config.json` file (loaded in-memory, read/written atomically):

```json
{
  "watchDirectory": "~/Movies/Ecamm Live",
  "projectsRootDirectory": "~/dev/video-projects/v-appydave",
  "activeProject": "b17-fallacy",
  "imageSourceDirectory": "~/Downloads",
  "relayEnabled": true,
  "relayDirectory": "~/relay/flihub-appydave",
  "machineRole": "recorder",
  "whisperBinary": "~/.pyenv/shims/mlx_whisper",
  "whisperModel": "mlx-community/whisper-large-v3-turbo",
  "glingDictionary": ["intro", "outro"],
  "projectStageOverrides": { "b17": "ready-to-publish" },
  "pinned": ["b17", "b85"],
  "commonNames": [
    { "name": "intro", "autoSequence": true },
    { "name": "demo" }
  ]
}
```

**Config Push Pattern**: Server updates config.json after mutations (e.g., setting active project). Client calls `/api/query/config` to read current state.

**Pain point**: Config written by server process can race with manual edits. Direct file edits while server is running risk being overwritten.

### Relevance to Sentinel
- **Rich HTTP API** exposing both queries and mutations
- **Real-time Socket.io notifications** for file/state changes
- **Single config file** as source of truth
- **Machine role** concept to branch UI behavior (recorder vs. editor)
- **Extensible configuration** (common names, tags, overrides)
- **External workflow hooks** (Poem WUI intake)

---

## 5. Snapshot/State Collection

### ProjectStats (On-Demand Snapshot)

Query `/api/query/projects/{code}` returns a snapshot of project state:

```typescript
export interface ProjectStats {
  code: string;
  recordingCount: number;
  chapters: number[];
  hasTranscripts: boolean;
  transcriptPercentage: number; // 0-100
  hasImages: boolean;
  imageCount: number;
  thumbCount: number;
  shadowCount: number;
  hasFinal: boolean;
  stage: ProjectStage;
  lastModified: string; // ISO
  health: string; // sentence from getHealthAssessment()
}
```

**Computed on-demand**: Scans filesystem each time API is called. No caching.

### Per-Project State File (`.flihub-state.json`)

```typescript
export interface ProjectState {
  version: 1;
  recordings: {
    [filename: string]: {
      safe?: boolean; // Protected from rename/delete
      parked?: boolean; // Set aside for later
      annotation?: string; // User notes
    };
  };
}
```

Persisted alongside each project for per-recording metadata (safe/parked flags, annotations). Written atomically on mutation.

### Transcription Telemetry (`transcription-telemetry.jsonl`)

JSONL file (append-only) in `server/` directory:

```typescript
export interface TranscriptionLogEntry {
  startTimestamp: string;
  endTimestamp: string;
  project: string;
  filename: string;
  path: string;
  videoDurationSec: number;
  transcriptionDurationSec: number;
  ratio: number;
  fileSizeBytes: number;
  model: string;
  success: boolean;
}
```

Logged after each transcription completes. Used for analytics and duration prediction.

### Storage Activity Log (`~/.flihub/storage-activity.jsonl`)

Global JSONL file (not per-project) tracking push/collect/hold/archive operations:

```typescript
export interface StorageActivityEntry {
  timestamp: string;
  projectCode: string;
  action: 'push' | 'collect' | 'hold' | 'archive' | 'release' | 'promote';
  sizeBytes: number;
  sourceLocation?: string;
  destLocation?: string;
}
```

**Why global?** Archived projects have no local folder; per-project state wouldn't survive. Global log with projectCode field works across all three storage states (active/held/archived).

**Append-only**: One line per entry, crash-tolerant. Read failures do NOT block mutations.

### Relay Activity Log (In-Memory Ring Buffer)

Last 50 relay sync events (push/collect/promote). Lost on server restart.

### Relevance to Sentinel
- **On-demand filesystem scanning** for current state
- **JSONL append-only logs** for immutable event trails
- **Per-project sidecar files** for local state
- **Global telemetry/activity logs** for cross-project analytics
- **No database** — all state is files or in-memory

---

## 6. Configuration Patterns

### Three-Tier Configuration

1. **Default values** in `configManager.ts`:
   ```typescript
   export function getDefaultConfig(): Config {
     return {
       watchDirectory: '~/Movies/Ecamm Live/',
       projectsRootDirectory: '~/dev/video-projects/v-appydave',
       activeProject: '',
       fileExtensions: ['.mov'],
       commonNames: [ { name: 'intro', autoSequence: true } ],
     };
   }
   ```

2. **Environment variables** (fallback):
   ```typescript
   watchDirectory: process.env.WATCH_DIR || '~/Movies/Ecamm Live/',
   imageSourceDirectory: process.env.IMAGE_SOURCE_DIR || '~/Downloads',
   ```

3. **File-based config** (`server/config.json`):
   - Loaded on startup
   - Mutations write back to file
   - Auto-migrations for schema changes

### Config Migrations

FliHub performs automatic migrations when loading config:

```typescript
// NFR-6: Migrate old targetDirectory to projectDirectory
if (saved.targetDirectory && !saved.projectDirectory) {
  saved.projectDirectory = migrateTargetToProject(saved.targetDirectory);
  delete saved.targetDirectory;
  needsSave = true;
}

// FR-89: Migrate old projectDirectory to projectsRootDirectory + activeProject
if (saved.projectDirectory && !saved.projectsRootDirectory) {
  saved.projectsRootDirectory = path.dirname(saved.projectDirectory);
  saved.activeProject = path.basename(saved.projectDirectory);
  delete saved.projectDirectory;
  needsSave = true;
}
```

**Pain point**: Schema changes accumulate over time. Old overrides in `projectStageOverrides` are never pruned.

### Watch Target Configuration

Multiple paths can be watched, configured independently:

- `watchDirectory` — Ecamm Live recording input (typically `~/Movies/Ecamm Live/`)
- `projectsRootDirectory` — Root of all video projects
- `imageSourceDirectory` — Incoming image assets (typically `~/Downloads`)
- `relayDirectory` — Network relay folder (optional, per-machine)

Each is watched by a dedicated chokidar watcher that restarts if its path changes in config.

### Disk Thresholds (Observability Config)

```typescript
export const DEFAULT_DISK_THRESHOLDS: DiskThresholds = {
  stagePenaltyMultiplier: 0.5,
  columns: {
    trash: { faint: '0', amber: '300MB', red: '1GB' },
    rec: { faint: '2GB', amber: '5GB', red: '10GB' },
    shadows: { faint: '100MB', amber: '300MB', red: '500MB' },
    // ... more columns
  }
};
```

Threshold tiers (faint/amber/red) for disk usage dashboard. Allows fine-grained alerting without hardcoding thresholds in code.

### Relevance to Sentinel
- **Hierarchical config** (defaults → env → file)
- **Auto-migration** for schema evolution
- **Watch targets** as independent config entries
- **Observable thresholds** as config (not hardcoded)

---

## 7. Storage & Local State Management

### File-Based Storage (No Database)

FliHub is **stateless about recordings**. The filesystem IS the database.

**Naming convention is the sole metadata store**:
- Filename: `{chapter}-{sequence}-{name}-{tags}.mov`
- Parsing is strict on creation, lenient on reading (backward compat)
- No SQLite, no JSON metadata per file — files are portable

**Project structure is filesystem hierarchy**:
- `recordings/` → active recordings
- `recording-shadows/` → lightweight previews
- `recording-transcripts/` → Whisper output
- `assets/images/` → assigned image assets
- `final/` → edited videos ready to publish
- `s3-staging/` → files for S3 export

**State Files** (sidecar):
- `.flihub-state.json` — per-project (safe/parked/annotation flags)
- `transcription-telemetry.jsonl` — global (timing data)
- `storage-activity.jsonl` — global (push/collect history)

### JSONL (JSON Lines) Format

Append-only, crash-tolerant log format. One JSON object per line.

```
{"timestamp":"2026-04-25T10:00:00Z","project":"b17","action":"push","sizeBytes":5368709120}
{"timestamp":"2026-04-25T10:05:00Z","project":"b85","action":"collect","sizeBytes":2684354560}
```

**Advantages**:
- Efficient append (no rewrite)
- Streaming read (one line at a time)
- Partial failures don't corrupt entire file
- Human-readable (cat, grep, etc.)

**Disadvantages**:
- No transactionality (multi-line updates not atomic)
- No query engine (must read entire file to filter)

### Path Expansion

All paths support `~` expansion:

```typescript
export function expandPath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return inputPath;
}
```

### Project Path Structure

`shared/paths.ts` defines canonical project structure:

```typescript
export function getProjectPaths(projectDir: string) {
  return {
    recordings: path.join(projectDir, 'recordings'),
    shadows: path.join(projectDir, 'recording-shadows'),
    transcripts: path.join(projectDir, 'recording-transcripts'),
    images: path.join(projectDir, 'assets', 'images'),
    thumbs: path.join(projectDir, 'assets', 'thumbs'),
    inbox: path.join(projectDir, 'inbox'),
    final: path.join(projectDir, 'final'),
    s3Staging: path.join(projectDir, 's3-staging'),
    stateFile: path.join(projectDir, '.flihub-state.json'),
  };
}
```

### Relevance to Sentinel
- **Filesystem as database** (no external dependencies)
- **Naming conventions** encode metadata (portable, inspectable)
- **Sidecar files** for per-item state
- **JSONL logs** for immutable event trails
- **Path expansion** for home-relative configuration
- **Canonical path structure** enforced by shared utilities

---

## 8. Machine Role & Collaboration

### Machine Role (Concept)

Every FliHub instance is configured as:
- `recorder` (legacy: `creator`) — records video, names files, queues transcription, pushes to relay
- `editor` — collects from relay, edits, pushes edit files back

Role is set in `server/config.json`:

```json
{
  "machineRole": "recorder"
}
```

**Default**: If absent, defaults to `recorder`.

### UI Branching by Role

Rather than one UI with conditional visibility, FliHub treats role as a first-class architectural concept:

- Recorder sees: Incoming, Recordings, Projects, Transcriptions, Assets, Relay Push
- Editor sees: Projects, Relay Collect, Shadow Preview, Edit Delivery

This is more explicit than permission-based visibility.

### Relay Collaboration

Network-based file sync for moving recordings and edits between machines.

**Workflow**:
1. Recorder pushes recordings to `~/relay/flihub-appydave/projectCode/recordings/`
2. Editor collects to local `projectCode/recordings/`
3. Editor pushes edits to `~/relay/flihub-appydave/projectCode/edit-1st/` or `edit-2nd/`
4. Recorder collects edits to local `projectCode/final/`

**Sync Status**:
- `synced` — relay and local file counts match
- `ahead` — local has more files (not yet pushed)
- `behind` — relay has more files (not yet collected)
- `diverged` — both sides have changed (conflict, no auto-resolution)
- `local-only` — files exist locally but not in relay
- `relay-only` — files exist in relay but not locally

**No merge conflict resolution** for relay (only for git). Divergence requires manual intervention.

### Relevance to Sentinel
- **Multi-instance coordination** via relay (file-based handoff)
- **Machine role** as architectural concept (not UI permission)
- **Sync status** computation (file count comparison, not hash)
- **No auto-merge** — humans resolve conflicts

---

## 9. Configuration & Deployment

### Startup Sequence

1. **Load config** from `server/config.json` (with fallbacks to env vars and defaults)
2. **Initialize Socket.io** server
3. **Mount all routes** (transcription, relay, sync, etc.)
4. **Start WatcherManager** (initialize all chokidar watchers)
5. **Port cleanup** (kill any orphaned process using port 5101)
6. **Listen on port 5101**

### Persistent Launch

Two options in `CLAUDE.md`:

1. **Overmind** (preferred):
   ```bash
   ./start.sh  # Builds shared, checks ports, launches via Overmind
   ```

2. **Manual dev**:
   ```bash
   npm run dev  # Concurrently runs server + client
   ```

**Port checks**: Before starting, verify port 5101 is free:
```bash
lsof -i :5101 | grep LISTEN
```

### Cross-Machine Setup

FliHub instances are configured independently. Each machine has its own `server/config.json`:

- **Recorder machine** (`mac-mini-m4.local`):
  - `machineRole: "recorder"`
  - `watchDirectory: "~/Movies/Ecamm Live/"`
  - `relayDirectory: "~/relay/flihub-appydave"`
  - `relayEnabled: true`

- **Editor machine** (`mac-mini-jan` or `mac-mini-mary`):
  - `machineRole: "editor"`
  - `relayDirectory: "~/relay/flihub-appydave"` (same shared path)
  - `relayEnabled: true`
  - No `watchDirectory`

**Tailscale caveat**: Philippines machines (`mac-mini-jan`, `mac-mini-mary`) are Tailscale-only; `.local` hostnames won't resolve.

### Relevance to Sentinel
- **Config-driven startup** with defaults/env fallback
- **Port cleanup** for graceful restart
- **Multi-instance coordination** via shared relay path

---

## 10. Pain Points & Lessons from FliHub

### Known Failure Modes

1. **Silent file drop on startup**
   - If Ecamm drops a file while FliHub is down, the UI won't see it until refresh
   - **Reason**: `ignoreInitial: true` skips startup file discovery
   - **Workaround**: Manually reload the Incoming page to trigger API scan

2. **Config drift accumulates**
   - `projectStageOverrides` in config grows over time
   - Stale overrides mask filesystem heuristics
   - Never auto-pruned
   - **Fix**: Manual inspection and cleanup via Config panel

3. **Rename blocked during transcription**
   - If transcription is active/queued for a recording, rename fails
   - No progress indicator for when block will lift
   - **Workaround**: Check Transcriptions tab, wait for completion, retry

4. **Relay diverged with no resolution**
   - rsync-based relay (not git) has no merge capability
   - `diverged` status requires manual intervention
   - **Workaround**: Decide which side wins, delete from loser, re-sync

5. **Sync Hub stale on network failure**
   - `git fetch --quiet` swallows errors, continues with cached state
   - No error indicator when network is down
   - **Workaround**: Check network; next successful fetch updates state

6. **Transcription spawn ENOENT**
   - If `~/.pyenv/shims/mlx_whisper` is not found, all jobs error
   - Must use shim path, not version-specific hardcoded path
   - **Fix**: Verify mlx_whisper is installed (`which mlx_whisper`)

7. **Batch undo is single-shot**
   - `/api/manage/batch-rename` stores `lastBatchMapping` in-memory
   - Only the most recent operation can be undone
   - Server restart clears it entirely
   - **Workaround**: Use git to recover from catastrophic renames

8. **Copy Transcript silent empty**
   - `/api/query/projects/{code}/transcript/text` returns empty body if no transcripts
   - Function shows error toast but doesn't throw
   - **Fix**: Check Transcriptions tab to ensure `.txt` files exist

### Design Decisions Worth Noting

1. **Filename as sole metadata** — Makes files portable; inspection tool-agnostic
2. **No database** — Avoids migrations, schema bloat, external dependencies
3. **Machine role as architectural concept** — Cleaner than permission-based visibility
4. **Relay as file-based handoff** — Simpler than SFTP/S3; uses existing local mount
5. **JSONL logs** — Append-only, crash-tolerant, human-readable
6. **Per-repo git locks** — Prevents concurrent git operation race conditions
7. **Feature references in code (FR-xxx)** — Creates bidirectional spec ↔ code linking

---

## 11. Recommendations for AppySentinel

### Collector-Shaped Patterns FliHub Uses That Sentinel Should Support

#### 1. Debounced Filesystem Watching
- Multiple watch targets, each with configurable debounce (100ms–1000ms range)
- Event filtering (add/unlink/change/addDir/etc.)
- Graceful restart on config change
- Real-time event emission via Socket.io

**Sentinel Application**: Watch for log files, config changes, external tool output. Debounce prevents flooding central system.

#### 2. Queued Long-Running Processes
- In-memory queue with active job + recent history
- Serialized processing (one job at a time)
- Streaming output capture (stdout/stderr)
- Telemetry logging after completion

**Sentinel Application**: Queue API scans, transcription tasks, S3 uploads. Log timing/success for telemetry.

#### 3. Per-Repo/Per-Resource Locks
- Prevent concurrent operations on same resource
- Clean error messages (not git's unhelpful lockfile errors)

**Sentinel Application**: Prevent two collectors from writing to same log file or config simultaneously.

#### 4. On-Demand Snapshots
- Compute system state when requested (filesystem scan)
- No persistent cache (always fresh, no stale reads)
- JSONL logs for immutable event trails

**Sentinel Application**: `/api/system/snapshot` returns current disk usage, process list, file inventory. Push logs to central system.

#### 5. Configuration Hierarchy
- Defaults in code
- Env var overrides
- File-based config (single source of truth)
- Auto-migration for schema changes
- Restart watchers when config changes

**Sentinel Application**: `watchTargets`, `thresholds`, `pushInterval`, `centralSystemUrl` all configurable via `~/.sentinel/config.json`.

#### 6. Machine Role Concept
- Different instances have different capabilities (recorder vs. editor)
- Role determines which routes/features are exposed
- Configured at startup, not dynamically

**Sentinel Application**: `collector` vs. `aggregator` roles; different APIs for each.

#### 7. Subprocess Wrapping with Version-Agnostic Paths
- Use `~/.pyenv/shims/tool_name` instead of hardcoded `/opt/tool_name`
- Configurable binary path, model, language
- Timeout + kill on server shutdown

**Sentinel Application**: Spawn external tools (ffmpeg, ffprobe, custom scripts) for data extraction.

#### 8. JSONL Append-Only Logs
- One entry per line, crash-tolerant
- Can be streamed (no full-file parse needed)
- Survives partial failures
- No database dependency

**Sentinel Application**: Telemetry logs, activity trails, push history — all immutable.

#### 9. MCP / Local API Surface
- HTTP query endpoints (`/api/query/*`)
- HTTP mutation endpoints (`/api/*`)
- Socket.io real-time events
- Config-driven behavior

**Sentinel Application**: Claude or local dashboards can query state, trigger scans, configure behavior.

#### 10. Multi-Instance Coordination via Relay
- File-based handoff (rsync to shared directory)
- Sync status computation (file count comparison)
- Divergence detection (both sides changed)
- No auto-merge (humans decide)

**Sentinel Application**: If multiple collectors exist, relay captures push to central system or intermediate staging area.

---

### Implementation Priorities for AppySentinel

**High Priority** (directly applicable):
1. Debounced filesystem watchers + Socket.io emission
2. Queued async operations (in-memory queue + job state)
3. JSONL telemetry/activity logs
4. Configuration hierarchy with auto-migration
5. `/api/query/` and `/api/` route structure

**Medium Priority** (useful patterns):
6. Machine role + UI branching
7. Per-resource locks for concurrent safety
8. Subprocess wrapping with configurable paths
9. On-demand filesystem snapshots
10. Port cleanup on startup

**Low Priority** (nice to have):
11. Relay (file-based inter-instance sync)
12. Git integration (for code/config versioning)
13. MLX Whisper integration (audio transcription)

---

### Pain Points FliHub Hit (Avoid in Sentinel)

1. **Startup discovery**: Don't use `ignoreInitial: true`. Optionally scan on startup or via explicit API.
2. **Queued jobs**: Make the queue persistent (SQLite or JSONL), not in-memory. Server restart shouldn't lose work.
3. **Config drift**: Auto-prune stale overrides or provide admin API to inspect/clean.
4. **No polling loop**: FliHub has no background scheduler. Sentinel should have `setInterval` or cron for periodic work (health checks, cleanup, push).
5. **Subprocess timeout**: Always set timeout on spawned processes. Don't let hung processes block the queue.
6. **Error context**: When a subprocess fails, log the full command + args + exit code + stderr. FliHub's "spawn ENOENT" is opaque.
7. **Activity log ephemeral**: Store activity somewhere durable, not just in-memory ring buffer.
8. **Config race on write**: Ensure atomic writes (write-to-temp, rename). Warn on simultaneous edits.

---

## Summary

**FliHub is NOT a collector**, but it contains several "watching and ingestion" patterns that are highly relevant to AppySentinel:

1. **Filesystem observation** via debounced chokidar watchers
2. **Long-running subprocess execution** with streaming output and telemetry
3. **In-memory queuing** of async operations
4. **Configuration-driven behavior** with auto-migration
5. **JSONL append-only logs** for immutable state trails
6. **Multi-instance coordination** via relay (file-based handoff)
7. **MCP-style API surface** (HTTP query + mutation + WebSocket events)
8. **Per-resource locks** for concurrent safety

The codebase is pragmatic, avoiding databases and external dependencies where possible. Configuration is file-based, paths are home-relative and expandable, and most state is persisted as plaintext (JSON, JSONL, or even filenames).

**Key takeaway**: A "Sentinel" collector should look a lot like FliHub's backend — multiple watchers, queued jobs, streaming subprocess output, JSONL logs, and a local API surface. The main difference is that Sentinel's goal is to **observe and push telemetry upstream**, whereas FliHub's goal is to **manage a video workflow**.

