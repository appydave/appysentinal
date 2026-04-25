# AppyStack Research & Architecture Guide

**Last Updated**: 2026-04-25  
**Research Depth**: Comprehensive (source code, documentation, templates, CLI, recipes)  
**Target**: Understanding AppyStack patterns for application to AppySentinel

---

## 1. What is AppyStack?

AppyStack is a **production-ready full-stack boilerplate and configuration package** that standardizes the architecture of web applications built on the RVETS stack. It consists of three components:

### Purpose
- **Consistency**: Every new project starts with identical architecture, tools, and patterns
- **Quality by default**: Linting, formatting, testing, and type safety are non-negotiable from day one
- **Real-time capable**: Socket.io is integrated and wired by default, not bolted on later
- **Proof-tested**: Validated across 4 production applications (FliGen, FliHub, FliDeck, Storyline App)

### Core Philosophy
> **"Start production-ready. Don't bolt on quality later."**

AppyStack gives you:
- One-command project scaffolding
- Three-package npm workspaces monorepo (client, server, shared)
- Shared ESLint, TypeScript, Prettier, and Vitest configurations
- Real-time bidirectional communication via Socket.io
- Recipe system for scaffolding common app patterns (CRUD, navigation, APIs)
- Upgrade mechanism to pull in template improvements after initial scaffold

---

## 2. RVETS Stack Definition

RVETS is an acronym for the core technologies:

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **R** | React | 19+ | Frontend component model and ecosystem |
| **V** | Vite | 7+ | Build tool with fast HMR and ESM-native philosophy |
| **E** | Express | 5+ | Backend HTTP server framework |
| **T** | TypeScript | 5.7+ | Type-safe language across full stack |
| **S** | Socket.io | 4.8+ | Real-time bidirectional communication |

### Why These Choices?

**React 19**: Modern component model, hooks ecosystem, excellent DevTools, large community

**Vite 7**: Instant HMR feedback, ESM-native bundling, faster builds than webpack, excellent DX

**Express 5**: Mature middleware ecosystem, async/await support, flexible routing

**TypeScript**: Compile-time type safety across client, server, and shared code. Errors caught before runtime.

**Socket.io**: WebSocket abstraction with fallbacks, room support, type-safe event contracts via generics

### Quality Tooling (Always Included)

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit/integration testing (client + server) |
| **Testing Library** | React component testing with semantic queries |
| **Supertest** | HTTP endpoint testing |
| **ESLint 9** | Flat config linting |
| **Prettier** | Opinionated formatting (100 width, single quotes, semicolons) |
| **Zod** | Runtime schema validation for env vars |
| **Pino** | Structured logging |
| **Helmet** | Security headers |
| **CORS** | Cross-origin request control |

---

## 3. The Three Components of AppyStack

### 3a. The Template (`template/`)

A complete, copy-able RVETS boilerplate at `/Users/davidcruwys/dev/ad/apps/appystack/template/`.

**What it includes:**
- `client/` — React 19 + Vite 7 + TailwindCSS v4, ready to run
- `server/` — Express 5 + Socket.io + Pino, ready to run
- `shared/` — TypeScript interfaces shared by client and server
- `.claude/skills/` — Claude Code skills (recipe, app-idea, mochaccino)
- `.github/workflows/ci.yml` — GitHub Actions CI pipeline
- `scripts/start.sh` — Overmind-based persistent dev server launcher
- Complete test suite (81 tests across client and server)
- Docker setup (Dockerfile, docker-compose.yml)
- E2E tests (Playwright)

**Not a running app**: The template is a scaffold, not an application that runs itself. You copy it, customize it, and develop inside it.

### 3b. The Config Package (`config/`)

Published as `@appydave/appystack-config` on npm (v1.0.3).

Exports four categories of configurations:

#### ESLint
- `eslint/base.config.js` — Base rules for Node/server projects (ESLint 9 flat config)
- `eslint/react.config.js` — Extends base, adds React/hooks-specific rules

**Usage:**
```javascript
import appyConfig from '@appydave/appystack-config/eslint/react';
export default [...appyConfig];
```

#### TypeScript
- `typescript/base.json` — Base config (ES2022, bundler resolution, strict mode)
- `typescript/react.json` — Extends base, adds DOM libs and JSX
- `typescript/node.json` — Extends base, adds file compilation (outDir, rootDir)

**Usage:**
```json
{ "extends": "@appydave/appystack-config/typescript/react" }
```

#### Prettier
- `.prettierrc` — Single quotes, 100 width, semicolons, trailing commas
- `.prettierignore` — Standard ignore patterns

**Usage:**
```json
{ "prettier": "@appydave/appystack-config/prettier" }
```

#### Vitest
- `vitest/server.config.ts` — Pre-configured for server-side testing
- `vitest/client.config.ts` — Pre-configured for client-side testing

**Usage:**
```typescript
import { mergeConfig } from 'vitest/config';
import appyConfig from '@appydave/appystack-config/vitest/server';
export default mergeConfig(appyConfig, { /* overrides */ });
```

