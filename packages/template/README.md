# {{PROJECT_NAME}}

A per-machine, observer-only telemetry collector built on [AppySentinel](https://github.com/appydave/appysentinal).

This project was scaffolded by `create-appysentinel`. It currently contains only the **walking skeleton** — `createSentinel()` is wired up, but no collectors, storage, interface, or transport are configured yet.

## Run it

```bash
bun install
bun run dev
```

You should see a single `sentinel.started` event on stdout, then the process keeps running until you Ctrl-C.

## Configure it

The `configure-sentinel` Claude Code skill walks you through the choices that make this Sentinel actually do something:

```bash
claude -p "Run the AppySentinel configuration interview. Read .claude/skills/configure-sentinel/SKILL.md"
```

The interview covers:

- **Interface** — how external clients talk to this Sentinel (MCP / REST / both / none)
- **Inputs** — what to observe (file watchers, polled commands, hook receivers, ssh orchestration, ...)
- **Storage** — local buffer / persistence (JSONL / SQLite / memory)
- **Transport** — how Signals leave this machine (HTTP push / Socket.io / OTLP / Supabase / file relay / none)
- **Runtime** — how the Sentinel runs (launchd / systemd / pm2 / docker / dev-only)

Choices write code into your project under `src/recipes/` and update `appysentinel.json`.

## What's baked in vs what's a recipe

**Baked in** (this template + `@appydave/appysentinel-core`):
- Signal envelope, SignalBus, lifecycle harness (SIGINT/SIGTERM/SIGHUP), config loader, atomic write, serial queue, Pino logger, `createSentinel()` factory.

**Added by recipes** (after the configuration interview):
- Collectors, storage, interfaces, transports, enrichment, runtime supervisors.

## License

MIT
