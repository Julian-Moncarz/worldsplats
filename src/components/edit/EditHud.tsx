'use client';

// The edit-mode HUD (spec §10): a live, copyable pos+yaw readout, plus a hint of
// the marking keys and the last-copied value. DOM overlay (outside the Canvas); it
// reads the live coords ref that EditCapture mutates each frame.

import { useEffect, useState } from 'react';
import { useEdit } from '@/providers/edit';

const f = (n: number) => n.toFixed(2);

export default function EditHud({ currentWorldId }: { currentWorldId: string }) {
  const { editMode, liveRef, lastCopied, manifest } = useEdit();
  const [text, setText] = useState('pos:[…], yaw:…');

  useEffect(() => {
    if (!editMode) return;
    let raf = 0;
    const tick = () => {
      const l = liveRef.current;
      setText(
        l.hasBody
          ? `pos:[${f(l.pos[0])},${f(l.pos[1])},${f(l.pos[2])}], yaw:${f(l.yaw)}, pitch:${f(l.pitch)}`
          : 'waiting for player body… (click to play)',
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [editMode, liveRef]);

  if (!editMode) return null;

  const room = manifest?.rooms[currentWorldId];
  const marking = room
    ? `marking: ${room.display_name}`
    : `current world "${currentWorldId}" is not in the manifest`;

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20 max-w-[92vw] space-y-1 rounded-lg border border-amber-500/40 bg-zinc-900/85 px-4 py-3 font-mono text-xs text-amber-200 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-amber-400">EDIT MODE</span>
        <span className="text-zinc-400">· {marking}</span>
      </div>
      <div className="select-text text-zinc-100">{text}</div>
      <div className="text-zinc-400">
        <span className="text-amber-300">C</span> copy pos+yaw (spawn / door) ·{' '}
        <span className="text-amber-300">B</span> beam-copy + drop orb (artifact) ·{' '}
        <span className="text-amber-300">X</span> clear orbs
      </div>
      {lastCopied && (
        <div className="select-text text-emerald-300">copied → {lastCopied}</div>
      )}
    </div>
  );
}
