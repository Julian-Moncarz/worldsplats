# CLAUDE.md

Guidance for Claude Code working in the **Promenade** repo.

## What this is

A static site generator for walkable Gaussian-splat museums. Two layers:

- **`engine/`** — the renderer: a content-free Next.js viewer (Spark + R3F +
  Rapier) that statically exports. Its only input is a `room.json` by URL. Deep
  internals are documented in [`engine/CLAUDE.md`](engine/CLAUDE.md). Keep it
  content-free — no specific rooms baked in.
- **authoring layer** — `scripts/gen_world.py` (Marble room generation),
  `generated/` (raw Marble provenance), and [`skill.md`](skill.md) (the
  human-in-the-loop pipeline: generate → mark coords → wire exits → publish).

The content (rooms, splats, music) lives under `engine/public/` so Next's
`generateStaticParams` can enumerate `public/rooms/*` at build time.

## Commands (run from repo root)

`npm run new` (generate a room) · `npm run dev` · `npm run edit` (mark coords) ·
`npm run build` (→ `engine/out`) · `npm run serve` · `npm run clean`. These
delegate to `engine/`'s npm scripts and `scripts/gen_world.py`.

## Conventions

- `.env` holds `WORLD_LABS_KEY` and is gitignored — never commit it. `.env.example`
  is the template.
- Build output (`engine/.next`, `engine/out`, `node_modules`, `.vite`) is
  gitignored — never commit it.
- Stable slugs + entryway ids: other rooms link to them; renaming rots links.
- Big binaries (`.spz`/`.glb`) belong in object storage referenced by URL from
  `room.json`; keep git small.
