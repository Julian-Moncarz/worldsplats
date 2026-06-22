'use client';

// Edit mode (spec §10): the viewer's `--edit` flag. In this Next.js app the flag
// is the URL query `?edit=1` (or just `?edit`). Edit mode writes nothing — it adds
// a live, copyable pos+yaw HUD and a "beam" raycast so you can walk the room, copy
// coordinates, and hand them to Claude to write into the manifest.
//
// This provider also loads + validates the §5 manifest so the HUD can tell you
// which manifest room you're marking.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { loadManifest, type Manifest } from '@/data/manifest';

export type LiveCoords = {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  hasBody: boolean;
};

type EditCtx = {
  editMode: boolean;
  /** Mutated every frame by EditCapture (inside the canvas); read by the HUD. */
  liveRef: React.MutableRefObject<LiveCoords>;
  lastCopied: string | null;
  setLastCopied: (s: string | null) => void;
  manifest: Manifest | null;
  /**
   * Specter (noclip) mode — only meaningful in edit mode. When ON the player
   * passes through world colliders and flies; toggled with Z. `specterRef`
   * mirrors the state for per-frame reads inside the canvas (PlayerController),
   * while `specter` drives React re-renders (the HUD).
   */
  specter: boolean;
  specterRef: React.MutableRefObject<boolean>;
  toggleSpecter: () => void;
};

const Ctx = createContext<EditCtx | null>(null);

export function EditProvider({ children }: { children: React.ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const liveRef = useRef<LiveCoords>({ pos: [0, 0, 0], yaw: 0, pitch: 0, hasBody: false });
  const [lastCopied, setLastCopied] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [specter, setSpecter] = useState(false);
  const specterRef = useRef(false);
  const toggleSpecter = () => {
    specterRef.current = !specterRef.current;
    setSpecter(specterRef.current);
  };

  // Read the edit flag from the URL after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEditMode(params.get('edit') === '1' || params.has('edit'));
  }, []);

  // Load + validate the manifest once.
  useEffect(() => {
    loadManifest()
      .then((m) => {
        setManifest(m);
        console.log(`✓ Manifest loaded: "${m.world.title}" — ${Object.keys(m.rooms).length} room(s), start_room="${m.world.start_room}"`);
      })
      .catch((e) => console.error('Manifest load/validation failed:', e));
  }, []);

  return (
    <Ctx.Provider value={{ editMode, liveRef, lastCopied, setLastCopied, manifest, specter, specterRef, toggleSpecter }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEdit() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEdit must be used within EditProvider');
  return c;
}
