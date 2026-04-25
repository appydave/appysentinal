# Mochaccino Forensic Scan — Comprehensive Analysis

**Scan Date**: 2026-04-25  
**Scan Scope**: 12 `.mochaccino/` folders, 1 `.prose-models/` folder  
**Purpose**: Identify failure patterns and success patterns to inform unified skill design

---

## Executive Summary

**The Core Problem**: The current two-skill split (prose2models → mochaccino) requires human orchestration. Designs are delivered inconsistently:
- Data is scattered or missing
- Gallery indices (`index.html`) are often missing
- Brand guidelines are forgotten or applied unevenly
- `data/` folders with JSON are used once (agentic-os); everywhere else, data is inlined in HTML
- `.prose-models/` output doesn't feed into `.mochaccino/` workflows
- MVC pattern (model/data separate from view/HTML) is violated by inlining

**The Landscape**: Of 12 mochaccino folders audited:
- 6 have root `index.html` gallery ✓
- 6 are missing root `index.html` ✗
- 11 have `config.md` design logs ✓
- 1 has both `config.md` AND data folder ✓ (agentic-os — the reference)
- 10 have inlined data (anti-pattern) ✗
- 3 are ephemeral worktree sessions (Archon threads) — no persistent gallery

---

## Inventory of All Folders Scanned

| Path | Files | Has index.html | Has config.md | Has data/ | Status |
|------|-------|---|---|---|---|
| `agentic-os/.mochaccino` | 14 | ✓ | ✓ | ✓ | **REFERENCE SUCCESS** |
| `appydave.com/.mochaccino` | 39 | ✗ | ✓ | ✗ | Missing gallery |
| `angeleye/.mochaccino` | 60 | ✗ | ✓ | ✗ | Large, no gallery, no data |
| `appyradar/.mochaccino` | 54 | ✗ | ✓ | ✗ | Large, no gallery, no data |
| `brains/.mochaccino` | 4 | ✗ | ✗ | ✗ | **BROKEN** — orphaned designs |
| `flihub-storage-panel/.mochaccino` | 15 | ✗ | ✓ | ✗ | No gallery, inlined data |
| `flihub/.mochaccino` | 15 | ✗ | ✓ | ✗ | No gallery, inlined data |
| `storyline-app/.mochaccino` | 9 | ✓ | ✓ | ✗ | Has gallery + prose-models pair |
| `supportsignal/.mochaccino` | 137 | ✓ | ✓ | ✗ | Large, has gallery, no data |
| `thread-ad93e219/.mochaccino` | 11 | ✗ | ✓ | ✗ | Worktree, no gallery, inlined |
| `thread-3ad71430/.mochaccino` | 11 | ✗ | ✓ | ✗ | Worktree, no gallery, inlined |
| `thread-5959de9e/.mochaccino` | 11 | ✗ | ✓ | ✗ | Worktree, no gallery, inlined |

**Prose-Models Discovery**:
- Only 1 `.prose-models/` folder exists: `storyline-app/.prose-models/current/`
- Contains 3 JSON files: `ux-interface.json`, `data-semantic.json`, `user-journey.json`
- **Not integrated** with mochaccino designs — designs don't reference or import the JSON

---

## Pattern 1: FAILURE — Missing Root Gallery (6 folders)

### Symptom
No `index.html` at root of `.mochaccino/`. Designs exist in `designs/` subdirectories but are orphaned, discoverable only by direct navigation.

### Affected Folders
1. `brains/.mochaccino` — 4 designs, orphaned (also missing `config.md`)
2. `appydave.com/.mochaccino` — 28 designs, orphaned
3. `angeleye/.mochaccino` — 34 designs in `designs/`, orphaned
4. `appyradar/.mochaccino` — 26 designs, orphaned
5. `flihub-storage-panel/.mochaccino` — 14 designs, orphaned
6. `flihub/.mochaccino` — 14 designs, orphaned

