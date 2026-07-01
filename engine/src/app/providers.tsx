'use client';

import { PointerLockProvider } from '@/providers/pointerLock';
import { AudioProvider } from '@/providers/audio';
import { EditProvider } from '@/providers/edit';

export default function Providers({
  children,
  moveSpeed,
}: {
  children: React.ReactNode;
  /** From otherplane.config.json (read server-side in the root layout). */
  moveSpeed?: number;
}) {
  return (
    <PointerLockProvider>
      <AudioProvider>
        <EditProvider moveSpeed={moveSpeed}>{children}</EditProvider>
      </AudioProvider>
    </PointerLockProvider>
  );
}