**Benefits**: Change lint/test/format rules once, all consumer apps inherit the change immediately.

### 3c. The Scaffolding CLI (`create-appystack/`)

Published as `create-appystack` on npm (v0.4.12).

Two binaries:
- `create-appystack` — Scaffolds a new project
- `appystack-upgrade` — Pulls template improvements into existing projects

#### Scaffolding CLI: `create-appystack`

**Usage:**
```bash
# Interactive (prompts for all values)
npx create-appystack@latest my-app

# Non-interactive with flags
npx create-appystack@latest my-app \
  --scope @myorg \
  --port 5500 \
  --server-port 5501 \
  --description "My amazing app" \
  --github-org myorg \
  --public
```

**What it does:**
1. Validates project name (lowercase, hyphens, numbers only)
2. Prompts for scope, ports, description, optional GitHub org
3. Copies `template/` to the target directory
4. **String-replaces** throughout the project:
   - Package names: `@appystack-template` → user scope
   - Ports: 5500/5501 → user ports
   - Defaults in config files
   - HTML titles
   - README references
5. Installs dependencies
6. Initializes git with first commit (optional GitHub repo creation)
7. Writes `appystack.json` with CLI version and scaffold commit SHA (upgrade baseline)

**Key implementation details:**
- Uses `@clack/prompts` for interactive prompts
- String replacement via `.split(from).join(to)` (simple, zero-dependency, easy to audit)
- Excludes `node_modules`, `dist`, `coverage` from copy
- Files are classified: package.json, .env.example never auto-customized (developer owns them)

#### Upgrade CLI: `appystack-upgrade`

**Usage:**
```bash
# From inside an existing scaffolded project
npx appystack-upgrade

# Non-interactive mode (defaults to 'skip' on prompts)
npx appystack-upgrade --yes
```

**What it does:**
1. Reads `appystack.json` to determine scaffold version baseline
2. Walks all template files
3. **Classifies each file** into one of four tiers:
   - `auto` — safe to overwrite (CI workflows, middleware, skills)
   - `recipe` — skill files; shows diff and prompts before merge
   - `never` — files developers own (package.json, app code, server index)
4. Applies auto files silently
5. Prompts on recipe files
6. Leaves `never` files untouched
7. Writes `UPGRADE_TODO.md` with any files requiring manual attention
8. Updates `appystack.json` with `lastUpgrade` date

**Safety guarantees**: App code in `client/src/`, `server/src/`, `shared/src/` is **never** touched. Config improvements land automatically. Skill files get reviewed before merge.

---

## 4. Monorepo Architecture

Every AppyStack project uses **npm workspaces** with three packages:

### Directory Layout

```
project-root/
├── package.json                    # Root workspace config
├── .env                            # Secrets (not in git)
├── .env.example                    # Template with defaults
├── eslint.config.js                # ESLint 9 flat config
├── .prettier*                      # Prettier settings
├── .husky/                         # Git hooks
├── .github/workflows/ci.yml        # GitHub Actions CI
├── .claude/                        # Claude Code context
│   └── skills/                     # Recipe, app-idea, mochaccino
├── scripts/
│   ├── start.sh                    # Overmind launcher
│   └── customize.ts                # Re-run customization
├── data/                           # Runtime-written JSON files (root, not in server/)
│
├── client/                         # React 19 + Vite 7 + TailwindCSS v4
│   ├── package.json                # Scoped: @scope/client
│   ├── tsconfig.json               # Extends @appydave/appystack-config/typescript/react
│   ├── vite.config.ts              # Dev proxy config
│   ├── vitest.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                # Entry point
│       ├── App.tsx                 # Root component
│       ├── components/             # Reusable UI components
│       ├── pages/                  # Page/view components
│       ├── hooks/                  # Custom hooks
│       ├── contexts/               # React Context for state
│       ├── lib/                    # Utilities and helpers
│       ├── styles/                 # TailwindCSS
│       ├── demo/                   # Throwaway demo components (delete when building real app)
│       ├── test/                   # Test setup
│       └── utils/
│
├── server/                         # Express 5 + Socket.io + Pino + Zod
│   ├── package.json                # Scoped: @scope/server
│   ├── tsconfig.json               # Extends @appydave/appystack-config/typescript/node
│   ├── vitest.config.ts
│   ├── nodemon.json                # Watch config (watches src/**/*.ts)
│   └── src/
│       ├── index.ts                # Express app + Socket.io setup
│       ├── config/
│       │   ├── env.ts              # Zod-validated environment config
│       │   └── logger.ts           # Pino logger
│       ├── middleware/
│       │   ├── requestLogger.ts    # HTTP request logging
│       │   ├── errorHandler.ts     # Global error handler
│       │   ├── rateLimiter.ts      # Express rate limiting
│       │   └── validate.ts         # Zod request validation
│       ├── routes/
│       │   ├── health.ts           # GET /health
│       │   └── info.ts             # GET /api/info
│       ├── helpers/                # Utility functions
│       └── test/                   # Test utilities
│
└── shared/                         # TypeScript interfaces only (no runtime code)
    ├── package.json                # Scoped: @scope/shared
    ├── tsconfig.json               # Extends @appydave/appystack-config/typescript/base
    └── src/
        ├── types.ts                # All TypeScript interfaces
        ├── constants.ts            # SOCKET_EVENTS, etc.
        └── index.ts                # Barrel exports
```

