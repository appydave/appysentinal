# Learnings

## Rules
<!-- Read on every activation. Hard constraints. -->
- [user-mandated] Do not add .mochaccino/ to .gitignore — generated files are kept in version control.
- [user-mandated] Do not ask about tone or reference interfaces before reading the documentation — let content shape form.

## Recurring Notes
<!-- Read on every activation. Patterns worth watching. -->
- Gallery (designs/index.html) must be generated after EVERY render, not just at the end. Missed this on first render — user had to prompt for it.

## Observations
<!-- NOT loaded on activation. Reviewed at session end for promotion. -->

### 2026-04-26
- Structuring data for Peter surfaced documentation gaps that reading the spec did not. If Peter can't build the shape from the prose, the prose is missing something. This is a feature, not a bug.
- §7.0 "umbrella" concept never defined in spec — visualisation exposed this immediately (labels said "Boundary Umbrella 1" which is meaningless).
- §7.2 storage — spec had no WHY, only a table. Captured this session: file-first = zero setup, droppable, no support burden; snapshot = current state; JSONL = event history; memory buffer = ephemeral high-frequency only.
- Four directions in §3 (collect, expose, deliver, config-pull) but only three umbrellas modelled — gap confirmed and documented as open design decision.
- Expose confirmed bidirectional: read surface + potential local control surface. Config-pull parked under Expose as open.
- Server/fetch bug: Mocha opened HTML via file:// which blocked fetch(). Fix: always start local server first, open via http://localhost:7420/. (Path 2 — fix applied to mocha/SKILL.md in appydave-plugins.)
- Gallery card links use slug without NN- prefix — 404s because actual folders use numbered slugs. (Path 2 — pending fix in appydave-plugins.)
