# Bug: scaffolded projects ship without a `.gitignore` (node_modules gets committed)

| Field | Value |
|-------|-------|
| **Status** | Fixed in `create-appysentinel@0.2.1` (template + CLI) — pending `npm publish` |
| **Severity** | High — every project scaffolded from the published npm package is affected |
| **Component** | `packages/cli` (`create-appysentinel`) + `packages/template` |
| **Affected version** | `create-appysentinel@0.2.0` (any version published to npm) |
| **Reported** | 2026-06-06 |
| **Reporter** | David Cruwys |
| **First observed in** | `apps/switchboard` initial scaffold |

---

## Summary

Projects created with `npx create-appysentinel` have **no `.gitignore`**. Because the
scaffolder runs `git init` → `bun install` → `git add . && git commit` automatically,
the very first "Initial scaffold" commit captures the entire `node_modules/` tree.

In `apps/switchboard` this meant **4,572 of 4,593 tracked files were dependencies** —
the real source (22 files) was buried under vendored packages.

---

## Environment

- Scaffold path: `npx create-appysentinel` (the **published npm package**, not the monorepo source).
- Observed on macOS (darwin), Bun-based install.
- The bug does **not** reproduce when running the CLI from the monorepo source (`bun run dev`),
  which is why it escaped local testing — see Root cause.

## Steps to reproduce

1. `npx create-appysentinel my-sentinel`
2. `cd my-sentinel`
3. `git ls-files | grep -c node_modules/`

**Expected:** `0` — `node_modules/` is ignored.
**Actual:** thousands of files — `node_modules/` is committed in the initial scaffold commit.

---

## Root cause

This is the well-known **npm `.gitignore` stripping** behaviour (the same issue that
historically bit `create-react-app` and most other `create-*` scaffolders).

When a package is published to npm, **files literally named `.gitignore` are stripped /
renamed inside the package tarball.** npm does this regardless of `files`/`.npmignore`
settings — a `.gitignore` shipped inside a published package is not delivered verbatim to
the consumer.

The template stored its ignore file at `packages/template/.gitignore`. The CLI copies the
template verbatim:

- `packages/cli/src/scaffold.ts` → `copyTemplate()` walks the template and `cpSync`s every file.
- `package.json` `prepack` does `cp -r ../template ./template`, then npm packs it.

So:

| Path | `.gitignore` present? | Result |
|------|----------------------|--------|
| Monorepo dev (`bun run dev`, source template on disk) | ✅ yes | works — file is copied, tests pass |
| Published npm (`npx`, template inside the tarball) | ❌ stripped by npm | scaffolded project has no `.gitignore` |

The automatic `git add . && git commit -m "Initial scaffold"` in `scaffold.ts` (`gitCommit()`)
then commits `node_modules/`.

This split between the dev path (works) and the published path (broken) is why the existing
`scaffold.test.ts` suite — which runs against the on-disk source template — never caught it.

---

## Fix

Standard `create-*` workaround: **never ship a file literally named `.gitignore` inside the
package.** Store it under a neutral name and have the scaffolder restore the dot on copy.

1. **Rename the template file:** `packages/template/.gitignore` → `packages/template/gitignore`
   (no leading dot — npm leaves this name untouched).
2. **Restore the dot during copy:** `copyTemplate()` in `scaffold.ts` maps the source name
   `gitignore` → destination name `.gitignore` via a `RENAME_ON_COPY` table.

This keeps the dev path and published path identical: both copy `gitignore` → `.gitignore`.

## Verification

- New regression test in `packages/cli/test/scaffold.test.ts`:
  - scaffolded project contains a `.gitignore` (with the dot),
  - it ignores `node_modules/`,
  - no stray `gitignore` (without the dot) is left behind.
- `bun run test` in `packages/cli` passes.
- Manual: after publishing, `npx create-appysentinel x && git -C x ls-files | grep -c node_modules/`
  returns `0`.

## Affected existing projects (remediation)

Any project already scaffolded from `0.2.0` needs the same one-time cleanup that was applied
to `switchboard`:

```bash
# add the missing .gitignore (copy from a fresh scaffold or the template)
git rm -r --cached --quiet node_modules
git commit --amend   # if still the lone initial commit, otherwise a new commit
```

`switchboard` has already been remediated (history amended before first push, so no
`node_modules` blobs in its history).

## Follow-ups (optional, not blocking)

- Consider expanding the template ignore list to also cover `data/` (runtime file-projected
  state — see template `CLAUDE.md`), `.idea/`, `.vscode/`, and `.env.*.local`. Today it omits
  the runtime `data/` directory, which a live Sentinel will write into.
