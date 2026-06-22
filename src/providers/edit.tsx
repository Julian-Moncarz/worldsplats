'use client';

// Edit mode: the viewer's authoring flag, set by the URL query `?edit=1` (or just
// `?edit`). It writes nothing — it adds a live, copyable pos+yaw HUD, a "beam"
// raycast for marking artifacts, and a no-clip "specter" fly (toggle Z) so you can
// reach any spot to mark entryways/exits, then hand the coordinates to Claude.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

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

  return (
    <Ctx.Provider value={{ editMode, liveRef, lastCopied, setLastCopied, specter, specterRef, toggleSpecter }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEdit() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEdit must be used within EditProvider');
  return c;
}