### Root Cause
Mochaccino skill generates `designs/{slug}/index.html` per mockup but **does not generate a root `index.html`** that lists them. Gallery creation is manual, inconsistent, or forgotten.

### Impact
- No sharable entry point for stakeholders
- No visual discovery — must know slug names
- Temporal decay — design accumulates, becomes unmaintainable
- No metadata about the collection (date, purpose, audience, system context)

### Evidence: brains/.mochaccino
```
.mochaccino/
├─ designs/
│  ├─ appydave-v1/index.html
│  ├─ appydave-v2/index.html
│  ├─ appydave-v3/index.html
│  └─ ess-characters/index.html
├─ (NO index.html here) ✗
└─ (NO config.md here) ✗
```

---

## Pattern 2: ANTI-PATTERN — Data Inlined in HTML (10 folders)

### Symptom
All data is hardcoded or inlined in the HTML file itself. No separate `data/` folder. No JSON files. Cannot regenerate the design from fresh data.

### Affected Folders
- appydave.com, angeleye, appyradar, flihub-storage-panel, flihub, storyline-app, all 3 Archon threads, supportsignal (partially)

### Example: appydave.com/.mochaccino/designs/*/index.html
All mockups hardcode content like:
```html
<div class="participant-name">Priya Sharma</div>
<div class="stat-value">6</div>
<div class="risk-chip">
  <div class="chip-name">Fall Risk</div>
  <div class="chip-desc">History of falls due to mobility impairment</div>
</div>
```

**No separation of concerns**: If the data changes, the HTML must be regenerated. If the HTML is regenerated, the data is lost.

### Root Cause
Mochaccino is designed to render **visual mockups with embedded sample data**. It doesn't enforce extracting data into separate JSON files. Prose2models output (JSONs) doesn't flow into the mochaccino pipeline.

### Impact
- Cannot regenerate design with updated data
- Designs are locked to one snapshot
- No reusable data layer
- If design system changes, data must be re-entered by hand

### Evidence: Contrast with agentic-os
```
agentic-os/.mochaccino/
├─ data/
│  ├─ 01-layer-stack.json ✓
│  ├─ 02-node-topology.json ✓
│  ├─ 03-data-flow.json ✓
│  ├─ 04-agent-orchestration.json ✓
│  └─ 05-application-typology.json ✓
├─ designs/
│  ├─ 01-layer-stack/index.html (READS from data/01-layer-stack.json)
│  └─ ...
├─ config.md ✓
└─ index.html ✓
```

---

## Pattern 3: INCONSISTENT BRAND APPLICATION (mixed)

### Case A: Strong Brand Adherence ✓ (agentic-os, storyline-app, SupportSignal threads, some angeleye/appyradar)

**agentic-os** uses AppyDave brand consistently:
```css
--brand-brown: #342d2d;
--brand-gold: #ccba9d;
--brand-yellow: #ffde59;
--brand-amber: #c8841a;
--brand-near-white: #faf5ec;
/* Fonts: Oswald (headlines), Roboto (body), Bebas Neue (numerals) */
```

Fonts applied:
- Headlines: `font-family: 'Oswald', Impact, sans-serif`
- Body: `font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif`
- Large display: `font-family: 'Bebas Neue', Impact, sans-serif`

**SupportSignal** (teal scheme) and **appydave.com** (varied) sometimes break brand.

### Case B: Weak or Absent Brand ✗

