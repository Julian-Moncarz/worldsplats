# Skill — turn a personal website into a walkable splat museum

Given someone's personal site, generate a 3D **room** per section, mark its
spawn/doors/artifacts, link rooms together, and publish a **static walkable
museum**. Generation is automated; curation and placement are human-in-the-loop.

> The runtime/renderer is documented in `engine/` (its own README + CLAUDE.md).
> This file is the *authoring* skill — how rooms get made, marked, linked, shipped.

## Providers / stack

| Need                     | Provider                                              | Notes                                                                                                                                                      |
| :----------------------- | :---------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room generation          | **World Labs Marble**                                 | `api.worldlabs.ai/marble/v1`; text/image → `.spz` splat + GLB collider. `marble-1.0-draft` for cheap iteration ($1.26). Key in `.env` as `WORLD_LABS_KEY`. |
| Renderer                 | **WorldSplats** (`engine/`)                           | Spark (splats) + Three.js + Rapier (physics); static export. Content-free viewer.                                                                          |
| Concept art *(optional)* | **FLUX.2 Pro via fal.ai**                             | photographic concept image for a consistent house style; Marble reconstructs photos best. Not yet scripted.                                                |
| Room music *(optional)*  | **yt-dlp**                                            | a quiet, loopable track; no key/cost. Manual pull.                                                                                                         |
| Asset storage            | **Cloudflare R2** (or any object storage / CDN)       | permanent hosting, zero egress. Marble's own URLs have no retention SLA — **self-host anything you want to keep**.                                         |
| Hosting                  | **GitHub Pages / Cloudflare Pages / any static host** | the built `out/` is plain static files.                                                                                                                    |

## The model (what a museum is)

A museum is just **rooms linked by exits** — like web pages linked by `href`s.
There is no manifest and no central "museum" object; the graph is emergent.

A room is `rooms/<slug>/room.json` (at the repo root; the CLI mirrors it into
`engine/public/` at build):

```jsonc
{
  "display_name": "Library",
  "splat_url":    "library.spz",            // resolved RELATIVE to this file
  "collider_url": "library_collider.glb",
  "music_url":    "library.mp3",
  "calibration":  { "scale": 1.0 },
  "entryways": [ { "id": "default", "pos": [x,y,z], "yaw": deg } ],
  "exits":     [ { "pos": [x,y,z], "radius": 1.3, "to": "../study/#from-library" } ],
  "artifacts": [ { "pos": [x,y,z], "radius": 1.0, "url": "https://…" } ]
}
```

* **One room = one URL:** `/<slug>/`, entryway via `#fragment` (`/library/#from-study`).

* **entryway** — a named arrival spot (`id`/`pos`/`yaw`). `default` is used when there's no fragment.

* **exit** — walk up + press **E** to follow `to` (a room URL + `#entryway`; relative within a site, absolute across). Dead links 404 by design.

* **artifact** — walk up + interact to open a web URL in an overlay (no travel).

* **assets are URL-agnostic** — resolved relative to the room.json's URL, so they can be colocated, on R2/S3, or on the Marble CDN.

## Pipeline (per room) — ✋ = human checkpoint

1. **Read the section/piece** (essay, repo README, video). Pick a vibe + the artifact object (desk / CRT / telescope / …).
2. ✋ *(optional)* **Concept image** — FLUX, photographic, in the house style. Approve or regenerate.
3. **Generate the room:**

   ```bash
   npm run new -- "<prompt>" --slug <slug> --name "<Name>"
   ```

   Downloads splat/collider into `worlds/` and writes a `rooms/<slug>/room.json`
   skeleton (empty entryways/exits/artifacts). Use `--model marble-1.0-draft`
   while iterating.
4. ✋ **Mark coordinates** — `npm run edit`, open `/<slug>/`:

   * **C** copies a floor-snapped spawn (`pos`+`yaw`) → an entryway.

   * **B** beams the point you're looking at → an artifact.

   * **Z** toggles specter no-clip fly (↑/↓) to reach any spot.
     Paste each value to Claude with a label ("default spawn = …", "door to library = …", "this essay's artifact = …").
5. **Wire it** — Claude writes `entryways`/`exits`/`artifacts` into `room.json`.
   Exits use **relative** links `../<other>/#<entryway>`; add the reciprocal door
   in the other room (a two-way link is two exits + two entryways).
6. ✋ *(optional)* **Music** — `yt-dlp` a quiet loopable track into `music/`; set
   `music_url`.
7. ✋ *(per artifact)* **Build the styled page** the artifact opens; set its `url`.
8. **Publish** — mirror the big assets to R2 (durable) and rewrite the `room.json`
   URLs to point there; then `npm run build` and deploy `engine/out/`
   to the static host. (Keep big binaries out of git — R2 holds blobs, git holds
   the tiny `room.json` + the shared bundle.)

## Conventions / gotchas

* **Stable slugs + entryway ids** — other rooms (and other people's museums) link to them; renaming rots links.

* **Self-host keeper assets** — Marble CDN URLs are unsigned/stable today but undocumented, so don't depend on them for anything permanent.

* **`default`** **entryway** is the no-fragment spawn; mark one for every room.

* Marble splats use quaternion `[1,0,0,0]` + `calibration.scale` — handled by the viewer; you only mark coordinates.
