# AppyStack Install/Scaffold/Configure Deep Dive

**Document**: AppySentinel Installation Architecture Study  
**Date**: 2026-04-25  
**Focus**: How AppyStack's static CLI + Claude skills hybrid works; what's painful; what could be agentic instead  
**Audience**: Architects deciding how AppySentinel should scaffold and configure itself

---

## Executive Summary

AppyStack uses a **hybrid static-CLI-plus-skills** model:

1. **Static install CLI** (`create-appystack`) — one-time setup via simple string replacement. Fast, deterministic, auditable. Prompts for name/scope/ports, copies template, does 20+ targeted string replacements, runs `npm install` and `git init`.

2. **Static upgrade CLI** (`appystack-upgrade`) — pulls template improvements into existing projects via a four-tier file classification system (`auto`/`recipe`/`never`/`owned`). Safe but laborious to maintain.

3. **Claude skills** bundled in the template — recipes, app-idea, mochaccino. These provide the "smart" part: they read the project structure, ask smart questions, and generate contextual code.

**The friction**: 
- Static CLI can't handle flexible configuration or adaptive responses
- String replacement is fragile (hardcoded placeholder lists, easy to miss a field)
- Recipes are written as "capability descriptions" rather than code generators, requiring developer interpretation
- Port conflict checking, environment setup, and error recovery are minimal
- No self-healing or smart retry logic

**The appeal**:
- Minimal dependencies (just @clack/prompts + fs/path/child_process)
- Fully auditable (no magic, everything is string replacement)
- Reproducible (same input → same output)
- Production-tested across 4 apps

---

## Part 1: The Static Install CLI (`create-appystack`)

### What It Does: Step-by-Step

Located in `/create-appystack/bin/index.js` (502 lines).

#### 1. Argument Parsing
Accepts named arguments OR interactive prompts. Examples:
```bash
npx create-appystack@latest my-app
npx create-appystack@latest my-app --scope @myorg --port 5500 --description "My app"
```

Flags: `--scope`, `--port`, `--server-port`, `--description`, `--github-org`, `--public`, `--no-github`, `--yes`

Code pattern: Simple flag/value pairs. No validation is done here; validation happens during prompting.

#### 2. Interactive Prompts (via @clack/prompts)

Runs in sequence if flags not provided:

1. **Project Name** — validates lowercase/numbers/hyphens only
2. **Package Scope** — must start with `@`, validate `@[a-z0-9-]+`
3. **Client Port** — checks if port is in use (via `createConnection` on 127.0.0.1)
4. **Server Port** — defaults to client+1; also checks if in use
5. **Description** — free text, one-liner
6. **GitHub org** (if gh CLI available) — optional; enables repo creation
7. **Visibility** — private or public (only if GitHub org specified)

Each prompt can be skipped with `--yes` flag (auto-accepts all defaults).

#### 3. Summary & Confirmation

Displays a summary table showing:
- Project name, mode (create new or merge), scope, ports
- GitHub org/visibility
- Port-in-use warnings (if any)
- Target directory

In merge mode (target dir exists), shows a file audit.

#### 4. Copy Template

```javascript
cpSync(TEMPLATE_DIR, targetDir, { 
  recursive: true, 
  filter: templateFilter, 
  force: !mergeMode 
});
```

- Excludes: `node_modules`, `dist`, `coverage`, `test-results`, `.git`
- In merge mode: keeps existing files; in create mode: overwrites
- The template is at `/create-appystack/template/` (synced from root template before publish)

#### 5. String Replacement (applyCustomizations)

This is the core of the install. For each file type, it applies hardcoded search-and-replace:

**Target files:**
- `package.json` (root, shared, server, client) — replace scope and root name
- `.env.example` — replace `PORT=5501` and `CLIENT_URL=http://localhost:5500`
- `server/src/config/env.ts` — replace Zod schema defaults (PORT, CLIENT_URL)
- `client/vite.config.ts` — replace port in proxy config
- `client/index.html` — replace `<title>` tag
- `README.md` — replace 6+ references to ports and app name
- All `.ts`/`.tsx` files in source tree — walk and replace scope imports

**The pattern:**
```javascript
function replaceAll(content, from, to) {
  return content.split(from).join(to);
}
```

Simple. No regex. Zero dependencies. Easy to audit.

**What's replaced:**

| From | To | File(s) |
|------|-----|---------|
| `@appystack-template` | user scope (e.g. `@myorg`) | All package.json + .ts/.tsx |
| `@appydave/appystack-template` | `{scope}/{name}` | Root package.json |
| `'RVETS stack boilerplate...'` | User description | Root package.json |
| `5501` (server port) | User server port | .env.example, env.ts, vite.config.ts, README |
| `5500` (client port) | User client port | .env.example, vite.config.ts, README |
| `'AppyStack Template'` | User app name | client/index.html |
| `'# [App Name]'` | User app name | README.md |