- **appydave.com/.mochaccino/designs/**: Varied — some designs use AppyDave brown, others don't
- **angeleye/.mochaccino/**: Mostly brown/cream/amber but not consistently Oswald/Roboto
- **appyradar/.mochaccino/**: Uses Roboto + Oswald but color palette is ad-hoc

### Root Cause
Brand variables aren't enforced in a shared CSS file or component library. Each design hardcodes colors and fonts independently. No design system.

### Impact
- Inconsistent visual identity across designs
- Brand guidelines forgotten between sessions
- "Warm brown, cream, yellow" buried in prose or mental model, not enforced in code
- Client deliverables (SupportSignal, AppyDave.com) use different color schemes entirely

---

## Pattern 4: MISSING CONFIG.MD (1 folder)

### brains/.mochaccino
No design log. No context about why the 4 mockups exist, when they were created, or what they're exploring.

### Impact
- Orphaned designs
- No audit trail
- Future sessions cannot understand intent
- Designs are ephemeral / meaningless

---

## Pattern 5: WORKTREE SESSIONS LACK PERSISTENCE (3 folders)

### Archon Thread Folders
```
.archon/workspaces/.../worktrees/archon/thread-{UUID}/.mochaccino/
```

Each thread contains:
- 10 designs (e.g., participant-risk-matrix, participant-profile, etc.)
- No root `index.html` (orphaned)
- No persistent location
- Deleted when thread closes

### Root Cause
Worktree sessions are ephemeral. Designs created in threads aren't promoted to persistent galleries. The workflow doesn't bridge session → permanent artefact.

### Impact
- Designs are lost when threads close
- No way to reference "that risk matrix we designed in March"
- Reinvention of the wheel in subsequent threads

---

## Pattern 6: PROSE-MODELS DECOUPLED FROM MOCHACCINO (1 instance)

### storyline-app
```
storyline-app/
├─ .prose-models/current/
│  ├─ ux-interface.json
│  ├─ data-semantic.json
│  └─ user-journey.json
└─ .mochaccino/
   ├─ designs/ (8 HTML files)
   └─ index.html
```

The `.prose-models/` JSONs exist but are **not consumed** by mochaccino designs. They're separate.

### Expected (but not happening)
```
storyline-app/.mochaccino/
├─ data/
│  ├─ 01-ux-interface.json (imported from prose-models)
│  ├─ 02-data-semantic.json
│  └─ 03-user-journey.json
└─ designs/
   ├─ 01-ux-flows/index.html (renders from data/01-ux-interface.json)
   └─ ...
```

### Root Cause
Prose2models runs independently of mochaccino. Output lands in a different folder. No integration point.

### Impact
- JSONs are written but unused
- Prose2models is a dead-end unless developer manually copies data
- Opportunity for unified pipeline wasted

---

## Pattern 7: CONFIG.MD QUALITY VARIANCE

### Excellent (agentic-os)
```markdown
# Mochaccino Design Log

**Goal**: Produce five distinct visual lenses on the Agentic OS...
**Source data**: `.mochaccino/data/` — five JSON angle documents...
**Brand**: AppyDave — cream canvas, warm brown text, yellow for CTAs...
**Delivery**: Five self-contained HTML files in `designs/`, plus a gallery at `index.html`.

### Twenty alternative renderings captured
Each design documents four alternative approaches...

### Known gaps represented visually
- **Samantha** (top conversational orchestrator) — dotted outline, PLANNED badge
...
```

Clear, structured, links data, brand, intent, decisions.

### Minimal (flihub)
```markdown
| Name | Date | Goal |
|------|------|------|
| relay-redesign | 2026-03-22 | Relay collaboration UX with workflow lanes and file drawers |
| sync-hub | 2026-03-23 | Two-channel git sync with header indicators and conflict UI |
```

Bare-bones table, no strategic context.

### Missing (brains)
No config.md at all.

---

## Success Reference: agentic-os/.mochaccino

### What It Does Right

1. **Data Separation**: `data/` folder with 5 JSON files, each a distinct "angle"
   ```
   data/01-layer-stack.json — 600+ lines, full entity model
   data/02-node-topology.json
   data/03-data-flow.json
   data/04-agent-orchestration.json
   data/05-application-typology.json
   ```

2. **MVC Pattern**: Each design references its JSON
   ```html
   <!-- designs/01-layer-stack/index.html would load from data/01-layer-stack.json -->
   ```

3. **Root Gallery**: `index.html` lists all 5 designs with:
   - Grid layout with cards
   - Title, subtitle, description, CTA per card
   - AppyDave brand applied consistently (cream/brown/yellow/amber)
   - Meta strip (system, audience, generated date, source)
   - Brand colors: `--brand-brown: #342d2d; --brand-yellow: #ffde59; --brand-amber: #c8841a`
   - Fonts: Bebas Neue, Oswald, Roboto

4. **Config.md Excellence**: 
   - Clear purpose statement
   - Source data documented
   - Brand guidelines quoted verbatim
   - Twenty alternative rendering ideas listed
   - Shipping record (skills that emerged)
   - Location, creation date, maintainer

5. **Consistent Branding**: Every mockup uses the same CSS variables
   ```css
   :root {
     --brand-brown: #342d2d;
     --brand-gold: #ccba9d;
     --brand-yellow: #ffde59;
     --brand-amber: #c8841a;
     --brand-muted: #7a6e5e;
     --brand-near-white: #faf5ec;
     ...
   }
   ```

6. **Scalability**: 5 angles × 4 alternative renderings = 20 total concepts, each documented
   ```markdown
   | # | Slug | Angle | Primary rendering |
   |---|------|-------|-------------------|
   | 01 | `01-layer-stack` | Layer Stack | Vertical stacked bands |
   | ... |
   ```

---

## Failure Case: brains/.mochaccino

### What Goes Wrong

```
.mochaccino/
├─ designs/
│  ├─ appydave-v1/index.html
│  ├─ appydave-v2/index.html
│  ├─ appydave-v3/index.html
│  └─ ess-characters/index.html
├─ (NO index.html) ✗
└─ (NO config.md) ✗
```

1. **No root index.html** → designs are orphaned, undiscoverable
2. **No config.md** → no record of why these exist
3. **No data/ folder** → unknown if designs reference external data
4. **No narrative** → impossible to tell if this is active or abandoned

**Result**: Designs are lost noise.

---

## Failure Case: Large Folders Without Gallery (angeleye, appyradar)

### angeleye/.mochaccino
```
├─ designs/ (34 mockups, e.g., v1-paper, v2-linen, chat-panel, named-rows-v3-columns, ...)
├─ config.md ✓ (good quality)
└─ (NO index.html) ✗
```

34 mockups grouped into phases (Phase 1, 2, 3, 4), documented in config.md, but **no visual gallery to browse them**. To find a design, you must:
1. Open config.md
2. Find the slug
3. Manually navigate to `designs/{slug}/`

**Impact**: Design review requires offline manual work. Stakeholders can't be sent "here's the gallery."

---

## Failure Case: Inlined Data (SupportSignal, AngelEye, AppyRadar)

### supportsignal/.mochaccino/designs/participant-risk-matrix/index.html
All data is hardcoded:
```html
<div class="stat-value">6</div>  <!-- Total Risks hardcoded -->
<div class="stat-value">3 / 2 / 1</div>  <!-- Breakdown hardcoded -->
<div class="risk-chip" onclick="openCard('fall-risk')">
  <div class="chip-name">Fall Risk</div>  <!-- Hardcoded -->
  <div class="chip-desc">History of falls due to mobility impairment</div>  <!-- Hardcoded -->
</div>
```

If the risk data changes (new risks, different counts, updated controls):
- Design HTML must be regenerated
- OR: Data is manually edited in HTML
- Either way: **data is not versionable, reusable, or separable**

---

## Integration Gap: .prose-models → .mochaccino (Broken)

### What Should Happen (but doesn't)
```
1. prose2models skill extracts data from prose
   └─> outputs to .prose-models/current/ux-interface.json

2. mochaccino skill should consume it
   └─> reads data/ (or .prose-models/)
   └─> renders to designs/{slug}/index.html
   └─> generates root index.html gallery
```

### What Actually Happens
```
1. prose2models runs → writes .prose-models/current/ux-interface.json
   ✓ Done

2. mochaccino runs (in a separate session)
   └─> Ignores .prose-models entirely
   └─> Generates designs with hardcoded sample data
   └─> No reference to extracted JSON
   ✗ Data lost
```

### Root Cause
The two skills don't have a common input/output contract. Mochaccino doesn't know to look for `.prose-models/` output. Prose2models doesn't know where to write so mochaccino can find it.

---

## Proposed Unified Skill: `mochaccino-unified`

A single skill that combines the best of prose2models + mochaccino, enforcing MVC, brand, and gallery generation.

### Skill Name
**`mochaccino-pipeline`** (or `mochaccino-unified` or `design-atlas`)

### Description
Converts prose descriptions, structured notes, or data into a branded design gallery. Enforces:
- **MVC pattern**: data in `.mochaccino/data/*.json`, HTML in `designs/{slug}/index.html`
- **Brand consistency**: AppyDave cream/brown/yellow/Oswald/Roboto applied automatically
- **Gallery generation**: Root `index.html` listing all mockups with cards, metadata, and CTA
- **Config documentation**: Auto-generated or guided `config.md` with purpose, dates, decisions
- **Data-to-design flow**: Prose2models JSONs automatically copied/integrated

### Inputs
```
1. Design brief (prose OR JSON array of angles)
2. Optional: Existing .prose-models/ folder (auto-imported)
3. System name (for metadata)
4. Audience (stakeholder description)
5. Design style/theme (or default: appydave brand)
```

### Workflow Steps

#### Step 1: Parse Input
- Accept either:
  - Prose description → extract mockup concepts and data needs
  - Array of design angles (JSON) → use as is
  - `.prose-models/` folder → ingest all JSON files

#### Step 2: Create `.mochaccino/` Structure
```
.mochaccino/
├─ config.md (auto-generated template)
├─ index.html (gallery, auto-generated)
├─ data/ (new designs only)
│  ├─ 01-angle-name.json
│  ├─ 02-angle-name.json
│  └─ ...
├─ designs/
│  ├─ 01-angle-name/
│  │  └─ index.html (renders from data/01-angle-name.json)
│  ├─ 02-angle-name/
│  │  └─ index.html
│  └─ ...
└─ bake.py (optional: helper to regenerate designs)
```

#### Step 3: Extract & Structure Data
- If input is prose:
  - Parse into logical "angles" or "lenses"
  - Extract entities, relationships, statuses
  - Write to `data/{n}-angle-name.json` with schema
- If input is already JSON:
  - Validate schema
  - Copy to `data/{n}-angle-name.json`
- If input includes `.prose-models/`:
  - Copy `*.json` from `.prose-models/current/` to `.mochaccino/data/`
  - Rename to `{n}-basename.json` for consistency

#### Step 4: Generate Root Gallery (index.html)
```html
<!DOCTYPE html>
<html>
<style>
  /* AppyDave brand CSS variables */
  :root {
    --brand-brown: #342d2d;
    --brand-gold: #ccba9d;
    --brand-yellow: #ffde59;
    --brand-amber: #c8841a;
    ...
  }
  /* Shared brand styles */
