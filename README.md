# Promenade

A **static site generator for walkable Gaussian-splat museums.** Point it at the
sections of a personal site and it generates a 3D **room** for each one, lets you
mark spawn points / doorways / artifacts, links the rooms together, and publishes
a plain **static walkable site** — host it on GitHub Pages, Cloudflare R2/Pages,
S3, or any folder behind any web server.

A museum is just **rooms linked by exits** — like web pages linked by `href`s.
There is no manifest and no central "museum" object; the graph is emergent.

## Layout

```
promenade/
├── promenade.config.json   deploy config (landing room, base path, site title)
├── rooms/<slug>/room.json  the rooms — one folder, one URL (/<slug>/)
├── worlds/                 splats + colliders (.spz / .glb)
├── music/                  per-room loopable tracks
├── engine/                 the renderer — a content-free Next.js viewer (Spark + R3F + Rapier)
├── bin/promenade.mjs       the CLI (the npm scripts alias it)
├── schema/                 room.json JSON Schema (editor autocomplete + `promenade check`)
├── scripts/                gen_world.py — generates a room from a prompt (World Labs Marble)
├── generated/              raw Marble world.json per room (provenance)
└── skill.md                the authoring guide — how rooms get made, marked, linked, shipped
```

Your **project** is the repo root (`promenade.config.json` + `rooms/`, `worlds/`,
`music/`); `engine/` is the content-free renderer — the split every SSG makes.
The CLI mirrors your content into `engine/public/` (a gitignored build artifact)
so Next can serve and enumerate it; you never edit there.

The renderer is a **deep module**: its only input is a `room.json` (by URL). It
knows nothing about museums, hosting, or how the assets were made. See
[`engine/README.md`](engine/README.md) for the room primitive and renderer
internals, and [`skill.md`](skill.md) for the end-to-end authoring pipeline.

## CLI

Like other static site generators (Hugo, Astro, Eleventy), Promenade exposes a
small set of verbs through one CLI (`bin/promenade.mjs`). Run them as
`promenade <verb>` or via the `npm run` aliases below:

| Command            | What it does                                                                 |
| :----------------- | :-------------------------------------------------------------------------- |
| `npm run setup`    | Install the engine's dependencies (one-time).                               |
| `npm run new`      | Generate a room from a prompt (World Labs Marble). See below.               |
| `npm run dev`      | Dev server with the viewer (http://localhost:3000).                         |
| `npm run edit`     | Dev server with **edit mode** on — for marking spawn/door/artifact coords.  |
| `npm run check`    | Validate every `rooms/*/room.json` against the schema.                      |
| `npm run build`    | Static export to `engine/out` — deploy this folder anywhere.                |
| `npm run serve`    | Serve the built `engine/out` at http://localhost:8000.                      |
| `npm run preview`  | `build` then `serve`.                                                       |
| `npm run clean`    | Remove build output + the synced mirror.                                    |

### Generating a room

```bash
cp .env.example .env          # then paste your WORLD_LABS_KEY
npm run setup
npm run new -- "a cozy wood-paneled library, warm lamplight" --slug library --name "Library"
```

This calls World Labs Marble, downloads the splat (`.spz`) + collider (`.glb`)
into `worlds/`, saves the raw world object under `generated/<slug>/`, and writes a
`room.json` skeleton to `rooms/<slug>/`. Use `--model marble-1.0-draft` (the
default) while iterating — it's cheap (~$1.26).

Then mark coordinates and wire the room up — see [`skill.md`](skill.md).

## Hosting & repo size

Keep **text in git** (`room.json` + the shared bundle) and **blobs in object
storage**. A `.spz` is ~5 MB and a collider ~5 MB; for anything you want to keep,
mirror those to R2 (cheap, zero egress, CDN-backed) and point each `room.json`
URL there. Adding a room then costs the repo a few KB, not 10 MB. (Marble's own
CDN URLs have no documented retention SLA — self-host keepers.)

## License

MIT — see [`engine/LICENSE`](engine/LICENSE). Built on
[WorldSplats](https://github.com/philchacko/worldsplats) (the viewer),
[Spark.js](https://sparkjs.dev) (splat rendering), and
[World Labs Marble](https://marble.worldlabs.ai) (generation).
