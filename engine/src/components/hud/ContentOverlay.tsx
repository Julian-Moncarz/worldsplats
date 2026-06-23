'use client';

// A content artifact opens here: the page, fullscreen, over the canvas. The 3D
// world is paused (the player controller ignores input while pointer-lock is
// released), not destroyed — closing returns you exactly where you were. Closing
// (the ✕ or Esc) re-acquires pointer-lock in the same gesture, so mouse-look
// resumes immediately with no extra click.
//
// We keep a small floating ✕ rather than going fully chromeless: once you click
// into a cross-origin iframe, key events go to it, so Esc alone can't be relied on.

import { useCallback, useEffect } from 'react';
import { usePointerLock } from '@/providers/pointerLock';

export default function ContentOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const { lock, unlock } = usePointerLock();

  // Release the mouse so the embedded page is usable.
  useEffect(() => { unlock(); }, [unlock]);

  const close = useCallback(() => {
    lock();      // re-grab the mouse in this gesture's call stack
    onClose();
  }, [lock, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div className="absolute inset-0 z-30 bg-black">
      <iframe src={url} className="h-full w-full border-0 bg-white" title="content" />
      <button
        onClick={close}
        aria-label="Close (Esc)"
        className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
      >
        ✕
      </button>
    </div>
  );
}