### Why Three Packages?

**Separation of concerns:**
- **Client** imports shared types and runs in the browser
- **Server** imports shared types and runs on Node.js
- **Shared** contains only type definitions (no runtime code, no dependencies)

**Build order:**
1. Build shared first (types only, instant)
2. Build server (can import shared)
3. Build client (can import shared)

**NPM workspace references:**
All three packages reference each other by scoped name:
```typescript
// In client or server code
import type { User } from '@scope/shared';
import { SOCKET_EVENTS } from '@scope/shared';
```

### Port Convention

| Layer | Port | Rationale |
|-------|------|-----------|
| Client (Vite dev) | 5X00 | Dev proxy routes /api and /socket.io to server |
| Server (Express) | 5X01 | 100 block per project |

Example: `FliHub` uses 5100/5101, `FliDeck` uses 5200/5201, template defaults to 5500/5501.

**Canonical registry**: `~/dev/ad/brains/brand-dave/app-port-registry.md` tracks all assigned ports.

---

## 5. Environment Configuration (Zod)

Zod validates all environment variables at server startup. If validation fails, the server exits immediately with a clear error.

### Template Pattern

```typescript
// server/src/config/env.ts
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ 
  path: path.resolve(process.cwd(), '..', '.env'), 
  override: true  // critical: override stale shell env vars
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5501),
  CLIENT_URL: z.string().default('http://localhost:5500'),
  // Add project-specific env vars here
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
```

### Key Details

**Path resolution**: `process.cwd()` is `server/` when nodemon runs. Path resolves to `<root>/.env`.

**Override flag**: Critical. Without it, stale `PORT` values from the shell environment shadow `.env` values.

**Failure is fatal**: Any validation error terminates the server. No silent misconfiguration.

### .env.example Template

```bash
# Template defaults (customized at scaffold time)
NODE_ENV=development
PORT=5501
CLIENT_URL=http://localhost:5500

# Add project-specific variables here as needed
```

---

## 6. Real-Time Architecture with Socket.io

Socket.io is integrated at scaffold time, not as an optional layer.

### Type-Safe Event Contracts

All events are typed via TypeScript generics. Event names and payloads are validated at compile time.

#### Shared Type Definitions

```typescript
// shared/src/types.ts
export interface ServerToClientEvents {
  'server:pong': (data: { message: string; timestamp: string }) => void;
  'entity:list:result': (data: { entity: string; records: unknown[] }) => void;
  'entity:created': (data: { entity: string; record: unknown }) => void;
  // ... etc
}

export interface ClientToServerEvents {
  'client:ping': () => void;
  'entity:list': (payload: { entity: string }) => void;
  // ... etc
}

// shared/src/constants.ts (always use constants, not string literals)
export const SOCKET_EVENTS = {
  CLIENT_PING: 'client:ping',
  SERVER_PONG: 'server:pong',
  ENTITY_LIST: 'entity:list',
  ENTITY_LIST_RESULT: 'entity:list:result',
  // ... etc
} as const;
```

#### Server Setup

```typescript
// server/src/index.ts
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@scope/shared';
import { SOCKET_EVENTS } from '@scope/shared';

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: env.CLIENT_URL, methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');

  socket.on(SOCKET_EVENTS.CLIENT_PING, () => {
    socket.emit(SOCKET_EVENTS.SERVER_PONG, {
      message: 'pong',
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Client disconnected');
  });
});
```

#### Client Hook Pattern

```typescript
// client/src/hooks/useSocket.ts
import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@scope/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket() {
  const socketRef = useRef<AppSocket | null>(null);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    return () => {
      socket.close();
    };
  }, []);

  return { socket: socketRef.current };
}
```

### CORS Configuration

Client and server have explicit CORS rules:
```typescript
cors: {
  origin: env.CLIENT_URL,  // Only allow requests from the frontend
  methods: ['GET', 'POST'],
},
```

### Vite Dev Proxy

During development, Vite proxies `/api` and `/socket.io` to the server:

