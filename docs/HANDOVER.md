# AppySentinel — Session Handover (2026-04-27, session 3)

This supersedes the prior handover (session 2, 2026-04-26). Do not act on any priority list from earlier versions.

---

## Read in this order

| # | File | Why |
|---|------|-----|
| 1 | `docs/HANDOVER.md` | This file — read first |
| 2 | `docs/appysentinel-spec.md` | §7.6 needs updating (service registration no longer recipes) |
| 3 | `docs/pattern-catalogue.md` | Capability matrix — needs update for session 3 changes |
| 4 | `packages/core/src/` | 7 primitives — 39 tests passing |
| 5 | `packages/cli/` | Scaffold CLI — 7 integration tests, published at 0.1.6 |

---

## What was done this session

### CLI — published versions
- **0.1.3** — removed Layer 2 configure-sentinel handoff from CLI entirely
- **0.1.4** — removed machine identifier prompt; machine now derived from `os.hostname()` at runtime
- **0.1.5** — added service registration scripts to template (launchd + systemd)
- **0.1.6** — CLAUDE.md in template, fixed template package.json bug (had hardcoded name not `{{PROJECT_NAME}}`), added CLI integration tests, closed core 20% test gap

### Template — what every scaffolded project now ships
- `CLAUDE.md` — build/deploy lifecycle, recipe pattern, Signal envelope, three umbrellas, hard rules
- `scripts/install-service.sh` — detects macOS/Linux, registers as always-on service
- `scripts/uninstall-service.sh`
- `scripts/launchd.plist` — macOS launchd template (`{{PROJECT_NAME}}`, `{{PROJECT_DIR}}`, `{{BUN_PATH}}` substituted at install time)
- `scripts/systemd.service` — Linux systemd template
- `.env.example` — MACHINE_NAME now commented-out optional override (not required)
- `src/main.ts` — uses `os.hostname()` not `{{MACHINE_NAME}}` placeholder

### Testing — 27 → 46 tests
- Core: 39 tests (was 27). Added: config edge cases (invalid JSON, array replacement, deep env paths, unsubscribe), lifecycle signal handler registration, health report detail, logger bindings
- CLI: 7 new integration tests against real template in real temp dirs. Found and fixed real bug.
- Escape hatches: `_skipInstall` and `_skipGit` on `ScaffoldOptions` skip shell calls in tests without mocking file I/O

### Infrastructure
- **GitHub Actions CI** — runs on every push to main: install, build core + cli, typecheck all, test all
- **GitHub Actions publish** — triggers on `git tag v*`: tests first, then publishes each package. Idempotent — skips already-published versions
- **Husky pre-push hook** — `bun run test && bun run typecheck` before every `git push`. Installed via `prepare` script on `bun install`
- **Root README.md** — created; documents quick start, dev workflow, publish process, npm token setup
- **npm token** — Granular Access Token, 2FA bypass, read+write, expires ~2026-07-27. **Must rotate by then.**

### Key decisions made this session

| Decision | Outcome |
|----------|---------|
| Machine name at scaffold time | Removed — derived from `os.hostname()` at runtime |
| Service registration (launchd/systemd) | Promoted from recipe (§7.6) to template artifact — ships in every project |
| Layer 2 configure-sentinel | Disabled not removed — re-enable when first pilot has real recipe code |
| Upgrade story | Deliberately deferred — build pilots first, design upgrade around real evidence |
| Classic npm tokens | Gone since Dec 2025 — Granular only, 90-day max for write tokens |
| Integration tests | Real template, real temp dirs, no fs mocking |

---

## Spec drift still to fix

- **§7.6** — `register-as-launchd` and `register-as-systemd` are NO LONGER RECIPES. They're template artifacts. Update or remove from recipe catalog.
- **§8.1** Layer 1 responsibilities — remove machine identifier from list. Note Layer 2 is disabled.

---

## Open loops — priority order

### Priority 1 — Start immediately (pilots)
- **AppyRadar Sentinel**: `cd ~/dev/ad/apps/appyradar-sentinal && claude`
- **SS Data Query Sentinel**: `cd ~/dev/clients/supportsignal/sentinal.supportsignal && claude`
- Write first recipe based on what pilot actually needs — not speculative

### Priority 2 — Core API additions (before or alongside pilots)
These are API changes to `packages/core` — need spec update + tests + version bump:
1. **Health probe** — `GET /health` baked into `createSentinel()`. Raw Node HTTP, no Hono. Port via `HEALTH_PORT` env (default 7300, 0 = disabled)
2. **dataDir** — `sentinel.dataDir` on createSentinel options. Default `~/.local/share/<name>/`. Override via `DATA_DIR` env.
3. **PID file** — written to dataDir on start, removed on stop. Prevents double-start when launchd restarts slow-shutting process.
4. **Self-telemetry heartbeat** — metric signal every 60s: uptime, signals_emitted, errors_caught, bus_subscribers, memory_mb. Baked into createSentinel.

### Priority 3 — Mochaccino views (next visualisation session)
See `.mochaccino/learnings.md` for server instructions.

| View | What changed | Action needed |
|------|-------------|---------------|
| 01 — What is AppySentinel | Three moments (Scaffold/Build/Deploy) now explicit; machine name no longer prompted | Minor update |
| 02 — Architecture overview | Four missing foundational pieces identified (not built); service registration moved out of primitives | Medium update |
| 03 — Pattern capability matrix | Tests 27→46, CI, Husky, template additions, 4 new core gaps, upgrade story deferred | Major update |
| 04 — Recipe catalog | register-as-launchd and register-as-systemd: no longer recipes | Surgical update — mark as "promoted to template" or remove |
| 05 — Developer Workflow | **NEW VIEW** — Scaffold/Build/Deploy moments, watch mode, pre-push hook, CI, publish pipeline | Build from scratch |

### Priority 4 — Housekeeping
- Dead code: `dist/handoff.js` still in CLI tarball — delete before next publish (`rm -rf packages/cli/dist`)
- npm token: expires ~2026-07-27 — calendar reminder to rotate

---

## What NOT to do

- ❌ Do not rebuild upgrade story until pilots are running
- ❌ Do not re-add machine name prompt to CLI
- ❌ Do not re-enable Layer 2 until recipes exist
- ❌ Do not write speculative recipe specs — pilots create the first ones
- ❌ Do not bypass Husky with `--no-verify`

---

## Reference paths

| Path | Purpose |
|------|---------|
| `packages/core/src/` | 7 baked-in primitives |
| `packages/core/test/` | 39 tests |
| `packages/cli/src/scaffold.ts` | Scaffold engine — `_skipInstall`/`_skipGit` escape hatches |
| `packages/cli/test/scaffold.test.ts` | 7 integration tests |
| `packages/template/` | What every `npx create-appysentinel` copies |
| `.github/workflows/ci.yml` | Test + typecheck on push to main |
| `.github/workflows/publish.yml` | Publish on `git tag v*` — idempotent |
| `.husky/pre-push` | Pre-push hook |
| `.mochaccino/` | Mochaccino workspace — `cd .mochaccino && python3 -m http.server 7420` |
| `~/dev/ad/apps/appyradar-sentinal/` | Pilot 1 — AppyRadar Sentinel |
| `~/dev/clients/supportsignal/sentinal.supportsignal/` | Pilot 2 — SS Data Query Sentinel |
| `github.com/appydave/appysentinal` | Remote — main branch |

---

*End of handover. Start next session with pilots OR Mochaccino view updates, depending on David's priority. Read this file first, then relevant package source before touching code.*