**Pain points (from CONTEXT.md):**

1. **Missing replacements**: `VITE_SOCKET_URL=http://localhost:5501` in `.env.example` is NOT replaced. Every scaffolded app with non-default ports has the wrong socket URL hardcoded. Socket.io silently fails to connect → UI stuck on "Loading..." (open bug).

2. **Placeholder fragility**: If the template changes the wording (e.g., "AppyStack Template" → "AppyStack Boilerplate"), the CLI's hardcoded string breaks silently (no error, just doesn't replace).

3. **Merge mode audit warnings**: In merge mode, pre-existing files like `package.json` are kept, so port/scope substitutions miss them. The audit warns but doesn't block. Developers may miss the warning.

#### 6. npm install

```javascript
execSync('npm install', { cwd: targetDir, stdio: 'pipe' });
```

Runs synchronously. Errors are caught and reported but don't fail the scaffold (dev is warned to run it manually).

#### 7. Git Init + First Commit

```javascript
const gitCmd = gitAlreadyExists
  ? `git add -A && git commit -m "chore: scaffold appystack into existing project"`
  : `git init && git add -A && git commit -m "chore: initial scaffold from create-appystack"`;
const gitResult = tryExec(gitCmd, { cwd: targetDir, shell: true });
```

**Issue**: Even when `git commit` succeeds, `gitResult.ok` is sometimes falsely `false`. This prevents `appystack.json` from being written, breaking the upgrade baseline (open bug).

#### 8. Write appystack.json

**Baseline metadata for future upgrades:**
```json
{
  "version": "0.4.12",
  "scaffoldCommit": "abc1234...",
  "lastUpgrade": null,
  "templatePath": null
}
```

Used by `npx appystack-upgrade` to detect which template version was used at scaffold time.

**Only written if git succeeds** (due to the bug above).

#### 9. GitHub Repo Creation (Optional)

If GitHub org specified and git succeeded:
```bash
gh repo create {org}/{name} --{private|public} --source=. --remote=origin --push
```

Requires `gh` CLI. Skipped gracefully if not available.

#### 10. Outro & Next Steps

Displays final summary with:
- Next steps: `cd my-app && npm run dev`
- Port references
- GitHub URL (if created)
- Tips: delete demo/, run `/recipe readme`, use recipes

---

### What's Hard-Coded vs Parameterised

| Aspect | Hard-Coded | Parameterised |
|--------|----------|----------------|
| Template location | `../template` (relative to bin/) | Can't override without editing |
| Placeholder strings | Fixed list in applyCustomizations | Can't add new replacements |
| Port range | Any valid 1–65535 | User chooses |
| Excluded dirs in copy | `node_modules`, `dist`, `coverage`, `test-results`, `.git` | Can't customize |
| Git commit messages | Two fixed messages (new vs merge) | Can't override |
| Interactive prompts | @clack/prompts UI | Only prompt order is fixed |
| Merge mode behaviour | Force:false (keeps existing files) | Can't force overwrite in merge |

---

### String Replacement: Failure Modes

**What can go wrong:**

1. **Substring collisions**: If a placeholder string appears in multiple contexts, all are replaced. Example: if the description was "Template for apps", and the code searches for "Template", it hits both the description AND the title string.

2. **New template fields**: If a new `.ts` file is added to the template with a hardcoded port, the CLI won't know to replace it. Silent failure — no error.

3. **Placeholder regex sensitivity**: Using `.split().join()` means only exact-match strings are replaced. A newline or extra space breaks it.

4. **Merge mode substitution gaps**: Pre-existing files are kept, so they miss substitutions. The audit warns about "key template files" (package.json, .env.example, vite.config.ts) but the developer must manually fix them.

5. **File encoding issues**: If a file is binary or has unusual encoding, `readFileSync(..., 'utf-8')` may corrupt it or throw. No error handling.

---

## Part 2: The Upgrade CLI (`appystack-upgrade`)

Located in `/create-appystack/bin/upgrade.js` (187 lines) + supporting lib files.

### Core Idea: Four-Tier File Classification

Every template file is categorized as one of:
- **`auto`** — safe to overwrite silently (CI config, middleware, generic skills)
- **`recipe`** — skill files; show diff and prompt before merge
- **`never`** — developer owns; never touch (app code, package.json, env files)
- **`owned`** — project-specific; file exists and is identical to template (skip)

### Classification Rules (from `classify.js`)