```typescript
// client/vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://localhost:${SERVER_PORT}`,
      },
      '/socket.io': {
        target: `http://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
});
```

So the client always hits `http://localhost:5500/api/...` and the proxy rewrites it to `http://localhost:5501/api/...`.

---

## 7. Recipes: App Architecture Patterns

Recipes are Claude Code skills that scaffold common architectural patterns into an existing AppyStack project. They are composition-friendly, idempotent, and stack-aware.

### Recipe System Architecture

**Location**: `.claude/skills/recipe/` in every scaffolded project

**Components:**
- `SKILL.md` — Recipe skill descriptor (what recipes exist, how to trigger them)
- `references/` — One markdown spec per recipe (the blueprint)
- `domains/` — Domain DSLs for specific application contexts

### Available Recipes (v0.4.12)

| Recipe | What it builds | Composable? |
|--------|---|---|
| `nav-shell` | Left-sidebar collapsible nav + header + content panel | Yes, with file-crud |
| `file-crud` | JSON file persistence for entities + Socket.io sync | Yes, with nav-shell |
| `entity-socket-crud` | Generic `useEntity` hook + Socket.io pattern | Yes, extends file-crud |
| `api-endpoints` | REST API layer with OpenAPI/Swagger | Yes, extends file-crud |
| `add-orm` | Prisma or Drizzle ORM (replaces JSON) | Replaces file-crud |
| `add-auth` | JWT authentication + protected routes | Yes, any app |
| `add-state` | Zustand store (replaces React Context) | Yes, any app |
| `add-tanstack-query` | TanStack Query for HTTP caching | Yes, extends file-crud |
| `add-sync` | Cross-machine sync (Git, shared folders, etc.) | Yes, with file-crud |
| `csv-bulk-import` | CSV upload modal for bulk entity creation | Yes, with file-crud |
| `domain-expert-uat` | Plain-English UAT plan generator | Yes, any app |
| `readme` | Auto-generate polished README from codebase | Yes, any app |
| `appydave-palette` | AppyDave color semantics (visual brand rules) | Yes, before design |
| `wizard-shell` | Multi-step workflow execution UI | Yes, any app |
| `local-service` | Persistent service management (Overmind + Procfile) | Yes, any app |

### Recipe Invocation Flow

1. **Trigger**: Developer says "What recipes are available?" or "I want a CRUD app"
2. **Load references**: Skill loads the relevant recipe spec markdown files
3. **Collect context**: Asks questions specific to the recipe (entity names, nav items, etc.)
4. **Generate prompt**: Creates a concrete, project-specific build prompt with real file paths
5. **Show & confirm**: "Here's what I'll build: [specific details]. Proceed?"
6. **Build**: Claude scaffolds the pattern following the reference spec

### Example: `nav-shell` Recipe

**Intent**: Scaffold a collapsible left-sidebar navigation shell.

**What it asks:**
- App name (for header)
- Main tools/pages (2-6 items)
- How to group them
- Which are primary vs secondary
- Does any tool need a context-aware submenu?
- Include a footer/status bar?

**What it builds:**
- `client/src/components/AppShell.tsx` — outer layout
- `client/src/components/Header.tsx` — app title + actions
- `client/src/components/Sidebar.tsx` — collapsible nav
- `client/src/components/SidebarGroup.tsx` — nav group with primary/secondary items
- `client/src/components/ContentPanel.tsx` — view switcher
- `client/src/views/` — stub components for each nav item (one per tool)
- `client/src/config/nav.ts` — nav structure as data
- `client/src/contexts/NavContext.tsx` — shell state (activeView, collapsed, contextNav)

**Does NOT touch:**
- Server code
- Data layer
- `App.tsx` entry point (only mounts AppShell)

**Idempotency**: If `client/src/components/AppShell.tsx` already exists, skip unless `--force`.

### Example: `file-crud` Recipe

**Intent**: Scaffold JSON file persistence for entities with real-time Socket.io sync.

**What it asks:**
- Entity definitions (name, fields, types, relationships)
- Which field is "namish" (used to name the file slug)

**What it builds:**
- `server/src/data/fileStore.ts` — entity-agnostic read/write/delete functions
- `server/src/data/idgen.ts` — 5-char ID generator
- `server/src/data/watcher.ts` — chokidar file watcher
- `server/src/routes/{entity}.ts` — REST endpoints per entity
- `server/src/sockets/{entity}Handlers.ts` — Socket.io event handlers
- `shared/src/types/{entity}.ts` — TypeScript interfaces per entity
- `data/{entity-plural}/` — folder structure on disk

**Data format**: Each record is `{name-slug}-{5char-id}.json`

Example:
```json
// data/companies/acme-corp-x9q2m.json
{
  "name": "Acme Corp",
  "status": "active",
  "abn": "12345678901",
  "createdAt": "2026-01-15T10:30:00Z",
  "updatedAt": "2026-01-15T10:30:00Z"
}
```

**Socket.io contract:**
```typescript
// Client → Server
socket.emit('entity:list',   { entity: 'company' })
socket.emit('entity:get',    { entity: 'company', id: 'x9q2m' })
socket.emit('entity:save',   { entity: 'company', record: { name: 'Acme', status: 'active' } })
socket.emit('entity:delete', { entity: 'company', id: 'x9q2m' })

// Server → Client(s)
socket.emit('entity:list:result', { entity: 'company', records: [...] })  // to requester only
io.emit('entity:created',   { entity: 'company', record: {...}, index: {...} })  // broadcast
io.emit('entity:updated',   { entity: 'company', record: {...}, index: {...} })  // broadcast
io.emit('entity:deleted',   { entity: 'company', id: 'x9q2m' })  // broadcast
io.emit('entity:external-change', { entity: 'company', changeType: 'add'|'change'|'unlink', id: 'x9q2m' })
```

**Why file-based persistence?**
- No database setup or migrations
- Human-readable data (edit directly if needed)
- Git-friendly (one file per record, no index conflicts)
- Good for local/team-based tools
- Easy to export/backup
- Single-machine or shared-folder sync patterns

### Composing Recipes

Recipes are designed to work together:

**`nav-shell` + `file-crud`** = complete CRUD app
1. First, apply `nav-shell` with entity names as nav items
2. Shell generates view stubs
3. Then apply `file-crud` with the same entities
4. CRUD recipe generates data layer
5. Developer wires the `useEntity` hook into view stubs

**`file-crud` + `api-endpoints`** = local data + external API
1. Set up JSON persistence
2. Layer REST endpoints on top
3. Add API key auth and CORS for external callers

**All three** = full-stack CRUD app with UI, persistence, and public API

### Domain DSLs: Pre-Built Entity Definitions

Domain DSLs are structured markdown documents that define **every entity in a specific application domain** — fields, types, relationships, namish fields, classification, and suggested nav mapping.

#### Included Domains

**Care Provider Operations** (`care-provider-operations.md`)
- 6 entities: Company, Site, User, Participant, Incident, Moment
- Use case: Residential disability support (NDIS context, Australian)
- Entities are hierarchical: Company → Sites → Users/Participants → Incidents/Moments

**YouTube Launch Optimizer** (`youtube-launch-optimizer.md`)
- 5 entities: Channel, Video, Script, ThumbnailVariant, LaunchTask
- Use case: Video production pipeline with script approval and thumbnail variants

#### Creating Custom Domain DSLs

Format spec in `references/domain-dsl.md`:
```markdown
# Domain: [Name]

## Entities

### EntityName
Description and rationale.

| Field | Type | Notes |
|-------|------|-------|
| name | string | **namish field** — used in filename slug |
| status | enum | 'active' / 'inactive' |
| createdAt | string | ISO 8601 timestamp |

Namish field: `name`
Relationships: (if any)

## Entity Classification

| Entity | Type | Notes |
|--------|------|-------|
| EntityName | System/Domain/Config | |

## Suggested Nav Mapping

| Nav Item | View Key | Entity | Tier |
|----------|----------|--------|------|
```

### Recipe Triggering

**From inside an AppyStack project, ask Claude:**

- "What recipes are available?"
- "I want to build a CRUD app"
- "Build me a nav-shell"
- "Scaffold a file-based entity system"
- "How do I set up authentication?"

The recipe skill auto-loads from `.claude/skills/recipe/SKILL.md` and walks through the flow.

**Outside an AppyStack project**, the recipe skill does not load (it ships inside the template only).

---

## 8. Key File Locations and Customization Points

### Client Application

```
client/src/
├── main.tsx                    # Entry point; calls React.createRoot
├── App.tsx                     # Root component; mount AppShell or custom layout
├── pages/                      # Page/view components
│   ├── LandingPage.tsx         # Initial landing page (has TODO: replace me)
│   └── DemoPage.tsx            # Demo page (delete when building real app)
├── components/                 # Reusable UI components
│   └── ...your components
├── hooks/
│   ├── useSocket.ts            # Socket.io connection hook (do not delete)
│   ├── useServerStatus.ts      # Fetches /health and /api/info
│   └── ...your custom hooks
├── contexts/                   # React Context providers
│   └── ...your contexts
├── lib/
│   ├── entitySocket.ts         # Socket.io CRUD helper (generic)
│   └── ...your utilities
├── styles/
│   └── index.css               # TailwindCSS v4 (uses @import syntax, not @tailwind)
├── demo/                       # Throwaway demo code (delete entirely when building)
│   ├── DemoPage.tsx
│   ├── StatusGrid.tsx
│   ├── TechStackDisplay.tsx
│   └── SocketDemo.tsx
├── test/
│   └── setup.ts                # Test environment setup (mocks, globals)
└── vite-env.d.ts               # Vite type definitions
```

### Server Application

```
server/src/
├── index.ts                    # Express app setup, Socket.io, middleware chain
├── config/
│   ├── env.ts                  # Zod-validated environment (TODO: extend schema)
│   └── logger.ts               # Pino logger instance
├── middleware/
│   ├── requestLogger.ts        # HTTP request logging
│   ├── errorHandler.ts         # Global error handler
│   ├── rateLimiter.ts          # Express rate limiting
│   └── validate.ts             # Zod request validation helper
├── routes/
│   ├── health.ts               # GET /health (liveness probe)
│   └── info.ts                 # GET /api/info (server metadata)
├── helpers/
│   └── ...utility functions
├── sockets/                    # Socket.io event handlers (empty, populate per recipe)
│   └── ...event handler files
├── data/                       # (Generated by file-crud recipe)
│   ├── fileStore.ts
│   ├── idgen.ts
│   └── watcher.ts
└── test/
    ├── app.test.ts             # Express app tests
    ├── socket.test.ts          # Socket.io event tests
    ├── shutdown.test.ts        # Graceful shutdown tests
    └── static.test.ts          # Static file serving tests
```

### Shared Types

```
shared/src/
├── types.ts                    # All TypeScript interfaces
│                              # TODO: extend with your domain types
├── constants.ts                # SOCKET_EVENTS constant map
├── schemas/                    # (Generated by zod-schema recipe)
│   ├── entity.ts
│   ├── {entity}.ts
│   └── index.ts
└── index.ts                    # Barrel exports
```

### Important TODO Markers

Search for "TODO" to find customization points:
- Package scopes
- Port numbers
- ASCII banner branding
- Shared type interfaces
- Server index.ts route mounting
- App component entry point

---

## 9. Configuration Files

### Root `package.json`

```json
{
  "name": "@scope/root",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev": "npm run build -w shared && concurrently ... npm run dev -w server npm run dev -w client",
    "build": "npm run build -w shared && npm run build -w server && npm run build -w client",
    "test": "npm test -w server -w client",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "npm run typecheck -w shared -w server -w client"
  }
}
```

Scripts run either on all workspaces (`npm run lint`) or specific ones (`npm run dev -w server`).

### Root `eslint.config.js`

```javascript
import appyConfig from '@appydave/appystack-config/eslint/react';
export default [...appyConfig];
```

Three lines. Imports base + React rules from the shared config package.

### `.env.example`

```bash
NODE_ENV=development
PORT=5501
CLIENT_URL=http://localhost:5500
VITE_API_URL=http://localhost:5500/api
VITE_SOCKET_URL=http://localhost:5501
VITE_APP_NAME=AppyStack Template
```

Copy to `.env` before first start. Customize for your app.

### `server/tsconfig.json`

```json
{
  "extends": "@appydave/appystack-config/typescript/node",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "**/*.test.ts"]
}
```

Extends the shared config, adds output settings for compilation.

### `client/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5500,
    proxy: {
      '/api': { target: 'http://localhost:5501', changeOrigin: true },
      '/health': { target: 'http://localhost:5501' },
      '/socket.io': { target: 'http://localhost:5501', ws: true },
    },
  },
});
```

Dev proxy routes API and Socket.io requests to the backend.

### `Procfile` (for Overmind)

```
server: npm run dev -w server
client: npm run dev -w client
```

Tells Overmind how to start each service.

### `scripts/start.sh`

```bash
#!/bin/bash
set -e

