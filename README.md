# AppySentinel

Per-machine, observer-only local data coordinator boilerplate.

Scaffold headless Sentinels that collect data from local sources, normalise it into a Signal envelope, expose it via REST/CLI/MCP, and deliver it outward.

## Quick start

```bash
npx create-appysentinel my-sentinel
cd my-sentinel
bun src/main.ts          # smoke-test
claude                   # start building recipes
```

## Monorepo layout

```
packages/
├── core/      → @appydave/appysentinel-core    — runtime primitives (Signal, bus, lifecycle, config, …)
├── config/    → @appydave/appysentinel-config  — shared ESLint/Prettier/tsconfig
├── cli/       → create-appysentinel            — scaffold CLI (npx)
└── template/  → minimal scaffold (copied by CLI, not published)
```

## Development

```bash
bun install                                         # first-time setup

# Tests
bun run test                                        # all packages
bun run --filter './packages/core' test             # one package
bun run --filter './packages/core' test:watch       # watch mode (Guard equivalent)

# Type checking
bun run typecheck

# Build
bun run build
```

## Pre-push hook (Husky)

Tests and type-checks run automatically before every `git push`. To install the hooks after a fresh clone:

```bash
bun install   # runs `prepare` script which initialises Husky
```

The hook runs `bun run test && bun run typecheck`. A failed push means either tests are broken or types don't compile — fix before pushing.

## Publishing to npm

Packages are published automatically by GitHub Actions when a version tag is pushed:

```bash
git tag v0.1.7
git push origin v0.1.7
```

**Requires** the `NPM_TOKEN` secret to be set in GitHub → Settings → Secrets → Actions. Generate a Granular Access Token at npmjs.com with:
- "Bypass two-factor authentication (2FA)" checked
- Packages and scopes → "Read and write"
- Expiration → 365 days (not 30)

Manual publish (if needed):

```bash
cd packages/cli && npm publish --access public
```

## Packages

| Package | npm | Version |
|---------|-----|---------|
| `create-appysentinel` | `npx create-appysentinel` | 0.1.6 |
| `@appydave/appysentinel-core` | `bun add @appydave/appysentinel-core` | 0.1.0 |
| `@appydave/appysentinel-config` | internal tooling | 0.1.0 |

## License

MIT
