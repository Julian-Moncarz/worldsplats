// src/data/editApi.ts
// Client for the edit-mode writer — the tiny local HTTP sidecar the `otherplane
// edit` CLI runs alongside `next dev` (see bin/otherplane.mjs). It is the ONLY
// thing that writes room.json: edit mode POSTs marked coordinates here and the
// CLI merges them into the PROJECT source (never the mirror) and re-syncs.
//
// This exists only in edit mode. A published static export has no writer and no
// edit UI, so none of this is ever reachable there.

import type { Entryway, Exit, Artifact, Vec3 } from '@/data/room';

// The CLI passes its port through NEXT_PUBLIC_EDIT_API; fall back to the default.
const API = process.env.NEXT_PUBLIC_EDIT_API || 'http://localhost:4400';

/** One room as the writer reports it for the exit-target dropdown. */
export type RoomSummary = {
  slug: string;
  display_name: string;
  entryways: { id: string; pos: Vec3; yaw: number }[];
};

/** The coordinate data the editor owns and writes back (never asset URLs). */
export type Marks = {
  entryways: Entryway[];
  exits: Exit[];
  artifacts: Artifact[];
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
  return body as T;
}

/** List every room + its entryways, for wiring exits by menu. */
export async function fetchRooms(): Promise<RoomSummary[]> {
  const { rooms } = await req<{ rooms: RoomSummary[] }>('/rooms');
  return rooms;
}

/**
 * Persist a room's marks (and optionally its calibration.scale). Asset URLs are
 * untouched — the CLI merges only the keys we send.
 */
export async function saveMarks(
  slug: string,
  marks: Marks,
  calibration?: { scale: number },
): Promise<void> {
  const body = calibration ? { ...marks, calibration } : marks;
  await req(`/rooms/${slug}`, { method: 'PUT', body: JSON.stringify(body) });
}

/** Merge fields into otherplane.config.json (e.g. the per-museum walk speed). */
export async function saveConfig(patch: Record<string, unknown>): Promise<void> {
  await req('/config', { method: 'PUT', body: JSON.stringify(patch) });
}

/**
 * Wire a two-way door by reusing each side's existing entryway position. Both
 * entryways must already exist — the reciprocal exit sits at the entryway you
 * point it at (you can't conjure the far room's coordinates from this one).
 */
export async function linkDoor(
  a: { slug: string; entryId: string },
  b: { slug: string; entryId: string },
): Promise<void> {
  await req('/doors/link', { method: 'POST', body: JSON.stringify({ a, b }) });
}
