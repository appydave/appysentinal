# Documentation Workspace — Revision Log

---

## 2026-04-27 — Session 3 update

### Views updated: 01, 02, 03, 04 | View created: 05

**01 — What is AppySentinel** (minor)
- Added `getting_started` section: `npx create-appysentinel` command + three lifecycle moments (Scaffold/Build/Deploy)
- HTML: new `.moments-flow` 3-column grid renders the three moments below the umbrellas diagram
- Date updated: 2026-04-27

**02 — Architecture Overview** (medium)
- Foundation layer: added `status` field to all 7 items (baked); added `planned_additions` array with 4 coming items (health probe, dataDir, PID file, self-telemetry)
- Operational layer: added `type` field; launchd/systemd marked `template-artifact`, pm2/docker remain `recipe`
- HTML: new `renderPlannedAdditions()` renders planned items with dashed-border "coming" treatment; item count shows "7 baked + 4 planned"; template/recipe badges on operational items
- Date updated: 2026-04-27

**03 — Pattern Capability Matrix** (major)
- Added `build_status` section: 46 tests (up from 27), CI info, pre-push hook info
- Status legend: added `planned-core` (🔧) and `template` (📦)
- Foundation section: added F7–F10 (health probe, dataDir, PID file, self-telemetry) as `planned-core`
- Operational section: O1 changed from `recipe` to `template`; O2 (systemd) added as `template`; O3/O4 (pm2, docker) added as `recipe`
- Gap summary: added gaps 6–8 (health probe, dataDir+PID, self-telemetry) with `type: "core"` tag
- HTML: new CSS for `planned-core` (dashed amber border) and `template` (solid green) status styles; build-status bar in header; `core` gap items highlighted differently
- Date updated: 2026-04-27

**04 — Recipe Catalog** (surgical)
- register-as-launchd: status `planned` → `template-artifact`, description updated to explain install-service.sh
- register-as-systemd: same
- register-as-pm2 and register-as-docker: added as `planned` recipes (were missing)
- HTML: new CSS for `template-artifact` cards (blue treatment); legend updated; status count updated to show template artifacts separately
- Date updated: 2026-04-27

**05 — Developer Workflow** (new)
- Data: three moments (Scaffold/Build/Deploy) + CI pipeline section with two workflows and published package versions
- HTML: lifecycle-flow layout — moment pipeline at top, then three detail sections, then CI/CD section
- Shape: `lifecycle-flow` (new shape not used in prior views)
- Added to mockups.json

---

## 2026-04-26 — Session 2 (prior session)

### Views created: 01, 02, 03, 04

- Initial four views built
- Server bug found: HTML was opened via file://, fetch() blocked. Fix: serve via http://localhost:7420/
- Gallery card links fix: use numbered slug paths (01-slug/) not bare slugs
