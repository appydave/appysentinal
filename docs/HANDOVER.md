# AppySentinel — Session Handover (2026-04-26, session 2)

This supersedes the prior handover (session 1, same date). Do not act on any priority list from earlier versions.

---

## Read in this order

| # | File | Why |
|---|------|-----|
| 1 | `docs/appysentinel-spec.md` | Updated this session — §1, §3, §5, §7.0, §7.2 all have WHY content now |
| 2 | `docs/pattern-catalogue.md` | Capability matrix + gap tracker — still the lead living doc |
| 3 | `CONTEXT.md` | Generated this session — 8-dimension system snapshot |
| 4 | `.mochaccino/documentation/` | Mochaccino workspace — 3 rendered views + gallery |
| 5 | `packages/core/src/` | Foundation primitives — all 7 implemented, 27 tests passing |

---

## What was done this session

### Spec — WHY content added (was WHAT-only before)
- **§1/§3** — corrected "per-machine" to "single-host". A Sentinel runs on one host; it can collect from remote machines via SSH etc. One-per-machine is an option, not a requirement. AppyRadar proves this: one orchestrator, five SSH targets.
- **§5** — added WHY narrative for foundation primitives. Explains why each of the 7 is baked in (they're the unavoidable floor every always-on headless process needs).
- **§7.0** — defined the umbrella concept (grouping by direction of data flow, not technology). Explained Expose as local-first. Documented two open design decisions.
- **§7.2** — added WHY for storage: file-first rationale (zero setup, droppable, no support burden), state-vs-history decision guide, promoted `snapshot-store` as a distinct recipe.

### Mochaccino documentation workspace
Server runs from `.mochaccino/` at port 7420:
```
cd .mochaccino && python3 -m http.server 7420
```
Access at `http://localhost:7420/documentation/designs/`

| View | URL | Status |
|------|-----|--------|
| Gallery | `/documentation/designs/` | Active |
| 01 — What is AppySentinel | `/documentation/designs/01-what-is-appysentinel/` | Active |
| 02 — Architecture Overview | `/documentation/designs/02-architecture-overview/` | Active — WHY descriptions, open decision callout |
| 03 — Pattern Capability Matrix | `/documentation/designs/03-pattern-capability-matrix/` | Active |
| 04 — Recipe Catalog | `/documentation/designs/04-recipe-catalog/` | Planned — not yet rendered |

### Alignment audit findings
Foundation is solid. The gaps are:

**Zero recipes exist** — not one. No markdown spec files, no code. The path `.claude/skills/recipe/` does not exist. `configure-sentinel` skill is a placeholder. This is expected — pilots will create the first recipes.

**Spec drift to fix (minor, not urgent):**
- `SignalKind` has `'state'` in code but spec text (§7.2, and architecture data JSON) says `'snapshot'`. Fix: update spec and data to use `'state'`.
- `ConfigLoader` — schema passed at construction in code, spec says it's passed at call time. Update §5.4 interface to match implementation.
- `atomicWrite` — uses `Uint8Array` not `Buffer`. Update §5.5 type signature.
- `SignalBus` — adds `emitAndWait` and `size()` beyond spec. Document these in §5.2.
- `createSentinel()` factory not mentioned in §5 despite being the main consumer API. Add as §5.8.
- CLI (`packages/cli/`) has no tests.
- Bun test runner used in practice; Vitest listed in §4 tech stack. Minor — clarify.

**`@appydave/appysentinel-config` package** — exists in `packages/config/`, referenced by template, not documented in spec at all.

---

## Open design decisions (documented in spec §7.0)

1. **Expose as control surface** — Expose is read-only by default. Write/control capability (accepting commands from a local agent) belongs in the Expose umbrella as an opt-in, not a default. Not yet designed.

2. **Config-pull as a fourth direction** — spec §3 lists four verbs (COLLECTS, EXPOSES, DELIVERS, PULLS config) but only three umbrellas. Config-pull is filed under coordination recipes (§7.7). Whether it warrants a fourth umbrella is unresolved.

---

## What is NOT next

- ❌ Do not write speculative recipe specs before a pilot demands them.
- ❌ Do not flesh out `configure-sentinel` skill yet — interview is informed by which recipes exist.
- ❌ Do not render view 4 (Recipe Catalog) as the first thing — fix spec drift first so the data is accurate.

---

## What IS next — priority order

1. **Fix `snapshot` → `state` naming** in spec §7.2 text and in `.mochaccino/documentation/data/02-architecture-overview.json`. Small, precise, do first.
2. **Fix remaining spec drift** — §5.2 (SignalBus additions), §5.4 (ConfigLoader signature), §5.5 (atomicWrite type), add §5.8 (createSentinel factory). Document `@appydave/appysentinel-config` package.
3. **Render view 4 — Recipe Catalog** — data file already exists at `.mochaccino/documentation/data/04-recipe-catalog.json`. Card-grid layout, one card per recipe.
4. **Pilot 1 discovery — AppyRadar Sentinel** — discovery doc at `~/dev/ad/apps/appyradar-sentinal/docs/discovery.md`. Prior art at `~/dev/ad/apps/appyradar/scripts/audit.ts` (728 lines). Key open decision: split-in-place vs new repo.
5. **Pilot 2 discovery — SS Data Query Sentinel** — discovery doc at `~/dev/clients/supportsignal/sentinal.supportsignal/docs/discovery.md`. Schema fully mapped (15 tables, Tier 1/2 split, PII map, mirror layout). Key open decision: which DB entities to start with.

---

## Mochaccino session learnings (captured in `.mochaccino/learnings.md`)

- Always start local server before opening designs — `file://` blocks fetch().
- Gallery must be generated after every render, not just at the end.
- Card links must use the numbered folder path from the `view` field, not the slug alone.
- Structuring data for Peter surfaces doc gaps that reading the spec does not — use this deliberately.

---

## Reference paths

| Path | Purpose |
|------|---------|
| `docs/appysentinel-spec.md` | Design-of-record — now has WHY sections |
| `docs/pattern-catalogue.md` | Capability matrix + gap tracker |
| `CONTEXT.md` | 8-dimension system snapshot |
| `.mochaccino/` | Mochaccino workspace root — serve from here |
| `.mochaccino/documentation/data/` | Peter's data files (4 files) |
| `.mochaccino/documentation/designs/` | Mocha's rendered views |
| `packages/core/src/` | 7 baked-in primitives — all implemented, 27 tests passing |
| `~/dev/ad/apps/appyradar-sentinal/docs/discovery.md` | Pilot 1 discovery |
| `~/dev/clients/supportsignal/sentinal.supportsignal/docs/discovery.md` | Pilot 2 discovery |
| `github.com/appydave/appysentinal` | Remote — main branch, up to date |

---

*End of handover. Start next session by reading `docs/appysentinel-spec.md` §5 and §7, then fix the `snapshot → state` naming before doing anything else.*
