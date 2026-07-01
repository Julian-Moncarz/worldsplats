# otherplane

> *By late afternoon, the overcast was gone. Sunlight glinted off millions of
> waterdrop jewels in the trees. Pollack waited till the sun was behind the tree
> line, till all that was left of its passage was a gold band across the taller
> trees to the east of his bungalow. Then he sat down before his equipment and
> prepared to ascend to the Other Plane…*
>
> *The air was cold but very moist. Weird, towering plants dripped audibly onto
> the faintly iridescent water and the broad lilies.*
>
> — Vernor Vinge, True Names (1981)

[World Labs' Marble](https://marble.worldlabs.ai) takes a text description and image of a
room and generates a walkable 3D model of it. Every website can now be turned, cheaply and in minutes, into a world. otherplane is a static site generator for making this easy.

## Primatives:

- **Rooms:** walkable 3D spaces (Gaussian splats). One room = one URL.
- **Exits:** doorways: walk up, press E, and travel to another room (or any URL).
- **Artifacts:** objects you walk up to and open to show a page in an overlay.

## Turn your site into a world

(if you are using an agent past this into it)

**Here's a possible workflow you could follow:**

1. Divvy up your existing site into rooms/artifacts.

For each page you have right now, do you want that to be something you access through a doorway, an artifact that the user interacts with, how do you want rooms to connect, etc?

2. Generate a reference image per room (any image model), iterate until you're happy.
3. Generate → mark & wire → build

You need Node 18+ and a [World Labs Marble](https://marble.worldlabs.ai) API
key for generation.

```bash
npx otherplane init                       
echo "WORLD_LABS_KEY=…" >> .env            

npx otherplane new "a warm wood-paneled study, evening light" --slug home --name "Home"
npx otherplane new "a bright gallery of framed prints"        --slug work --name "Work"

npx otherplane edit                       # C drops a spawn, B places an artifact, the panel wires doorways

npx otherplane build                      # → ./out   (a plain static site)
npx otherplane serve                      # preview at http://localhost:8000
```

Deploy `out/` to GitHub Pages, Cloudflare, S3 — anywhere. To hang it off your
existing site, `npx otherplane build -- --base /museum`, drop `out/` into your
site's `/museum/`, and link to it.
