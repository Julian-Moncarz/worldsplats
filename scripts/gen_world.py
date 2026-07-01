#!/usr/bin/env python3
"""Minimal one-off Marble room generator.

Generates a single room from a TEXT prompt, polls the operation, downloads the
splat (.spz), collider (.glb), pano and thumbnail into the repo-root worlds/,
and writes a room.json skeleton to rooms/<slug>/room.json for the room primitive
(engine/src/data/room.ts). Mark entryways/exits in edit mode after.

The repo root holds the project's content (rooms/, worlds/, music/); the engine
mirrors it into engine/public/ at dev/build time. `otherplane new` runs that sync
for you; if you call this script directly, run `otherplane dev`/`edit` after.

Usage:
    otherplane new "<text prompt>" --slug library --name "Library"
    # or directly:
    uv run --with requests scripts/gen_world.py "<text prompt>" --slug library --name "Library"
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

BASE = "https://api.worldlabs.ai/marble/v1"
# The content root. The CLI passes OTHERPLANE_PROJECT; default to this repo's root
# so direct invocation (uv run scripts/gen_world.py) still works.
ROOT = Path(os.environ.get("OTHERPLANE_PROJECT") or Path(__file__).resolve().parent.parent)
OUT = ROOT / "worlds"


def load_key() -> str:
    env = ROOT / ".env"
    for line in env.read_text().splitlines():
        if line.strip().startswith("WORLD_LABS_KEY"):
            return line.split("=", 1)[1].strip()
    sys.exit("WORLD_LABS_KEY not found in .env")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt")
    ap.add_argument("--model", default="marble-1.0-draft")
    ap.add_argument("--name", default="step-one-test-room")
    ap.add_argument("--slug", default="room", help="basename for output files, e.g. 'library'")
    args = ap.parse_args()

    headers = {"WLT-Api-Key": load_key(), "Content-Type": "application/json"}

    print(f"→ generating ({args.model}): {args.prompt!r}")
    r = requests.post(
        f"{BASE}/worlds:generate",
        headers=headers,
        json={
            "display_name": args.name,
            "model": args.model,
            "world_prompt": {"type": "text", "text_prompt": args.prompt},
        },
    )
    r.raise_for_status()
    op = r.json()
    op_id = op.get("operation_id") or op.get("name", "").split("/")[-1] or op.get("id")
    print(f"  operation: {op_id}")

    world_id = None
    while True:
        time.sleep(10)
        s = requests.get(f"{BASE}/operations/{op_id}", headers=headers)
        s.raise_for_status()
        st = s.json()
        if st.get("done"):
            if st.get("error"):
                print(json.dumps(st, indent=2))
                sys.exit("generation failed")
            resp = st.get("response", {})
            world_id = resp.get("world_id") or resp.get("id")
            print(f"  done. world_id: {world_id}")
            break
        print("  …still generating")

    # fetch authoritative world object
    w = requests.get(f"{BASE}/worlds/{world_id}", headers=headers)
    w.raise_for_status()
    world = w.json()
    assets = world.get("assets", {})

    OUT.mkdir(parents=True, exist_ok=True)
    prov = ROOT / "generated" / args.slug
    prov.mkdir(parents=True, exist_ok=True)
    (prov / "world.json").write_text(json.dumps(world, indent=2))

    slug = args.slug
    spz = assets.get("splats", {}).get("spz_urls", {})
    targets = {
        f"{slug}.spz": spz.get("500k") or spz.get("full_res") or spz.get("100k"),
        f"{slug}_collider.glb": assets.get("mesh", {}).get("collider_mesh_url"),
        f"{slug}_pano.jpg": assets.get("imagery", {}).get("pano_url"),
        f"{slug}_thumb.jpg": assets.get("thumbnail_url") or assets.get("imagery", {}).get("thumbnail_url"),
    }
    saved: dict[str, str] = {}  # role -> public path, e.g. "splat" -> "/worlds/library.spz"
    for fname, url in targets.items():
        if not url:
            print(f"  ! no url for {fname}")
            continue
        ext = Path(urlparse(url).path).suffix
        out = OUT / fname
        if ext and ext != out.suffix:
            out = out.with_suffix(ext)
        print(f"  ↓ {fname} ← {url[:60]}…")
        dl = requests.get(url)
        dl.raise_for_status()
        out.write_bytes(dl.content)
        print(f"    saved {out.relative_to(ROOT)} ({len(dl.content)//1024} KB)")
        role = fname.split(".")[0].replace(slug, "").strip("_") or "splat"
        saved[role] = f"/worlds/{out.name}"

    print(f"\n✓ assets in {OUT.relative_to(ROOT)}")

    # Emit a room.json skeleton for the room primitive (src/data/room.ts). One
    # room = one folder = one pretty URL (/<slug>/). Assets are filled in;
    # entryways/exits/artifacts are left empty for marking with `otherplane edit`
    # (fly with Z, copy floor-snapped spots with C). With no entryways the
    # renderer best-effort searches for floor until you mark a "default" one.
    room_dir = ROOT / "rooms" / slug
    room_dir.mkdir(parents=True, exist_ok=True)
    room = {
        "$schema": "../../schema/room.schema.json",
        "display_name": args.name,
        "splat_url": saved.get("splat", f"/worlds/{slug}.spz"),
        "collider_url": saved.get("collider", f"/worlds/{slug}_collider.glb"),
        "thumbnail_url": saved.get("thumb"),
        "music_url": None,
        "calibration": {"scale": 1.0},
        "entryways": [],
        "exits": [],
        "artifacts": [],
    }
    room_path = room_dir / "room.json"
    room_path.write_text(json.dumps(room, indent=2) + "\n")
    print(f"✓ room skeleton {room_path.relative_to(ROOT)} — run `otherplane edit`, open /{slug}/ to mark it")


if __name__ == "__main__":
    main()
