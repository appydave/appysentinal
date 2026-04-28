# AppySentinel Documentation Guide

How this project's documentation is structured, what is canonical, and what order to update things.

---

## Provenance chain

```
docs/appysentinel-spec.md          ← canonical source of truth (architecture, recipes, decisions)
docs/pattern-catalogue.md          ← canonical living doc (patterns, gaps, pilot evidence)
         ↓  structured by Peter
.mochaccino/documentation/data/    ← synthesis: JSON data shapes for visual views
         ↓  rendered by Mocha
.mochaccino/documentation/designs/ ← rendered HTML views (developer audience)
         ↓  synthesised for audience by Peter
.mochaccino/client/data/           ← audience synthesis: same knowledge, client framing
         ↓  rendered by Mocha
.mochaccino/client/designs/        ← rendered HTML views (client / stakeholder audience)
```

**Rule**: when content changes, update `docs/` first. Then refresh the downstream data files. Then re-render. Never update a Mochaccino data file as a substitute for updating the spec.

---

## What lives where

| Location | What it is | Who owns it |
|----------|------------|-------------|
| `docs/appysentinel-spec.md` | Design-of-record. Architecture decisions, recipe catalogue, code shapes, open items. | Developer / architect |
| `docs/pattern-catalogue.md` | Living gap tracker. Patterns × apps matrix, pilot evidence, gap summary. | Developer — update as pilots progress |
| `docs/HANDOVER.md` | Session state. What was worked on, what not to do, what's next. | Update at session end |
| `.mochaccino/documentation/data/` | JSON syntheses of the spec — structured for visual rendering. | Peter (refresh after spec changes) |
| `.mochaccino/client/data/` | Audience-driven syntheses — same knowledge, client framing. | Peter (refresh after documentation data changes; check `sync_check` fields) |
| `.mochaccino/*/designs/` | HTML views. | Mocha (re-render after data file changes) |

---

## Update order

1. **Spec / pattern catalogue** — make the change here first.
2. **Mochaccino documentation data** — refresh the relevant `data/*.json`. Use the spec as the source.
3. **Mochaccino client data** — check `sync_check` fields on client data files. If a changed spec section is listed, update the client data file too.
4. **Re-render** — Mocha re-renders affected HTML views.
5. **Gallery** — regenerate `designs/index.html` if view count or titles changed.

---

## Drift detection

Client data files carry a `sync_check` field in their `meta` object listing which spec sections they depend on:

```json
"sync_check": [
  "documentation/data/01-what-is-appysentinel.json: definition, core_rules",
  "documentation/data/03-pattern-capability-matrix.json: gap_summary"
]
```

When a documentation data file changes, grep `client/data/` for its filename in `sync_check` to find which client files need reviewing.

---

## What the documentation is not

- **Not an AppyRadar manual.** AppyRadar appears in the spec and pattern catalogue only as pilot evidence — "this pilot validated this pattern." Documents that are *about* AppyRadar belong in the AppyRadar repo.
- **Not a client pitch deck.** The `docs/` folder is for builders. Client-facing material lives in `.mochaccino/client/`.
- **Not the source of recipe code.** Recipes are capability descriptions (markdown specs). Generated code lives in user projects. See spec §7.

---

*Keep this guide short. Its only job is to tell you what to update and in what order.*
