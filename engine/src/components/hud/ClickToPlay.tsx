'use client';

export function Reticle({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 opacity-85">
      <div className="relative w-[12px] h-[12px]">
        <div className="absolute left-1/2 top-0 w-[2px] h-full -translate-x-1/2 bg-zinc-200/40" />
        <div className="absolute top-1/2 left-0 h-[2px] w-full -translate-y-1/2 bg-zinc-200/40" />
      </div>
    </div>
  );
}
