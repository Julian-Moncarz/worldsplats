'use client';

import { PointerLockProvider } from '@/providers/pointerLock';
import { AudioProvider } from '@/providers/audio';
import { EditProvider } from '@/providers/edit';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PointerLockProvider>
      <AudioProvider>
        <EditProvider>{children}</EditProvider>
      </AudioProvider>
    </PointerLockProvider>
  );
}
