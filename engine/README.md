# WorldSplats

A static, content-free **viewer for walkable Gaussian-splat rooms**. Give it a
room (a splat + a collider + some coordinates) and it renders a first-person space
you can walk around. One room = one URL.

Thank you to World Labs for beta access to their world generator, and @bmild for
sample code to bootstrap Spark.js with React Three Fiber.

## What it is (and isn't)

- **A viewer, not a place.** The renderer's only input is a `room.json` (by URL).
  It knows nothing about museums, hosting, or how the assets were made.
- **No manifest, no "museum" object.** A museum is just rooms linked by exits —
  exactly like the web is pages linked by `href`s. The graph is emergent.
- **Static.** It builds to plain files and runs with no server — host it on
  GitHub Pages, Cloudflare R2/Pages, S3, or any folder behind any web server.

## The room primitive

A room is a folder with a `room.json` (`public/rooms/<slug>/room.json`):

```jsonc
{
  "display_name": "Library",
  "splat_url":    "library.spz",            // resolved RELATIVE to this file...
  "collider_url": "library_collider.glb",   // ...so assets can live anywhere
  "music_url":    "library.mp3",
  "calibration":  { "scale": 1.0 },         // Marble's scale is arbitrary
  "entryways": [
    { "id": "default",    "pos": [0.9, -0.2, 0.5], "yaw": -134 },
    { "id": "from-study", "pos": [0.0,  0.0, 1.7], "yaw":  180 }
  ],
  "exits": [
    { "pos": [0.0, -0.1, 1.8], "radius": 1.3, "to": "../study/#from-library" }
  ],
  "artifacts": []
}
```

- **entryway** — a named, addressable spot you *arrive* at (`id`, `pos`, `yaw`).
  The URL fragment picks it (`/library/#from-study`); `default` is used when
  there's no fragment.
- **exit** — a spot you walk up to and press **E** to follow a link. `to` is a
  room URL + `#entryway`: relative within a site (`../study/#from-library`),
  absolute across sites (`https://alice.example/atrium/#east`). Dead links 404 —
  acceptable by design.
- **artifact** — walk up + interact to open a web URL in an overlay (no travel).
- **assets are URL-agnostic.** Every asset URL is resolved *relative to the
  room.json's own URL*, so assets can sit next to it, live on object storage
  (R2/S3), or point at the World Labs CDN. The viewer never cares where bytes are.

## URLs

- `/<room>/` renders `public/rooms/<room>/room.json`.
- `/<room>/#<entryway>` spawns you at that entryway.
- Exits navigate between rooms (client-side same-origin; a full navigation for a
  different origin / another museum).

## Controls

**Desktop:** WASD to move, mouse to look, **E** to use an exit, mute (top-right),
Esc to release the mouse. The first click or keypress engages look + audio
(browsers require a gesture). **Mobile:** virtual joystick + touch-drag to look.

## Develop & build

```bash
npm install
npm run dev      # http://localhost:3000  (root redirects to the landing room)
npm run edit     # dev server with edit mode ON (authoring — see below)
npm run build    # static export to ./out — deploy anywhere
```

`out/` is a plain static site: one shared `_next` bundle plus a tiny
`/<room>/index.html` per room. Drop it on any static host.

## Edit mode (authoring)

Run `npm run edit` (sets `NEXT_PUBLIC_EDIT_MODE=1`). Edit mode is a property of the
**running instance**, not the URL — so a published build has no edit mode and a
visitor can't turn it on. It writes nothing; it just helps you read off
coordinates:

- **C** — copy a spawn (`pos` + `yaw`). It raycasts to the floor below you, so the
  copied height is always a valid feet-on-floor spawn. Paste it into an entryway.
- **B** — "beam": copy the point you're looking at (for artifacts, off the floor).
- **Z** — toggle *specter* mode: no-clip fly (↑/↓ for up/down) so you can reach
  any spot to mark it.
- A HUD shows your live `pos`/`yaw` and the last value copied.

## Adding a room

> In the Promenade project the content source of truth is the **repo root**
> (`../rooms`, `../worlds`, `../music`); the `promenade` CLI mirrors it into this
> engine's `public/` (gitignored) at dev/build. The paths below describe what the
> engine reads — author at the repo root, not in `public/`.

1. Put the assets where they'll be served (object storage like R2 is recommended
   for the big `.spz`/`.glb`; or colocate them in the room folder).
2. Create `rooms/<slug>/room.json` (format above). Mark entryways/exits in
   edit mode (`npm run edit`, fly with Z, copy with C).
3. `npm run build` → `/<slug>/` is live. Link to it from another room's exit.

## Hosting & repo size

Keep **text in git** (room.json + the one shared bundle) and **blobs in object
storage**. A `.spz` is ~5MB and a collider ~5MB; those belong on R2 (cheap, zero
egress, CDN-backed), referenced by URL from `room.json`. Adding a room then costs
your repo a few KB, not 10MB. (GitHub Pages also handles the files fine directly —
100MB/file limit — if you'd rather commit them.)

## Tech stack

- **Next.js 15** (static export) · **React 19** · **TypeScript**
- **three.js** + **@react-three/fiber** — 3D
- **@sparkjsdev/spark** — Gaussian-splat rendering
- **@dimforge/rapier3d-compat** — physics (capsule player vs. trimesh collider)
- **Tailwind CSS**

## License

MIT — see [LICENSE](LICENSE).

## Credits

- Gaussian Splatting via [Spark.js](https://sparkjs.dev)
- World generation via [World Labs Marble](https://marble.worldlabs.ai)