```javascript
export const CLASSIFICATION = {
  auto: [
    'server/src/middleware/errorHandler.ts',
    'server/src/middleware/rateLimiter.ts',
    '...20 more files...',
    '.github/workflows/ci.yml',
    'Procfile',
    'scripts/start.sh',
  ],
  neverPatterns: [
    { type: 'basename', values: ['package.json', '.env', '.env.example', 'README.md'] },
    { type: 'prefix', values: ['shared/src/', 'client/src/pages/', 'client/src/demo/'] },
    { type: 'exact', values: ['server/src/index.ts', 'client/src/App.tsx', '...etc...'] },
    { type: 'suffix', values: ['.json'] },  // catches tsconfig*.json
  ],
  recipePrefix: '.claude/skills/recipe/',
};
```

The logic:
1. If path starts with `.claude/skills/recipe/` → `recipe`
2. If path is in the `auto` list → `auto`
3. If basename matches a never-pattern → `never`
4. If path matches a never-exact → `never`
5. If path matches a never-prefix → `never`
6. If filename is `tsconfig*.json` or `vitest.config.*` → `never`
7. Default → `never` (unknown files are presumed developer-owned)

### Upgrade Workflow

#### 1. Detect Scaffold Info

Checks (in order):
1. Is there an `appystack.json`? → Use `version` and `scaffoldCommit`
2. Scan git log for scaffold commit message → Infer version as 0.3.0
3. Neither found? → Prompt user for baseline version

#### 2. Walk Template Files

Uses `walkTemplateFiles()` to enumerate all files in the template (excluding node_modules, dist, .git, .DS_Store). Returns sorted array of relative paths.

#### 3. Classify Each File

For each file, determine its tier. Then:

**If `auto`:**
- Check if file exists in consumer app
  - If not → add it
  - If exists and unchanged since scaffold → overwrite silently (safe)
  - If exists and changed since scaffold → show git diff and prompt (use `isFileChangedSinceScaffold`)
  - If no scaffold baseline → compare content directly; if identical skip; if different prompt
- Actions: `'added'` | `'updated'` | `'skipped'` | `'todo'`

**If `recipe`:**
- File is a skill file; always prompt before merging (developer may have customized skills)
- Show diff, let developer choose: accept, skip, or defer

**If `never`:**
- Skip silently; add to `'owned'` tally

#### 4. Generate Summary

Tallies results by action and displays:
```
✔ Added   : 3 files
✔ Updated : 8 files
⚠ Todo    : 1 file (see UPGRADE_TODO.md)
— Skipped : 5 files
— Owned   : 42 files
```

Files requiring manual attention are written to `UPGRADE_TODO.md`.

#### 5. Update appystack.json

Writes `lastUpgrade: YYYY-MM-DD` to mark when the upgrade ran.

### Diff & Merge Logic (from `diff.js`)

**For auto files:**

```javascript
export async function handleAutoFile(consumerDir, templateDir, scaffoldCommit, relativePath, prompts) {
  // 1. File doesn't exist → just add it
  if (!existsSync(destPath)) {
    applyUpdate(consumerDir, templateDir, relativePath);
    return { action: 'added', path: relativePath };
  }

  // 2. No scaffold baseline → compare content
  if (!scaffoldCommit) {
    const consumerContent = readFileSync(destPath, 'utf-8');
    const templateContent = readFileSync(srcPath, 'utf-8');
    if (consumerContent === templateContent) {
      return { action: 'identical', path: relativePath };
    }
    // Different → show diff and prompt
    const diffLines = buildContentDiff(templateContent, consumerContent);
    note(diffLines || '(no differences detected)', `Template vs current: ${relativePath}`);
    return promptForMerge(relativePath, consumerDir, templateDir, prompts);
  }

  // 3. Has scaffold baseline → check if consumer changed since scaffold
  if (!isFileChangedSinceScaffold(consumerDir, scaffoldCommit, relativePath)) {
    // Unchanged → safe overwrite
    applyUpdate(consumerDir, templateDir, relativePath);
    return { action: 'updated', path: relativePath };
  }

  // 4. File modified since scaffold → show git diff and prompt
  let diffOutput = execSync(`git diff ${scaffoldCommit} -- ${relativePath}`, {...})
  note(diffOutput || '(no diff output)', `Modified since scaffold: ${relativePath}`);
  return promptForMerge(relativePath, consumerDir, templateDir, prompts);
}
```

**For recipe files:**

Uses `handleRecipeFile()` which also shows diffs and prompts.

**Non-interactive mode (`--yes`):**

Uses `buildAutoPrompts()` which auto-selects `'skip'` for any prompt (safest default).

---

### Upgrade Pain Points