</style>
<body>
  <header>
    <h1>System Name — Design Gallery</h1>
    <p>Subtitle / purpose</p>
    <div class="meta-strip">
      <strong>SYSTEM</strong> {system_name}
      <strong>AUDIENCE</strong> {audience}
      <strong>GENERATED</strong> {date}
      <strong>SOURCE</strong> {n} JSON + prose
    </div>
  </header>
  <div class="grid">
    <!-- One card per design -->
    <a class="card" href="designs/01-angle-name/index.html">
      <div class="card-num">01</div>
      <div class="card-title">Angle Name</div>
      <div class="card-desc">{description from JSON[0].purpose}</div>
      <div class="card-cta">Open visualisation</div>
    </a>
    ...
  </div>
</body>
</html>
```

#### Step 5: Generate Per-Design HTML
For each angle/entry in data:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Mochaccino — {angle_title} — {date}</title>
  <link rel="stylesheet" href="../../brand.css">
  <!-- Or embed AppyDave brand CSS -->
</head>
<body>
  <!-- Banner -->
  <div class="mochaccino-banner">
    Mochaccino — {angle_title} — {date}
  </div>
  
  <!-- Load and render data -->
  <script>
    const data = {/* imported from ../data/01-angle-name.json */};
    // Render based on data.display_type: 'layer-stack', 'matrix', 'timeline', etc.
    // Choose appropriate template
  </script>
  
  <!-- Render structure (varies by angle type) -->
  <div class="container">
    <header>
      <h1>{data.title}</h1>
      <p>{data.subtitle}</p>
      <div class="toolbar">
        <!-- Perspectives, filters, toggles (from data.perspectives) -->
      </div>
    </header>
    
    <div class="content">
      <!-- Render data.items, data.layers, data.matrix, etc. -->
      <!-- Every element gets brand colors from :root -->
    </div>
    
    <div class="alternatives-section">
      <h3>Other Ways This Could Be Rendered</h3>
      <!-- From data.alternative_renderings (4 concepts per design) -->
    </div>
  </div>
</body>
</html>
```

