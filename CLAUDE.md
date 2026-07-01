# CLAUDE.md

Guidance for Claude Code working in the **Otherplane** repo.

## What this is

A static site generator for walkable Gaussian-splat museums. This repo ships the
**engine/tool** only; a user's museum content is theirs and is gitignored. Two
layers:

- **the project** — a user's content root: `otherplane.config.json` (deploy config:
  landing room, base path, site title, walk speed) plus `rooms/<slug>/room.json`,
  `worlds/` (splats + colliders), `music/`. Gitignored here; it's the source of
  truth for a given site. `otherplane init` scaffolds it.
- **`engine/`** — the renderer: a content-free Next.js viewer (Spark + R3F +
  Rapier) that statically exports (`output: 'export'` — no server, any static
  host). Its only input is a `room.json` by URL; it knows nothing about museums,
  hosting, or how assets were made. Keep it content-free — no rooms baked in.

Plus the tooling: `bin/otherplane.mjs` (the CLI), `schema/` (room.json JSON
Schema), and `scripts/gen_world.py` (Marble room generation). The authoring
pipeline (generate → mark → wire → publish) is in the [README](README.md).

The CLI mirrors the project's `rooms/`, `worlds/`, `music/` into `engine/public/`
(gitignored build artifact) before dev/build, so Next's `generateStaticParams`
can enumerate `public/rooms/*`. Author at the project root, never in the mirror.
The project root defaults to the cwd, overridable via `$OTHERPLANE_PROJECT`.

## Commands (run from the project root)

One CLI, aliased by the npm scripts: `npm run init` (scaffold a project) ·
`npm run new` (generate a room) · `npm run dev` · `npm run edit` (author in the
viewer) · `npm run check` (validate rooms) · `npm run build` (→ `engine/out`;
`-- --base /museum` to mount under a sub-path) · `npm run serve` · `npm run clean`.
Each aliases `otherplane <verb>` (`bin/otherplane.mjs`), which drives `engine/` and
`gen_world.py`.

## The room primitive (`engine/src/data/room.ts`)

A room is `rooms/<slug>/room.json`. Types:

- `Entryway { id, pos, yaw }` — a named, addressable spawn spot. The URL fragment
  (`/library/#from-study`) selects it; `id: "default"` is the no-fragment spawn.
- `Exit { pos, radius?, to }` — walk up + press **E** to follow `to` (a room URL +
  `#entryway`; relative within a site, absolute across). Dead links 404 by design.
- `Artifact { id?, pos, radius, url }` — walk up + interact to open a web URL
  overlay (no travel).
- `loadRoom(url)` resolves every asset URL **relative to the room.json's URL**, so
  assets can be colocated, on object storage (R2/S3), or on the World Labs CDN.

A museum is just rooms linked by exits (like web pages linked by hrefs) — there is
no manifest and no global "museum" object; the graph is emergent.

## Routing (`engine/src/app`)

- `app/[room]/page.tsx` — server wrapper; `generateStaticParams` enumerates
  `public/rooms/*` so each room pre-renders to `/<slug>/index.html` in the export.
  (generateStaticParams can't live in a `'use client'` file — hence the wrapper.)
- `app/[room]/RoomViewer.tsx` — the client viewer: loads the room, resolves the
  spawn entryway from `location.hash`, renders the scene, handles exits (client
  nav same-origin, full nav cross-origin).
- `app/page.tsx` — server component that bakes in `LANDING_ROOM` (`src/data/site.ts`,
  read from `otherplane.config.json`) and renders `LandingRedirect.tsx`, a tiny
  client redirect (static export has no server).
- `app/providers.tsx` — PointerLock / Audio / Edit providers (in the root layout).

## Rendering & physics

- `components/scene/WorldScene.tsx` — the R3F `<Canvas>` and scene graph.
- `components/spark/SplatWorld.tsx` — loads the `.spz` via Spark. All Marble splats
  use quaternion `[1,0,0,0]` (180° about X) + the room's `calibration.scale` (see
  `roomToWorldDef` in `presets.ts`); the collider is baked with the same transform
  so walls line up with what you see.