1. **No automatic conflict resolution** — Recipe files always prompt, even if changes are minor. Large projects with many recipes get noisy.

2. **File classification is static** — Hard to add new `auto` files without CLI version bump. If a new middleware file is added to the template, old CLI versions won't auto-apply it.

3. **Diff output is truncated** — Shows first 50 lines only. For large files, critical changes may be hidden.

4. **No merge strategy** — If file is changed both in template and in consumer, there's no three-way merge. It's "keep mine" or "take theirs" only.

5. **Manual fixup required** — `UPGRADE_TODO.md` lists files that need attention, but gives no guidance on *how* to merge them. Developer has to read diffs and apply changes manually.

6. **Recipe files can't self-validate** — A recipe file might have drift in naming conventions or file paths that the CLI doesn't detect.

---

## Part 3: The "Smart" Layer — Claude Skills

Three skills ship inside the template at `.claude/skills/`:

### 1. Recipe Skill

**Location**: `.claude/skills/recipe/SKILL.md` (132 lines)

**Purpose**: Generate specific architectural patterns (nav-shell, file-crud, entity-socket-crud, etc.) based on project context.

**Architecture**:
- `SKILL.md` — Index of recipes, flow instructions, availability table
- `references/` — One `.md` per recipe (nav-shell.md, file-crud.md, etc.)
- `domains/` — Pre-built entity definitions (care-provider-operations, youtube-launch-optimizer)

**Key design decision**: Recipes are written as **capability descriptions**, NOT code generators.

Example from `file-crud.md`:
> "Multiple entities stored as individual JSON files on the server filesystem. Socket.IO bridges client actions to the filesystem and broadcasts changes back to all connected clients in real time."

Then it describes the folder structure, contracts, and patterns — but doesn't include copy-paste code. The developer (or Claude) must read the spec and interpret how to apply it to their project.

**Why this design?** (From commit `e41fcad`, Mar 28 2026):
> "Audit found 7 recipes (score 3-5) that contained full copy-paste implementations instead of AI-adaptable capability descriptions... Recipes now describe what to build, not how it looks."

The shift happened because:
- Full code examples were too specific (hardcoded hex values, library names, component names)
- Developers copy-pasted without adapting to their project
- Claude had to fight against boilerplate instead of using it as inspiration

**Recipe flow:**
1. Identify intent: "I want to build a CRUD app"
2. Present recipes table; developer chooses
3. Load the reference file (e.g., `file-crud.md`)
4. Collect context: "What entities? What are the fields? What's the namish field?"
5. Generate concrete prompt with real file paths and field names
6. Show summary: "Here's what I'll build..."
7. Wait for confirmation before scaffolding

**Composable recipes:**
- `nav-shell` + `file-crud` = complete CRUD app with UI + data layer
- `file-crud` + `api-endpoints` = local data + external REST API
- `add-auth` + any app = adds JWT auth
- `add-orm` replaces `file-crud` (migrates from JSON to Prisma/Drizzle)

---

### 2. App-Idea Skill

**Location**: `.claude/skills/app-idea/SKILL.md` (100 lines)

**Purpose**: Feature intake queue. Capture ideas, triage (accept/defer/reject), track to completion.

**Architecture**:
- `app-idea/index.json` — machine-readable state (items array with status/type/appetite)
- `app-idea/NNN.md` — human-readable content (one file per idea)

**Commands**:
- `capture` — zero-friction intake (ask "what's the idea?", create NNN.md, append to index)
- `triage` — walk open items, decide accept/defer/reject with reasoning
- `status` — dashboard showing counts by state
- `close` — mark in-progress items as done

**Flow**:
1. Angela/stakeholder says "I have an idea"
2. Claude asks: "What is it?" (accept long text, screenshots, whatever)
3. Extract one-line title
4. Create `NNN.md` with the raw content
5. Append to `index.json` with `{ id, title, status: 'open', source, created }`
6. Confirm capture

Then later, David does triage:
1. Read `index.json`, filter `status === 'open'`
2. For each: show title, ask accept/defer/reject
3. If accept: assign `type` (FR/BUG), `appetite` (S/M/L), `ref` (FR-001, BUG-001), rename file to `NNN-TYPE.md`
4. If defer/reject: record reason

**Key insight**: This is a *state machine*, not code generation. The skill manages a simple data structure (index.json) and guides the interaction flow. No file scaffolding; pure workflow.

---

### 3. Mochaccino Skill

**Location**: `.claude/skills/mochaccino/SKILL.md` (100 lines)

**Purpose**: UI/UX exploration. Generate design mockups BEFORE building.