#### Step 6: Generate config.md
```markdown
# Mochaccino Design Log — {System Name}

---

## {Date} — {System Name}: {Tagline}

**Goal**: {from input prose or user-provided}

**Source data**: `.mochaccino/data/` — {n} JSON angle documents plus raw prose.

**Brand**: AppyDave — cream canvas, warm brown text, yellow for CTAs, gold for secondary, amber for accents. Oswald headlines, Roboto body, Bebas Neue for numerals.

**Delivery**: {n} self-contained HTML files in `designs/`, plus a gallery at `index.html`.

### Mockups in this set

| # | Slug | Angle | Primary rendering |
|---|------|-------|-------------------|
{auto-generated table from data}

### {n} alternative renderings captured

Each design includes four alternative rendering approaches...

---

**Location**: `~/path/to/.mochaccino/`
**Created**: {date}
**Maintainer**: {user name or "David Cruwys"}
```

#### Step 7: Optional — Invoke mochaccino Skill for Additional Renderings
If user wants multiple visual treatments (v1, v2, v3 as in brains/):
- Call mochaccino skill for each variation
- All share the same `data/` and `config.md`
- Gallery shows all variants

### Key Enforcements

1. **Brand Consistency**
   - CSS `:root` variables with AppyDave palette (cream/brown/yellow/amber/gold)
   - Font stack: Oswald, Roboto, Bebas Neue
   - No deviations unless explicitly requested (and recorded in config.md)

