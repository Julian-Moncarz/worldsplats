// src/data/room.ts
// The viewer's ONE primitive: a room. There is no "museum" object — a museum is
// just rooms linked by exits, exactly like the web is pages linked by hrefs.
//
// Each room lives at its own URL (the /r/[id] route, or any remote URL). The
// renderer is a deep module: "here is one room — its splat, its collider, its
// music, its entryways, its exits, its artifacts — render it and let me walk."
//
// Two distinct concepts that an old "door" used to conflate:
//   • entryway — a named, addressable spot you ARRIVE at: { id, pos, yaw }. You
//     spawn at an entryway, facing into the room. It's what a URL fragment points
//     at (…/library#from-study). One entryway is the "default" (used when the URL
//     has no fragment).
//   • exit — a spot you walk up to and INTERACT with (gaze + E) to leave:
//     { pos, radius, to }. `to` is a URL, normally "<room-url>#<entryway-id>"
//     (relative within a museum, absolute across museums). Dead exits 404 quietly.
//
// artifacts are a third, separate thing: walk up, interact, open a web URL in an
// overlay — content in place, no transport.

export type Vec3 = [number, number, number];

/** A named spawn point: a position + the yaw you face when you arrive there. */
export type Entryway = { id: string; pos: Vec3; yaw: number };

/** A walk-up interactive link to another room (or any URL). */
export type Exit = { pos: Vec3; radius?: number; to: string };

/** Walk up + interact to open `url` in a fullscreen overlay. */
export type Artifact = { id?: string; pos: Vec3; radius: number; url: string };

export type Room = {
  display_name: string;
  splat_url: string;
  collider_url: string;
  music_url?: string | null;
  pano_url?: string | null;
  thumbnail_url?: string | null;
  /** Marble reconstructs at arbitrary scale; this brings the room to meters. */
  calibration: { scale: number };
  entryways: Entryway[];
  exits: Exit[];
  artifacts: Artifact[];
};

/** The default entryway is the one named "default", else the first listed. */
export const DEFAULT_ENTRYWAY_ID = 'default';

/**
 * Resolve which entryway to spawn at. `id` comes from the URL fragment
 * (…/library#from-study → "from-study"); empty/unknown falls back to the
 * default. Returns null only if the room declares no entryways at all (a
 * freshly generated, not-yet-marked room — the renderer then best-effort
 * searches for floor).
 */
export function resolveEntryway(room: Room, id?: string | null): Entryway | null {
  if (id) {
    const match = room.entryways.find((e) => e.id === id);
    if (match) return match;
  }
  return (
    room.entryways.find((e) => e.id === DEFAULT_ENTRYWAY_ID) ??
    room.entryways[0] ??
    null
  );
}

/** Read the entryway id from a URL hash like "#from-study" → "from-study". */
export function entrywayIdFromHash(hash: string): string | null {
  const h = hash.replace(/^#/, '').trim();
  return h.length ? h : null;
}

export async function loadRoom(id: string): Promise<Room> {
  const res = await fetch(`/rooms/${id}.json`);
  if (!res.ok) {
    throw new Error(`Failed to load room "${id}": ${res.status} ${res.statusText}`);
  }
  const room = (await res.json()) as Room;
  if (!room.splat_url || !room.collider_url) {
    throw new Error(`room "${id}" is missing splat_url/collider_url`);
  }
  room.entryways ??= [];
  room.exits ??= [];
  room.artifacts ??= [];
  return room;
}
