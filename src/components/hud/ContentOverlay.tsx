'use client';

// A content artifact opens here: a fullscreen overlay over the canvas. The 3D
// world is paused (the player controller ignores input while pointer-lock is
// released), not destroyed — closing returns you exactly where you were. Opening
// pushes a history entry so the browser Back button (and Esc, and ✕) all close it.

import { useEffect } from 'react';
import { usePointerLock } from '@/providers/pointerLock';

export default function ContentOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const { unlock } = usePointerLock();

  useEffect(() => {
    unlock(); // release the mouse so the embedded page is usable
    window.history.pushState({ overlay: true }, '');
    const onPop = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') window.history.back(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [unlock, onClose]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-900 px-4 py-2 text-sm">
        <span className="truncate text-zinc-400">{url}</span>
        <div className="flex shrink-0 items-center gap-3">
          <a href={url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">open ↗</a>
          <button
            onClick={() => window.history.back()}
            className="rounded px-2 py-1 text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            ✕ close (Esc)
          </button>
        </div>
      </div>
      <iframe src={url} className="w-full flex-1 bg-white" title="content" />
    </div>
  );
}
