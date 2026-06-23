# CLAUDE.md

Guidance for Claude Code working in the **Promenade** repo.

## What this is

A static site generator for walkable Gaussian-splat museums. Two layers:

- **the project** — the repo root: `promenade.config.json` (deploy config:
  landing room, base path, site title) plus the content — `rooms/<slug>/room.json`,
  `worlds/` (splats + colliders), `music/`. This is the source of truth.
- **`engine/`** — the renderer: a content-free Next.js viewer (Spark + R3F +
  Rapier) that statically exports. Its only input is a `room.json` by URL. Deep
  internals are documented in [`engine/CLAUDE.md`](engine/CLAUDE.md). Keep it
  content-free — no specific rooms baked in.

Plus the authoring tooling: `bin/promenade.mjs` (the CLI), `schema/` (room.json
JSON Schema), `scripts/gen_world.py` (Marble room generation), `generated/` (raw
Marble provenance), and [`skill.md`](skill.md) (the human-in-the-loop pipeline:
generate → mark coords → wire exits → publish).

The CLI mirrors the project's `rooms/`, `worlds/`, `music/` into `engine/public/`
(gitignored build artifact) before dev/build, so Next's `generateStaticParams`
can enumerate `public/rooms/*`. Edit content at the repo root, never in the mirror.

## Commands (run from repo root)

One CLI, aliased by the npm scripts: `npm run new` (generate a room) ·
`npm run dev` · `npm run edit` (mark coords) · `npm run check` (validate rooms) ·
`npm run build` (→ `engine/out`) · `npm run serve` · `npm run clean`. Each aliases
`promenade <verb>` (`bin/promenade.mjs`), which drives `engine/` and `gen_world.py`.

## Conventions

- `.env` holds `WORLD_LABS_KEY` and is gitignored — never commit it. `.env.example`
  is the template.
- Build output (`engine/.next`, `engine/out`, `node_modules`, `.vite`) is
  gitignored — never commit it.
- Stable slugs + entryway ids: other rooms link to them; renaming rots links.
- Big binaries (`.spz`/`.glb`) belong in object storage referenced by URL from
  `room.json`; keep git small.
