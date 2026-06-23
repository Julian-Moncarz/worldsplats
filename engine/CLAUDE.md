# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

A **static, content-free viewer for walkable Gaussian-splat rooms**. The renderer
is a deep module: its only input is a `room.json` (by URL), and it renders a
first-person walkable room. It knows nothing about "museums," hosting, or how
assets were generated. A museum is just rooms linked by exits (like web pages
linked by hrefs) — there is no manifest and no global "museum" object.

It builds to a **static export** (`output: 'export'`) — no server, hostable on any
static host.

> Content (`public/rooms`, `public/worlds`, `public/music`) is **not** authored
> here — the repo root holds the source of truth (`../rooms`, `../worlds`,
> `../music`) and the `promenade` CLI mirrors it into `public/` (gitignored)
> before dev/build. Deploy config is read from `../promenade.config.json`.

## Development commands

- `npm run dev` — dev server (http://localhost:3000; `/` redirects to the landing room)
- `npm run edit` — dev server with edit mode ON (`NEXT_PUBLIC_EDIT_MODE=1`)
- `npm run build` — static export to `./out`
- `npm run lint`

## The room primitive (`src/data/room.ts`)

A room is `public/rooms/<slug>/room.json`. Types:

- `Entryway { id, pos, yaw }` — a named, addressable spawn spot. The URL fragment
  (`/library/#from-study`) selects it; `id: "default"` is the no-fragment spawn.
- `Exit { pos, radius?, to }` — walk up + press **E** to follow `to` (a room URL +
  `#entryway`; relative within a site, absolute across). Dead links 404 by design.
- `Artifact { id?, pos, radius, url }` — walk up + interact to open a web URL
  overlay (no travel).
- `loadRoom(url)` resolves every asset URL **relative to the room.json's URL**, so
  assets can be colocated, on object storage (R2/S3), or on the World Labs CDN.

## Routing (`src/app`)

- `app/[room]/page.tsx` — server wrapper; `generateStaticParams` enumerates
  `public/rooms/*` so each room pre-renders to `/<slug>/index.html` in the export.
  (generateStaticParams can't live in a `'use client'` file — hence the wrapper.)
- `app/[room]/RoomViewer.tsx` — the client viewer: loads the room, resolves the
  spawn entryway from `location.hash`, renders the scene, handles exits (client
  nav same-origin, full nav cross-origin).
- `app/page.tsx` — server component that bakes in `LANDING_ROOM`
  (`src/data/site.ts`, read from `../promenade.config.json`) and renders
  `LandingRedirect.tsx`, a tiny client redirect (static export has no server).
- `app/providers.tsx` — PointerLock / Audio / Edit providers (in the root layout).

## Rendering & physics

- `components/scene/WorldScene.tsx` — the R3F `<Canvas>` and scene graph.
- `components/spark/SplatWorld.tsx` — loads the `.spz` via Spark. All Marble
  splats use quaternion `[1,0,0,0]` (180° about X) + the room's `calibration.scale`
  (see `roomToWorldDef` in `presets.ts`); the collider is baked with the same
  transform so walls line up with what you see.
- `physics/RapierProvider.tsx` — builds a trimesh env collider from the room's
  collider GLB; spawns the player (dynamic capsule) at the entryway `pos`
  (body-center) and faces `yaw`. Falls back to a floor raycast (`findValidSpawn`)
  only when a room declares no entryways. Rapier is `@dimforge/rapier3d-compat`
  **v0.12** — ray hits use `.toi` (not `.timeOfImpact`).
- `components/controls/PlayerController.tsx` — WASD + mouse; sets the camera to the
  entryway yaw on spawn; supports edit-mode specter (no-clip fly).

## Edit mode (`src/providers/edit.tsx`)

A property of the running **instance** (`NEXT_PUBLIC_EDIT_MODE`, via `npm run
edit`), not a URL — so published builds have no edit mode. It writes nothing.
`components/edit/EditCapture.tsx` handles the keys: **C** copies a floor-snapped
spawn (`pos`+`yaw`), **B** beams a looked-at point (artifacts), **Z** toggles
specter fly (↑/↓ up/down). `EditHud.tsx` shows live coords.

## Conventions

- TypeScript, functional components, hooks. Providers live OUTSIDE the R3F Canvas.
- Keep the renderer content-free: no specific rooms/assets baked in. Rooms are data
  under `public/rooms/`; big binaries belong in object storage referenced by URL.
- Memoize the `WorldDef` passed to the scene (stable `position`/`quaternion`
  references) or SplatWorld's load effect re-fires every render.
- `out/` and `.next/` are gitignored — never commit build output.
