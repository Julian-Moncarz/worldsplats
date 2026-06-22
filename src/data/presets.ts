// src/data/presets.ts
import type { Room } from '@/data/room';

// WorldDef is the viewer's internal per-room render shape, built from a Room
// (roomToWorldDef below). There is no hardcoded world library — the renderer is
// given one room at a time.
export type WorldDef = {
  id: string;
  name: string;
  url: string;             // .spz or .ply (Spark auto-detects)
  colliderUrl?: string;    // optional GLB collider mesh (Marble) for real wall collision
  imageUrl: string;
  musicUrl: string;
  imageCredit?: string;
  position?: [number, number, number];
  quaternion?: [number, number, number, number]; // x,y,z,w
  scale?: number;
  guide: string;
};

export type ObjectDef =
  | {
      id: string;
      name: string;
      kind: 'primitive';
      shape: 'sphere' | 'box' | 'icosahedron';
      scale?: number;
      mass?: number;
      collider?: 'ball' | 'cuboid';
    }
  | {
      id: string;
      name: string;
      kind: 'gltf';
      url: string;
      scale?: number;
      mass?: number;
      collider?: 'hull'; // for complex meshes
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
    imageUrl: room.thumbnail_url ?? '',
    musicUrl: room.music_url ?? '',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0], // Spark convention: 180° about X
    scale: room.calibration.scale,
    guide: room.display_name,
  };
}

export const OBJECTS: ObjectDef[] = [
  { id: 'sphere', name: 'Sphere', kind: 'primitive', shape: 'sphere', scale: 0.2, mass: 1, collider: 'ball' },
  { id: 'box', name: 'Box', kind: 'primitive', shape: 'box', scale: 0.25, mass: 1, collider: 'cuboid' },
  { id: 'icosa', name: 'Icosahedron', kind: 'primitive', shape: 'icosahedron', scale: 0.25, mass: 1, collider: 'ball' },
  {
    id: 'duck',
    name: 'GLTF Duck',
    kind: 'gltf',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
    scale: 0.5,
    mass: 2,
    collider: 'hull',
  },
];