**Architecture**:
- Discovers design system from project (tailwind.config.js, CSS custom properties, component examples)
- Discovers data shapes from types.ts or data/ folder
- Generates standalone HTML mockups saved to `.mochaccino/designs/`
- Stores design decisions in `.mochaccino/config.md`

**Flow**:
1. Developer says "I want to mockup the dashboard"
2. Skill asks: "What part feels clunky?" (understand the improvement angle)
3. Discovers design system (silent — no questions)
4. Discovers data shape (silent — uses real types)
5. Confirms: "I'll build this using your real data shape. OK?"
6. Generates HTML mockup
7. Developer can generate variations and compare

**Key insight**: Design-first, before any React components. Uses real design tokens and data, so mockups feel grounded.

---

## Part 4: Self-Healing & Flexibility Attempts

What did the author try to build that didn't work in a static CLI?

### Evidence from CONTEXT.md: What's Still Broken

**Environment setup failures** (from BACKLOG.md, Wave 5):
1. `.env` not auto-created — developer must manually `cp .env.example .env` (no prompt or error message)
2. `dotenv.config()` silently fails if `path` or `override` is wrong
3. Stale shell env overrides `.env` (now fixed with `override: true`, but pre-0.4.x projects are broken)

**Port conflict detection** (in index.js):
```javascript
async function isPortInUse(port) {
  return new Promise((resolve) => {
    const conn = createConnection({ port: Number(port), host: '127.0.0.1' });
    conn.on('connect', () => { conn.destroy(); resolve(true); });
    conn.on('error', () => resolve(false));
  });
}
```

This checks ports interactively during scaffold, but:
- It doesn't save the result or lock the ports
- If user says "yes" but then doesn't start immediately, another process can grab the port
- No error recovery if ports collide at startup time

**Socket.io connection failure** (from BACKLOG.md):
> "No signal when Socket.io fails to connect — UI stuck on 'Loading...' indefinitely"

The `useSocket` hook never surfaces connection errors. No timeout, no retry, no error state.

**start.sh stale state** (from CONTEXT.md):
> "If `.overmind.sock` exists from a crashed session, `start.sh` cannot start cleanly. Manual `overmind stop && rm -f .overmind.sock` is required."

The CLI can't detect or recover from this.

---

### What the Author Wanted But Couldn't Do Statically

1. **Smart string replacement** — The CLI uses simple `.split().join()`. The author wanted:
   - Automatic detection of placeholder strings by scanning the template
   - Validation that all placeholders are replaced
   - Conflict detection if the same string appears in multiple contexts
   - Auto-update of placeholder list when template changes

2. **Merge mode intelligence** — When scaffolding into an existing dir:
   - Auto-fix pre-existing files that have outdated ports/scope
   - Three-way merge on conflicted files (old template vs new template vs consumer edits)
   - Smart detection of "this file is a generated file, safe to regenerate" vs "this is custom, preserve it"

3. **Automatic `.env` creation** — The CLI copies `.env.example` but doesn't create `.env`:
   - Auto-copy `.env.example` → `.env` on first start
   - Or create `.env` during scaffold with a visible notice
   - Either requires some runtime intelligence or environment setup flow

4. **Port assignment intelligence** — Currently prompts and checks, but:
   - Doesn't reserve ports (another app could grab it immediately after)
   - No retry loop if the chosen ports are taken
   - No suggestion of "nearby available ports"
   - Doesn't check the canonical registry at `~/dev/ad/brains/brand-dave/app-port-registry.md`

5. **Graceful error recovery** — The CLI fails hard on missing template, missing git, npm install errors:
   - Could auto-retry npm install with exponential backoff
   - Could detect and clean up stale Overmind state
   - Could detect wrong socket URL and auto-fix it

