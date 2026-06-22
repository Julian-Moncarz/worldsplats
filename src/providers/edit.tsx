'use client';

// Edit mode: the viewer's authoring flag. It's a property of the running INSTANCE,
// not the request — so a published museum can't be flipped into edit mode by a
// visitor. Turn it on with `npm run edit` (sets NEXT_PUBLIC_EDIT_MODE=1). As a
// dev-only convenience, `?edit=1` in the URL still works when not in production;
// production builds have no edit mode at all.
//
// Edit mode writes nothing — it adds a live, copyable pos+yaw HUD, a "beam"
// raycast for marking artifacts, and a no-clip "specter" fly (toggle Z) so you can
// reach any spot to mark entryways/exits, then hand the coordinates to Claude.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const ENV_EDIT = process.env.NEXT_PUBLIC_EDIT_MODE === '1';

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

  // Resolve the edit flag after mount (avoids SSR hydration mismatch). The env
  // flag is the source of truth; the URL query is a dev-only convenience.
  useEffect(() => {
    if (ENV_EDIT) { setEditMode(true); return; }
    if (process.env.NODE_ENV !== 'production') {
      const params = new URLSearchParams(window.location.search);
      setEditMode(params.get('edit') === '1' || params.has('edit'));
    }
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