- `physics/RapierProvider.tsx` — builds a trimesh env collider from the room's
  collider GLB; spawns the player (fixed-size dynamic capsule) at the entryway
  `pos` (body-center) facing `yaw`. Falls back to a floor raycast (`findValidSpawn`)
  only when a room declares no entryways. Rapier is `@dimforge/rapier3d-compat`
  **v0.12** — ray hits use `.toi` (not `.timeOfImpact`).
- `components/controls/PlayerController.tsx` — WASD + mouse. The player capsule is
  a **fixed real-world size**; `calibration.scale` sizes the *room* to fit it, so a
  too-small scale leaves the player wedged (that's the room-scale footgun). No
  jumping/sprinting; edit-mode specter (Z + arrows) is the only vertical movement.

## Edit mode (`engine/src/providers/edit.tsx`)

A property of the running **instance** (`NEXT_PUBLIC_EDIT_MODE`, via `npm run
edit`), not a URL — so published builds have no edit mode and never mount any of
it. Edit mode **writes** `room.json`: `otherplane edit` runs a tiny local HTTP
writer alongside `next dev`, and `src/data/editApi.ts` POSTs marks to it; the CLI
merges only the coordinate arrays into the PROJECT source (never asset URLs, never
the mirror) and re-syncs. Pieces:

- `providers/edit.tsx` — owns the room's draft + mutators (each persists) + undo.
- `components/edit/EditCapture.tsx` — keys: **C** add/move entryway (floor-snapped),
  **B** add/move artifact (beamed), **F** gaze-select, **Del** remove, **X**
  deselect, **Z** specter fly (↑/↓).
- `components/edit/Markers.tsx` — labeled orbs in the scene (green entryway / cyan
  exit / amber artifact), edit-only.
- `components/edit/EditorPanel.tsx` — the single DOM panel: help legend, undo/⌘Z,
  name/wire/delete, exit dropdown-or-arbitrary-URL, promote-to-doorway, two-way
  (reciprocal exit reusing the target's entryway), and two sliders that write
  **shippable** data — room scale → `calibration.scale` in room.json (rescales the
  markers with it), walk speed → `moveSpeed` in `otherplane.config.json` (per-museum,
  ships to every viewer).

## Controls (published viewer)

Desktop: WASD move, mouse look, **E** to use an exit, mute (top-right), Esc to
release the mouse. The first click or keypress engages look + audio (browsers
require a gesture). Mobile: virtual joystick + touch-drag to look.

## Conventions

- TypeScript, functional components, hooks. Providers live OUTSIDE the R3F Canvas.
- Keep the renderer content-free: no specific rooms/assets baked in.
- Memoize the `WorldDef` passed to the scene (stable `position`/`quaternion`
  references) or SplatWorld's load effect re-fires every render.
- Stable slugs + entryway ids: other rooms link to them; renaming rots links.
- Big binaries (`.spz`/`.glb`) belong in object storage referenced by URL from
  `room.json`; keep git small.
- `.env` holds `WORLD_LABS_KEY` and is gitignored — never commit it (`.env.example`
  is the template). Build output (`engine/.next`, `engine/out`, `node_modules`) and
  content (`rooms/`, `worlds/`, `music/`, `generated/`) are gitignored too.

## Tech stack

Next.js 15 (static export) · React 19 · TypeScript · three.js + @react-three/fiber ·
@sparkjsdev/spark (splat rendering) · @dimforge/rapier3d-compat (physics) ·
Tailwind CSS. Built on [WorldSplats](https://github.com/philchacko/worldsplats),
[Spark.js](https://sparkjs.dev), and [World Labs Marble](https://marble.worldlabs.ai).