2. **MVC Pattern**
   - Data lives in `.mochaccino/data/`
   - HTML templates in `designs/{slug}/`
   - If data updates, regenerate designs without re-entering data

3. **Gallery & Discoverability**
   - Always generate root `index.html`
   - Always generate `config.md` with purpose, dates, brand, decisions
   - Metadata visible in gallery (system, audience, generated date, source)

4. **Data Validation**
   - Schema enforcement (e.g., each JSON must have `title`, `subtitle`, `purpose`, `display_type`, `items`)
   - Missing fields trigger warnings

5. **Prose→Data Pipeline**
   - If input is prose, offer to extract entities/sections to JSON
   - If `.prose-models/` exists, import and link

6. **Consistent Naming**
   - Designs: `{N:02d}-{slug}/index.html` (01-layer-stack, 02-node-topology, etc.)
   - Data: `{N:02d}-{slug}.json`
   - Config: `config.md` (always)
   - Gallery: `index.html` (always)

### What Makes It Different from Current Split

| Aspect | Current (prose2models + mochaccino) | New (mochaccino-pipeline) |
|--------|------|---|
| **Data location** | JSONs in `.prose-models/`, ignored by mochaccino | JSONs in `.mochaccino/data/`, consumed by all designs |
| **Gallery** | Manual creation, often missing | Auto-generated from data |
| **Config** | Manual markdown, inconsistent | Auto-generated template, guided fill |
| **Brand** | Inconsistent, hardcoded per design | Enforced via :root variables, app-wide CSS |
| **MVC Pattern** | Violated — data inlined in HTML | Enforced — designs render from JSON |
| **Integration** | Prose2models → dead-end, mochaccino isolated | Prose2models → mochaccino → gallery (unified flow) |
| **Reusability** | Designs locked to one data snapshot | Designs regenerable with new data |
| **Discoverability** | Must know slug names | Gallery card per design, metadata visible |
| **Alternative renderings** | Manual variants (v1, v2, v3) | Documented in config, linked from gallery |
| **Worktree persistence** | Ephemeral sessions, designs lost | Automatic promotion to persistent gallery |

