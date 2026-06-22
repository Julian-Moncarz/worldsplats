// src/data/presets.ts
import type { Room } from '@/data/room';

// WorldDef is the viewer's internal per-room render shape, built from a Room
// (roomToWorldDef below). There is no hardcoded world library — the renderer is
// given one room at a time.
export type WorldDef = {
  id: string;
  name: string;
  url: string;             // .spz or .ply (Spark auto-detects)
  colliderUrl?: string;    // GLB collider mesh (Marble) for real wall collision
  musicUrl: string;
  position?: [number, number, number];
  quaternion?: [number, number, number, number]; // x,y,z,w
  scale?: number;
};

// All Marble splats share the same canonical transform: identity position, the
// Spark 180°-about-X flip, and the room's calibrated scale. Per-room
// rotation/offset is never needed since rooms never share space.
export function roomToWorldDef(id: string, room: Room): WorldDef {
  return {
    id,
    name: room.display_name,
    url: room.splat_url,
    colliderUrl: room.collider_url,
    musicUrl: room.music_url ?? '',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0], // Spark convention: 180° about X
    scale: room.calibration.scale,
  };
}
