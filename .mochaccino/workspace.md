# AppySentinel — Mochaccino Workspace

## Purpose
Visualise AppySentinel's knowledge — architecture, patterns, and recipes — for two clients and potential YouTube content. Audience understands patterns but is not building on top of AppySentinel directly.

## Workspace type
parallel

## Canonical source
`docs/` — the spec and pattern catalogue are the source of truth. Mochaccino data files are downstream syntheses. When content changes, update `docs/` first, then refresh the relevant `data/*.json` files, then re-render.

## Active workspaces

| Workspace | Status | Description | Relationship |
|-----------|--------|-------------|-------------|
| `documentation` | active | Developer-facing views — architecture, patterns, recipes. | Canonical synthesis from `docs/` |
| `client` | active | Client/stakeholder views — what it does, fit guide. | Audience-driven synthesis from `documentation/data/` |

## Planned workspaces

| Workspace | Status | Description |
|-----------|--------|-------------|
| `ui` | future | Interface mockups if/when AppySentinel gets a viewer or installer UI. |

## Tone
Calm and educational.

## Audience
Technical but non-builder. Understands software patterns; does not need to know how to implement AppySentinel to get value from these views.
