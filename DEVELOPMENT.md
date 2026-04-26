# Developing AppySentinel

This is a Bun-workspaces monorepo with four packages.

## Layout

```
packages/
├── core/      → @appydave/appysentinel-core      — runtime library (the primitives)
├── config/    → @appydave/appysentinel-config    — shared ESLint / TS / Prettier / Vitest configs
├── cli/       → create-appysentinel              — static scaffolding CLI
└── template/  → @appydave/appysentinel-template  — minimal scaffold the CLI copies (not published)
```

## First-time setup

```bash
cd /Users/davidcruwys/dev/ad/apps/appysentinal
bun install
```

Bun resolves workspace symlinks automatically — `packages/template` and `packages/cli` see the local `packages/core` build immediately.

## Common tasks

```bash
# Build core + cli
bun run build

# Run all package tests (Vitest under each)
bun run test

# Typecheck every package
bun run typecheck

# Lint every package
bun run lint

# Test only the core
bun run --filter './packages/core' test

# Watch tests in core
cd packages/core && bun run test:watch
```

## Iterating on `core` while testing the CLI

1. Run `bun run --filter './packages/core' build` once after a change (or run `bun run --filter './packages/core' dev` to keep it watching).
2. Test the CLI by running `bun packages/cli/src/index.ts ../scratch-sentinel` — the symlinked `@appydave/appysentinel-core` is picked up by the scaffolded project's `bun install` step.

## Releasing

Each publishable package owns its own `package.json` version. From the package directory:

```bash
cd packages/core
npm publish --access public

cd ../config
npm publish --access public

cd ../cli
npm publish --access public
```

`packages/template` is consumed *via* the CLI — it is not published independently. The CLI copies it into the user's project, then runs `bun install` against it.

## Notes

- **TypeScript strict mode** is enforced everywhere via `@appydave/appysentinel-config/typescript/node`.
- **Vitest** tests live in `packages/core/test/`; one file per primitive.
- **No code in recipes yet** — recipes are markdown specs (in `docs/`) and will be generated into projects by the configure-sentinel agent.
- Do not edit `docs/` — that folder is the source of truth for the spec, owned by the human author.
