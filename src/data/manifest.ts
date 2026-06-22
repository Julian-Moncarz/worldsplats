// src/data/manifest.ts
// The §5 manifest: the viewer's runtime contract. A world is a room graph —
// nodes are rooms, edges are doors (exits). Each room is the SAME generic shape
// (no room types): a splat, a collider, a spawn, some doors, some content
// triggers, and music. See spec.md §5.
//
// Step 2 adds the data model + loader/validator. The runtime still browses the
// WORLDS preset library; the manifest holds the real room-graph data that the
// door-crossing work (step 3) will consume.

export type Vec3 = [number, number, number];

/** A spherical trigger volume in the room's local frame. */
export type Volume = { pos: Vec3; radius: number };

/**
 * A door: a directed edge to another room. Its `pos`+`yaw` is BOTH the trigger
 * volume AND the arrival spawn for anyone entering the target room through it
 * (you arrive at the door, facing into the room). §2.3, §5.1.
 */
export type Exit = {
  vol: Volume;
  yaw: number;
  to: string; // target room id
};

/** Opens `url` in a fullscreen overlay on gaze + proximity (§9, §11). */
export type ContentTrigger = {
  trigger: Volume;
  url: string;
};

export type RoomAssets = {
  splat_url: string;
  collider_url: string;
  pano_url: string | null;
  thumbnail_url: string | null;
};

/** Every room is the same generic shape — there is no room type (§2.3). */
export type Room = {
  display_name: string;
  assets: RoomAssets;
  /** Marble reconstructs at arbitrary scale; this brings the room to meters (§5.1). */
  calibration: { scale: number };
  /** Fallback spawn for the start room and direct/deep-link loads (§5.1, §12). */
  default_spawn: { pos: Vec3; yaw: number };
  exits: Exit[];
  content_triggers: ContentTrigger[];
  music_url: string | null;
};

export type Manifest = {
  world: {
    title: string;
    start_room: string;
    audio_defaults: { music_volume: number; loop: boolean };
  };
  rooms: Record<string, Room>;
};

/**
 * Fail-loud validation. The headline check (also enforced by `add_room`, §8.4):
 * every door's `to:` must resolve to a real room id, and `start_room` must exist.
 */
export function validateManifest(m: Manifest): void {
  if (!m.world?.start_room) {
    throw new Error('manifest: world.start_room is missing');
  }
  if (!m.rooms?.[m.world.start_room]) {
    throw new Error(`manifest: start_room "${m.world.start_room}" is not in rooms`);
  }
  for (const [id, room] of Object.entries(m.rooms)) {
    for (const exit of room.exits) {
      if (!m.rooms[exit.to]) {
        throw new Error(`manifest: room "${id}" has a door to unknown room "${exit.to}"`);
      }
    }
  }
}

export async function loadManifest(url = '/manifest.json'): Promise<Manifest> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load manifest: ${res.status} ${res.statusText}`);
  }
  const m = (await res.json()) as Manifest;
  validateManifest(m);
  return m;
}