# Load .env
export $(cat .env | xargs)

# Port check and cleanup
# Then: npm run build -w shared && overmind start
```

Persistent dev server launcher using Overmind. Survives terminal close, allows attach/detach.

---

## 10. Testing Patterns

### Server Testing (Vitest + Supertest)

```typescript
// server/src/routes/health.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

**Key pattern**: Import the Express app directly (not the server), use Supertest to make HTTP requests.

### Client Testing (Vitest + Testing Library)

```typescript
// client/src/pages/LandingPage.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LandingPage from './LandingPage';
import { useServerStatus } from '../hooks/useServerStatus';

vi.mock('../hooks/useServerStatus');

describe('LandingPage', () => {
  it('renders the landing page', () => {
    vi.mocked(useServerStatus).mockReturnValue({ status: 'ok', info: null });
    render(<LandingPage />);
    expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
  });
});
```

**Key pattern**: Mock hooks and services, render component, query by role/text.

### Socket.io Testing

```typescript
// server/src/socket.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';

describe('Socket.io event handlers', () => {
  let io: Server;
  let client;

  beforeAll((done) => {
    const httpServer = createServer();
    io = new Server(httpServer, { cors: { origin: '*' } });
    // Setup handlers
    io.on('connection', (socket) => {
      socket.on('client:ping', () => {
        socket.emit('server:pong', { message: 'pong', timestamp: new Date().toISOString() });
      });
    });
    httpServer.listen(() => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' ? addr.port : 0;
      client = ioc(`http://localhost:${port}`, { reconnection: false });
      client.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    client.close();
  });

  it('client:ping → server:pong', (done) => {
    client.emit('client:ping');
    client.on('server:pong', (data) => {
      expect(data.message).toBe('pong');
      done();
    });
  });
});
```

**Key pattern**: Create real HTTP server on port 0, attach Socket.io, connect real client, assert events.

---

## 11. CI/CD Pipeline

### GitHub Actions Workflow

`.github/workflows/ci.yml` runs on every push:

1. **Lint** — ESLint across all files
2. **Typecheck** — TypeScript strict mode
3. **Build** — shared → server → client
4. **Unit tests** — Vitest (server + client)
5. **Coverage** — Report coverage %
6. **E2E tests** — Playwright smoke tests

All checks must pass before merge.

### Local Checks Before Commit

Husky + lint-staged automatically:
1. Run Prettier on staged files
2. Run ESLint --fix on TypeScript files
3. Prevent commit if linting/formatting fails

```json
// package.json
"lint-staged": {
  "*.{ts,tsx,js,json,css,md}": "prettier --write",
  "*.{ts,tsx,js}": "eslint --fix"
}
```

---

## 12. Common Architectural Decisions

### Why Data Lives at Project Root, Not in `server/src/`

**Problem**: nodemon watches `server/src/**/*.ts` for code changes. If data files are written inside `src/`, any write triggers a server restart. Restarting processes can't bind the port before the old one releases it → `EADDRINUSE` crash.

**Solution**: Write all runtime data to `project-root/data/`. Nodemon doesn't watch it, no restart loops.

**Path construction**:
```typescript
const DATA_ROOT = process.env.DATA_DIR ?? path.resolve(process.cwd(), '..', 'data');
```

Since `process.cwd()` is `server/` when nodemon runs, `..` goes to the project root.

### Why String Replacement, Not a Templating Engine

The CLI uses `.split(from).join(to)` to customize projects.

**Tradeoffs:**
- ✅ Zero dependencies
- ✅ Easy to audit (no template syntax)
- ✅ Template is a real, runnable project (not template syntax)
- ✅ Simple implementation
- ❌ If placeholder strings change, upgrade code must keep pace

**Alternatives rejected:**
- Mustache/Handlebars/EJS — adds runtime dependency, requires template syntax everywhere
- Programmatic file rewriting — more complex, harder to understand

### Why Zod for Environment Variables

**Benefits:**
- Single source of truth for schema
- Runtime validation (catches misconfiguration at startup, not later)
- Clear error messages
- Coercion (string → number for PORT)
- Defaults
- Type inference for TypeScript

**Example:**
```typescript
const envSchema = z.object({
  PORT: z.coerce.number().default(5501),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});