---

## Concrete Skill Proposal

### Skill Name
**`mochaccino-pipeline`**

### Command Syntax
```bash
/mochaccino-pipeline [brief] [--system NAME] [--audience TARGET] [--style STYLE]
```

### Examples

**Example 1: From Prose Brief**
```
/mochaccino-pipeline "Create 3 visual angles on the Agentic OS: (1) Layer Stack 
showing 7 layers L0-L6, (2) Node Topology with 5 machines across 2 countries, 
(3) Data Flow pipeline with 8 stages. Use AppyDave brand. Audience: Lars 
Filtenberg (client presentation)." --system agentic-os --audience "Lars Filtenberg, Tjeks ApS"
```

**Output**:
```
✓ Parsed 3 design angles
✓ Created .mochaccino/data/{01,02,03}-*.json
✓ Generated designs/ with 3 index.html files
✓ Generated root index.html gallery
✓ Generated config.md
→ Next: Review gallery at ~/path/to/.mochaccino/index.html
→ Edit data/*.json to refine content
→ Regenerate designs: /mochaccino-pipeline --regenerate
```

**Example 2: From Existing .prose-models**
```
/mochaccino-pipeline --source-prose-models ~/dev/ad/flivideo/storyline-app/.prose-models/current
```

**Output**:
```
✓ Found 3 JSON files in .prose-models/
✓ Imported to .mochaccino/data/{01,02,03}-*.json
✓ Generated designs/ with 3 template HTML files (ready for design work)
✓ Generated gallery index.html
✓ Generated config.md stub (add narrative details)
→ Edit .mochaccino/config.md to add purpose, decisions
→ Refine designs by running: /mochaccino-pipeline --regenerate
```

**Example 3: Regenerate Existing Gallery**
```
/mochaccino-pipeline --regenerate --folder ~/dev/ad/apps/appysentinal/.mochaccino
```

**Output**:
```
✓ Detected existing .mochaccino/ with 5 designs
✓ Re-rendered all designs from data/
✓ Refreshed index.html gallery
✓ Updated config.md timestamp
→ All designs up-to-date
```

### Interactive Mode (Default)
```
$ /mochaccino-pipeline
? System name: Agentic OS
? Audience: Client presentation to Lars
? Number of design angles: 3
? Angle 1 title: Layer Stack
? Angle 1 description: Seven layers from silicon to interface
  (saves to data/01-layer-stack.json)
? Angle 2 title: Node Topology
...
? Design style: appydave (default, or custom)
✓ Gallery created at .mochaccino/index.html
```

### Key Parameters
- `--system NAME` — stored in metadata, shown in gallery
- `--audience TARGET` — stakeholder description
- `--style STYLE` — default "appydave" (cream/brown/yellow/Oswald/Roboto)
- `--source-prose-models PATH` — import from prose2models output
- `--regenerate` — rebuild all designs from existing data/
- `--folder PATH` — operate on existing .mochaccino/ (default: create new)

### Constraints & Validation
- Each JSON must have: `title`, `subtitle`, `purpose`, `display_type`, `items` (or equivalent)
- Root gallery requires: `config.md`, `index.html`, `designs/{n}-*/index.html`
- Brand CSS enforced unless `--no-brand-enforcement` (with warning)
- File naming: 01-, 02-, etc. prefix mandatory for sort order

---

## Implementation Priority