6. **Recipe composition intelligence** — Recipes are idempotent but:
   - No automatic detection of "you already have nav-shell, should you run file-crud next?"
   - No validation that recipe dependencies are satisfied (e.g., file-crud needs chokidar, doesn't check if installed)
   - No auto-running of recipes in the right order if developer asks "build me a CRUD app"

---

## Part 5: How Static String Replacement Breaks at Scale

### The Placeholder Fragility Problem

Currently, the CLI has a hardcoded list of 11 search-replace operations:

```javascript
const oldScope = '@appystack-template';
const oldRootName = '@appydave/appystack-template';
const oldServerPort = '5501';
const oldClientPort = '5500';
const oldTitle = 'AppyStack Template';
const oldDescription = 'RVETS stack boilerplate (React, Vite, Express, TypeScript, Socket.io)';
// etc.

// Then 20+ replaceAll calls spread across different files
replaceAll(rootPkg, oldRootName, `${scope}/${name}`);
replaceAll(sharedPkg, oldScope, scope);
// ... etc, one per file per placeholder
```

**Why this breaks:**

1. **Template evolution**: If the template description changes from "RVETS stack boilerplate..." to "Full-stack RVETS boilerplate...", the CLI's hardcoded string no longer matches. Silent failure.

2. **New files**: Add a new config file (e.g., `logging.config.ts`) with a hardcoded port? The CLI won't find it.

3. **Placeholder collisions**: If the app description happens to contain "Template", it gets replaced too: "My Template for apps" becomes "My {app-name} for apps" (wrong).

4. **Merge mode gaps**: Files that already exist don't get substitutions. If developer previously scaffolded with default ports, then re-runs with `--port 6000`, the old package.json still has 5500/5501.

5. **Maintenance burden**: Every template change requires a CLI change. The two must stay in sync. No safety net.

---

### Compare: Dynamic Template Scanning

An agentic approach could:
1. Read the entire template directory
2. Parse each file (JSON, YAML, TS, etc.) by format
3. Automatically detect hardcoded values that look like placeholders
4. Validate substitution coverage (e.g., "you have 12 references to 5500, but the template has 15 — did you miss 3?")
5. Apply substitutions with conflict detection
6. Generate a report of what was replaced and where

This is exactly what Claude Code's editing tools do — they understand the code structure and can make targeted changes.

---

## Part 6: Upgrade CLI Laboriousness

The upgrade system is safe but tedious to maintain.

### The Four-Tier System Works, But...

**Why it's good:**
- App code in `client/src/`, `server/src/` is never touched (tier 3: `never`)
- Config improvements land silently (tier 1: `auto`)
- Skill files are reviewed before merge (tier 2: `recipe`)
- New unknown files default to "never overwrite" (conservative)

**Why it's laborious:**

1. **Manual tier maintenance** — Adding a new `auto` file requires editing `classify.js`. Version bump required. Publish delay.

2. **Diff UX is clunky** — Shows first 50 lines only. For large files, may not show the critical part.

3. **Recipe file merging is noisy** — Recipe files always prompt, even for minor updates. A small typo fix in `add-sync.md` prompts every app using `add-sync`.

4. **No semantic understanding** — The classifier is pattern-based. It doesn't understand "this is a generated file that's safe to overwrite" — it just looks at the filename.

5. **Merge strategy is all-or-nothing** — For `auto` files that are modified in consumer: either accept all of template's changes, or skip. No three-way merge.

---

## Part 7: The Role of Claude Code Skills

### Are Skills Agentic or Static?

**They are tools + conversation flow**, not agentic systems.

- **Recipe skill**: Developer asks "what recipes exist?", skill presents table, developer chooses, skill loads `.md` file, asks questions, generates concrete build prompt, waits for confirmation, then scaffolds
- **App-idea skill**: Manages state machine (index.json), prompts for capture/triage/status/close
- **Mochaccino skill**: Discovers design system and data shape, then asks for confirmation before generating mockups

**The "agentic" part**: Claude (the LLM) reads the project structure, generates project-specific prompts, and scaffolds code that fits. The skill file is just instructions + data structure.

**Not agentic in Claude Agent SDK sense**: No autonomous planning, no retry loops, no goal-seeking. Just guided user interaction + file generation.

---

## Part 8: What a Purely Agentic Install Would Look Like

(Hypothetical: what AppySentinel could do differently)

### Agent-Based Scaffolding (Conceptual)

Instead of:
1. Prompt for name/scope/ports
2. Copy template
3. Do string replacement
4. Run npm install
5. Run git init

Could do:
1. **Agent receives intent**: "Create a new RVETS app called my-app with scope @myorg"
2. **Agent plans** (autonomously):
   - Check port registry for available ports
   - Validate that target directory is empty
   - Identify which recipe the developer will likely need
   - List all customization points
3. **Agent executes** (with Claude Code tools):
   - Use Write tool to create files from templates
   - Use Bash to run npm install, git init, with auto-retry logic
   - Monitor for failures and auto-recover (e.g., if npm install times out, retry with --legacy-peer-deps)
   - Use Read tool to verify output
4. **Agent validates**:
   - Check that all ports are correctly set
   - Verify Socket.io can find the server
   - Run a health check
   - Generate a report of what was done
5. **Agent offers next steps**: "Based on your domain and intent, I recommend starting with the nav-shell recipe. Shall I scaffold it?"

**Advantages**:
- Self-healing (can detect and fix `VITE_SOCKET_URL` bug automatically)
- Flexible (can handle arbitrary number of customization points without code changes)
- Intelligent (can suggest recipes based on app type)
- Conversational (can ask clarifying questions mid-flow)

**Disadvantages**:
- Slower (more back-and-forth, more API calls)
- Requires Claude API token per scaffold
- Less deterministic (Claude might generate code slightly differently each run)
- Harder to audit (LLM decisions are opaque)

---

## Part 9: Why AppyStack Chose Static CLI + Skills Hybrid

From CLAUDE.md and CONTEXT.md:

1. **Simplicity**: No LLM required. `npx create-appystack` works offline, instantly.

2. **Auditability**: Every step is visible. String replacement is obviously correct or wrong.

3. **Reproducibility**: Same inputs → same outputs. No randomness.

4. **Proven at scale**: Used in 4 production apps (FliGen, FliHub, FliDeck, Storyline App).

5. **Low friction**: One command, 5-minute scaffold. Skills are optional.

6. **Dependency minimalism**: Only @clack/prompts. No Anthropic SDK, no network calls.

The trade-off: **Less flexible, less smart, more maintenance burden on the template author.**

---

## Part 10: Current Pain Points Summary

### Bugs (Open)

| Issue | Severity | Root Cause | Workaround |
|-------|----------|-----------|-----------|
| `VITE_SOCKET_URL` not replaced | High | Forgot to add `replaceAll` in CLI | Manually edit `.env` |
| `.env` not auto-created | Medium | CLI copies `.env.example` but doesn't create `.env` | `cp .env.example .env` before start |
| `dotenv` wrong path/override | Critical | Process.cwd is `server/` when nodemon runs | Fixed in latest template; pre-0.4.x broken |
| `.overmind.sock` stale state | Medium | `start.sh` doesn't detect/clean up | Manual `rm -f .overmind.sock` |
| Git step false negative | Low | `gitResult.ok` incorrectly false even when commit succeeds | Re-run scaffold or manually create `appystack.json` |
| Socket.io no error signal | Medium | `useSocket` hook has no timeout or error state | UI stuck on "Loading..." |
| Merge mode substitution gaps | Low | Pre-existing files skip port/scope replacements | Manually edit package.json, .env.example, etc. |

### Design Limitations

| Aspect | Limitation | Why It Exists |
|--------|-----------|---------------|
| String replacement | Hardcoded placeholder list | Static doesn't scale; would need regex or parsing |
| Upgrade file classification | Static tiers in classify.js | Dynamic classification would need semantic analysis |
| Merge strategy | All-or-nothing | Three-way merge is complex; would need diff engine |
| Recipe file prompting | Always prompts | Can't auto-detect if changes are minor |
| Port conflict | Checked at scaffold only, not reserved | Reservation would require external lock file or service |
| Environment setup | Manual `.env` copy | Could auto-create, but wouldn't know all required vars |

---

## Implications for AppySentinel Install Design

### Option A: Copy AppyStack's Model

**Use static CLI + Claude skills hybrid.**

**Advantages**:
- Battle-tested pattern
- Works offline, no API required
- Minimal dependencies
- All 4 production apps use it
- Skills for recipes/ideas/mochaccino are proven

**Disadvantages**:
- String replacement fragility (must maintain two synchronized lists: template + CLI)
- Merge mode gaps (can't auto-fix pre-existing files)
- Upgrade tier maintenance burden
- Limited self-healing
- Port and environment setup is clunky
- VITE_SOCKET_URL bug is endemic (fixable, but symptom of deeper issue)

**Best for**: AppySentinel if it will have a **stable, slow-moving template**. If the scaffold CLI and template rarely change, the maintenance burden is acceptable.

---

### Option B: Hybrid Agentic Harness (Recommended)

**Use Claude Agent SDK + Claude Code for install/config, with template as fallback.**

**Approach**:

1. **Initial project setup** (Agent handles):
   - User says "Create new AppySentinel project"
   - Agent gathers requirements (name, scope, ports, domain type, etc.) — with follow-up questions
   - Agent validates ports against registry, reserves them
   - Agent scaffolds project files (not by copying + replace, but by generating each file with Claude Code Write tool)
   - Agent runs npm install with auto-retry
   - Agent detects and fixes common errors (missing `.env`, wrong socket URL, etc.)
   - Agent validates everything works (health checks, Socket.io connects, etc.)
   - Agent suggests next recipes based on the domain

2. **Upgrade process** (Agent handles):
   - User says "I want to pull in template improvements"
   - Agent reads remote template
   - Agent compares with local project
   - Agent identifies conflicts and asks how to resolve (not just "auto/recipe/never", but smart questions)
   - Agent applies changes with understanding of what was customized vs generated

3. **Template** remains:
   - Reference/documentation only
   - Not a copy-template, but a **specification**
   - Recipes still written as capability descriptions
   - Skills still bundled (for guidance, not for primary scaffolding)

**Advantages**:
- Self-healing (Agent detects wrong socket URL and fixes it)
- Flexible (Agent doesn't need to know all possible customization points upfront)
- Intelligent (Agent can ask smart clarifying questions)
- Conversational (feels like working with a human architect)
- Adaptive (Agent's suggestions improve over time)
- No fragile string replacement (Claude understands code, generates correctly)

**Disadvantages**:
- Requires Claude API access and cost
- Slower (more API calls, more back-and-forth)
- Less deterministic (LLM-based, might vary slightly)
- Requires more careful validation (trust the Agent's output)
- Users need API key or org access

---

### Option C: Hybrid with Fallback

**Use Agent for primary flow, but allow users to fall back to static CLI for offline/minimal mode.**

1. **Default path**: Agent-based (all the benefits of Option B)
2. **Fallback path**: User can opt for `--no-agent` flag to use static CLI
3. **Template**: Serves both paths
   - For Agent: reference specs, recipes, skills
   - For CLI: copy template + string replacement (AppyStack style)

**Best of both worlds, but higher implementation burden.**

---

### Recommendation for AppySentinel

**Option B (Hybrid Agentic Harness) is the right choice** because:

1. **AppySentinel is evolving** — Unlike AppyStack (which is now stable), AppySentinel will have:
   - New security features (it's a sentinel/monitoring app)
   - Domain-specific extensions
   - Integration points with various platforms
   - String replacement will become a maintenance nightmare

2. **Agent can handle complexity** — An Agent can:
   - Ask "What platforms will you monitor?" and scaffold integrations
   - Validate that required environment variables are configured
   - Suggest security recipes (add-auth, rate-limiting, audit logging)
   - Auto-detect and fix common onboarding failures

3. **Recipes are about capability, not code** — AppySentinel recipes (if it uses them) would also be capability descriptions. An Agent is the natural interpreter.

4. **Cost is amortized** — A single install/upgrade is $0.01–$0.05 in API costs (with prompt caching). Spread across the project lifetime, negligible. Saves developer time (no manual fixes).

5. **Conversational UX is better** — "I want a sentinel app for monitoring AWS services" → Agent scaffolds the right integrations, asks smart follow-ups, validates the setup. Much better than interactive prompts.

---

## What NOT to Copy from AppyStack

1. ❌ **String replacement as primary customization** — Use AI-based code generation instead
2. ❌ **Static file classification tiers** — Use semantic understanding to decide what's safe to overwrite
3. ❌ **Hardcoded placeholder lists** — Parse and validate automatically
4. ❌ **All-or-nothing merge strategy** — Use three-way merge or Ask the developer smart questions
5. ❌ **Manual port checking** — Integrate with port registry, reserve ports, auto-recover from conflicts
6. ❌ **No error recovery** — Build auto-recovery into Agent logic (retry npm install, detect stale sockets, fix broken env files)

---

## What TO Copy from AppyStack

1. ✅ **Recipe pattern** — Capability descriptions that Claude interprets, not boilerplate code
2. ✅ **Composable features** — Allow developers to combine recipes (nav-shell + file-crud, etc.)
3. ✅ **Skill-based architecture** — Bundled skills for recipes, ideas, design (separate from scaffolding)
4. ✅ **Domain DSLs** — Pre-built entity definitions for vertical markets
5. ✅ **Idempotency** — Recipes/upgrades should be safe to re-run
6. ✅ **Templates as reference, not copy** — The template is the specification, not the source of truth
7. ✅ **Monorepo structure** — Shared types, clear package boundaries (client/server/shared)
8. ✅ **Environment validation** — Use Zod to validate config at startup
9. ✅ **Socket.io from day one** — Real-time is a first-class feature
10. ✅ **Quality tooling by default** — Linting, testing, formatting, type safety non-negotiable

---

## Conclusion

AppyStack's **static CLI + Claude skills** hybrid is production-proven and minimal. But it hits limits as the template grows and requirements become domain-specific.

AppySentinel should adopt **Agent-based scaffolding** (Option B above) because:
- String replacement doesn't scale to a complex security monitoring platform
- Agent can handle adaptive configuration (ask smart questions, suggest recipes)
- Self-healing and error recovery are critical for a reliable install
- Conversational UX matches the capability-based recipe model
- Cost is negligible; time savings are significant

**Copy the philosophy (recipes, composability, templates as spec), but use a different mechanism (Agent SDK instead of static CLI).**

The template itself, recipes, and skills remain unchanged. The difference is in the scaffolding harness: agentic instead of static.

---

*End of Deep Dive*