```

### Why Socket.io Over REST-Only

**Socket.io gives:**
- Real-time updates pushed to clients (no polling)
- Bidirectional communication
- Room support (broadcast to subsets)
- Automatic reconnection
- WebSocket with graceful fallbacks

**REST remains for:**
- Initial page load (faster, single request)
- Server-to-server calls
- Debugging and tooling
- Caching headers (GET idempotency)

**Pattern**: REST for data read (GET), Socket.io for state changes (create/update/delete broadcasts).

### Why npm Workspaces Over Separate Repos

**Monorepo benefits:**
- Single `node_modules/` install (faster, less duplication)
- Cross-workspace dependencies resolved instantly
- Single git history for related code
- Coordinated releases (all versions bump together)

**Cost**: Requires discipline (don't create circular dependencies; maintain clear boundaries).

---

## 13. Known Limitations and Open Bugs

### Open Issues (from CONTEXT.md)

1. **`VITE_SOCKET_URL` not replaced during scaffolding**
   - Symptom: Socket.io connects to wrong port (5501 instead of user port)
   - Effect: UI shows "Loading..." forever, no error
   - Workaround: Manually edit `VITE_SOCKET_URL` in `.env`

2. **`.env` not auto-created from `.env.example`**
   - Symptom: `start.sh` fails, developer must manually `cp .env.example .env`
   - Workaround: Add explicit prompt or auto-copy step

3. **`.overmind.sock` stale state**
   - Symptom: `start.sh` hangs if prior session crashed
   - Workaround: Manually `rm -f .overmind.sock` before starting

4. **Stale shell environment overrides `.env`**
   - Symptom: PORT=5171 in shell shadows .env PORT=5501
   - Fixed: Template now uses `override: true` in dotenv config
   - Affect: Projects scaffolded before fix need manual backport

5. **Template sync forgotten before local testing**
   - Symptom: "I changed the template but my scaffolded project doesn't have the change"
   - Root cause: `create-appystack/template/` is a committed copy, not always synced
   - Workaround: `cd create-appystack && npm run sync` before testing

---

## 14. What AppyStack Does NOT Include

These are intentional scope boundaries:

| Concern | Why not | Solutions |
|---------|---------|-----------|
| Database / ORM | App-specific choice | Use the `add-orm` recipe (Prisma, Drizzle) |
| Authentication | App-specific choice | Use the `add-auth` recipe (JWT + protected routes) |
| State management | Multiple valid patterns | Use the `add-state` recipe (Zustand) or Context |
| UI component library | Design system choice | Template uses plain TailwindCSS; ShadCN/Radix are add-ons |
| Email service | Deployment-specific | Integrate Resend, Nodemailer, or SendGrid as needed |
| File uploads | Per-use-case | Add multer middleware per recipe |
| Background jobs | Not required for real-time | Add BullMQ or pg-boss if needed |
| Deployment infrastructure | Hosting-specific | Dockerfile included; no Terraform/CDK |
| GraphQL | REST + Socket.io are sufficient | Not applicable; AppyStack is REST + real-time |

---

## 15. Production Deployment

### Built-in Assets

- **Dockerfile** — Multi-stage production build (build → runtime)
- **Procfile** — Process definitions for platforms like Heroku
- **docker-compose.yml** — Local Docker Compose for testing
- **GitHub Actions CI** — Automated testing on every push

### Environment at Runtime

Production apps set `NODE_ENV=production` and provide:
```bash
NODE_ENV=production
PORT=3000          # Production port
CLIENT_URL=https://myapp.com   # Production URL
```

Server serves the **built client** from `client/dist/`:
```typescript
// server/src/index.ts
if (env.isProduction) {
  const clientDist = join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*splat', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));  // SPA fallback
  });
}
```

### Security Middleware

Production includes:
- **Helmet** — Security headers
- **Compression** — gzip responses
- **CORS** — Cross-origin control
- **Rate limiting** — Prevent abuse
- **Error handling** — No stack traces leaked

---

## 16. npm Publishing

Two packages are published under the `klueless-io` npm account:

### `@appydave/appystack-config` (v1.0.3)

Shared ESLint, TypeScript, Vitest, Prettier configs.

**Usage:**
```bash
npm install --save-dev @appydave/appystack-config
```

**Publish:** From `config/` directory
```bash
npm publish --access public
```

**Frequency**: Whenever lint rules, TS strictness, or test config changes.

### `create-appystack` (v0.4.12)

Scaffolding + upgrade CLI.

**Usage:**
```bash
npx create-appystack@latest my-app
```

**Publish:** From `create-appystack/` directory
```bash
npm publish --access public
```

**prepublishOnly**: Automatically syncs root `template/` → `create-appystack/template/` before publish.

**Frequency**: Whenever template changes (recipes, middleware, CI updates).

### Publishing Workflow

1. Make changes to `template/` or `config/`
2. Test locally
3. `cd` into the package directory
4. `npm publish --access public`
5. Auth token: `appydave-publish` granular token in `~/.npmrc`
6. Token expires **31 May 2026** (rotate at npmjs.com Account → Access Tokens)

---

## 17. Integration with Claude Code

### CLI Skill: `create-appystack`

Scaffolds a **new** AppyStack project from scratch.

**How to use:**
```bash
# Navigate to parent directory
cd ~/dev/apps