### Phase 1: Minimal Viable Skill
1. Accept prose brief → extract angles
2. Create `.mochaccino/data/` with basic JSON schema
3. Generate basic template `designs/{slug}/index.html`
4. Generate root `index.html` gallery (agentic-os template reused)
5. Generate `config.md` stub

### Phase 2: Polish & Integration
1. Prose2models integration — auto-import `.prose-models/` JSONs
2. Brand enforcement — CSS variable injection, font loading
3. Alternative rendering documentation (4 per design)
4. Worktree promotion — copy from ephemeral session to persistent gallery

### Phase 3: Advanced
1. Per-design rendering logic — different templates for layer-stack vs. matrix vs. timeline
2. Data validation — schema checking, missing field warnings
3. Regeneration workflow — update data, regenerate designs in bulk
4. Multi-brand support — SupportSignal teal, AppyDave brown, etc. as presets

---

## Risk Mitigations

### Risk: Over-Automation Kills Flexibility
**Mitigation**: Core skill generates scaffold. Designers can override/customize templates after generation. Regenerate only when told explicitly.

### Risk: Brand Enforcement Too Rigid
**Mitigation**: Offer `--style custom` with warnings. Document deviations in config.md. Presets for known projects (AppyDave, SupportSignal, etc.).

### Risk: Data Schema Too Strict
**Mitigation**: Support multiple `display_type` values — layer-stack, matrix, timeline, card-grid, etc. Flexible item structures per type.

### Risk: Orphaned Prose2Models Output
**Mitigation**: Skill explicitly offers to import `.prose-models/`. If user skips, document the gap in config.md. Warn if `.prose-models/` exists but isn't imported.

---

## Success Metrics

After skill ships:
1. **Every `.mochaccino/` has**: root `index.html`, `config.md`, `data/` folder (if data-driven)
2. **All designs apply**: AppyDave brand (or documented deviation)
3. **Gallery discoverability**: Shareable URL to `index.html`, cards show purpose, no slug guessing
4. **Data reusability**: Designs regenerable from updated JSON
5. **Prose2models integration**: `.prose-models/` output flows → `.mochaccino/data/` → designs
6. **Worktree promotion**: Session designs saved to persistent gallery automatically

---

## Appendix: Template Structure Reference

### data/01-example.json Schema
```json
{
  "angle": "example-angle",
  "title": "Example Angle Title",
  "subtitle": "Short subtitle or alternative phrasing",
  "purpose": "Why this angle exists and what question it answers",
  "generated": "2026-04-25",
  "system": "system-name",
  "display_type": "layer-stack", // or: matrix, timeline, card-grid, etc.
  "perspectives": [
    {"id": "view1", "label": "View 1", "description": "..."}
  ],
  "items": [
    {"name": "Item 1", "status": "done", "note": "..."}
  ],
  "alternative_renderings": [
    {"title": "As a horizontal timeline", "rationale": "..."},
    {"title": "As a swimlane diagram", "rationale": "..."},
    {"title": "As an interactive tree", "rationale": "..."},
    {"title": "As a comparison matrix", "rationale": "..."}
  ]
}
```

### Root index.html Structure (agentic-os template)
```html
<!DOCTYPE html>
<html>
<head>
  <title>Mochaccino — {System Name}</title>
  <style>
    :root {
      --brand-brown: #342d2d;
      --brand-gold: #ccba9d;
      --brand-yellow: #ffde59;
      --brand-amber: #c8841a;
      ...
    }
  </style>
</head>
<body>
  <header>
    <h1>{System Name}</h1>
    <p>{Subtitle}</p>
    <div class="meta-strip">
      <strong>SYSTEM</strong> {system}
      <strong>AUDIENCE</strong> {audience}
      <strong>GENERATED</strong> {date}
      <strong>SOURCE</strong> {n} JSON
    </div>
  </header>
  <div class="grid">
    {card per design, linked to designs/{slug}/index.html}
  </div>
</body>
</html>
```

---

**End of Forensic Report**