# Run the skill or use npx directly
npx create-appystack@latest my-app
```

**Not available inside a scaffolded project** — recipes are the way to extend.

### Recipe Skill (Inside Scaffolded Projects)

The recipe skill **ships inside every scaffolded project** at `.claude/skills/recipe/SKILL.md`.

**How to use**: Open Claude Code inside the project and ask:
- "What recipes are available?"
- "Build me a CRUD app"
- "Scaffold a nav-shell"
- "I want authentication"

**Auto-triggers** from phrases mentioning recipes or feature scaffolding.

### App-Idea Skill

Feature intake and triage system (also ships in template).

**How to use:**
```
/app-idea
```

Walks through capturing, triaging, and closing feature ideas.

### Mochaccino Skill

UI exploration and mockup generation before building.

**How to use:**
```
/mochaccino
```

Generates visual variations for design decisions.

---

## 18. Summary of Key Patterns

### Naming Conventions

| Pattern | Example | Where |
|---------|---------|-------|
| Package scope | `@myorg` | All package.json |
| Workspace names | `client`, `server`, `shared` | package.json workspaces |
| Scoped packages | `@myorg/client`, `@myorg/server` | workspace package.json |
| File names | kebab-case | `.ts`, `.tsx`, `.md` |
| UPPERCASE | `README.md`, `CLAUDE.md` | Standard repo files |
| Ports | `5X00` (client), `5X01` (server) | `.env`, Procfile, docs |
| Entity folders | `companies/`, `sites/` (plurals) | `data/` directory |
| File slug convention | `{name-slug}-{5char-id}.json` | JSON file persistence |

### Directory Structure Rules

| Location | Purpose | Never |
|----------|---------|-------|
| `client/src/` | React components, hooks, pages | Put server code here |
| `server/src/` | Express routes, middleware, handlers | Write runtime data here |
| `shared/src/` | TypeScript interfaces, constants | Runtime logic, dependencies |
| `data/` | Runtime-written JSON files | Place inside `server/src/` (causes restarts) |
| `.claude/skills/` | Claude Code skills | Modify these after scaffold unless instructed |

### TypeScript Import Pattern

All cross-workspace imports use the scoped package name:
```typescript
import type { User } from '@myorg/shared';
import { SOCKET_EVENTS } from '@myorg/shared';
```

Not:
```typescript
import from '../../../shared/src/types';  // DON'T DO THIS
```

---

## Conclusion

AppyStack is a **standardized, production-proven pattern** for building full-stack RVETS applications. It prioritizes:

1. **Type Safety** — TypeScript end-to-end
2. **Real-time Capability** — Socket.io integrated from day one
3. **Quality Enforcement** — Linting, formatting, testing defaults
4. **Extensibility** — Recipes compose architectural patterns
5. **Upgrade Path** — Template improvements pull into existing projects

The stack is opinionated (React, Vite, Express, TypeScript, Socket.io) but leaves app-specific choices (database, auth, state management) to recipes and developer judgment.

For AppySentinel, AppyStack provides a battle-tested foundation with proven patterns for:
- Real-time data synchronization (via Socket.io)
- File-based or database persistence (file-crud or add-orm recipes)
- Type-safe, structured navigation (nav-shell recipe)
- Organized code and enforced quality
- Easy scaffolding and recipe-driven feature development

