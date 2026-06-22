'use client';

import React, { useCallback, useRef, useState } from 'react';
import { RapierProvider } from '@/physics';
import { Spinner, VolumeMaxLine, VolumeXLine, HomeLine } from "@/icons";

import WorldScene from "@/components/scene/WorldScene";
import { PointerLockProvider, usePointerLock } from '@/providers/pointerLock';
import { AudioProvider, useAudio } from '@/providers/audio';
import { EditProvider, useEdit } from '@/providers/edit';
import EditHud from '@/components/edit/EditHud';
import type { Exit } from '@/data/manifest';
type ShootHandle = { shoot: () => void; clear: () => void; };
import { OBJECTS, manifestToWorldDefs, type ObjectDef } from '@/data/presets';
import { Reticle } from '@/components/hud/ClickToPlay';
import { IconButton, Button } from '@/components/hud/Button';
import MobileHud from '@/components/controls/MobileHud';

const MOVE_SPEED = 14;

// Minimal entry overlay. Browsers require a user gesture before pointer-lock and
// audio, so this is the one thing between page load and walking — no room picker.
function ClickToPlayCard({ isLoading, loadError }: { isLoading: boolean; loadError?: string }) {
  const { isLocked, lock } = usePointerLock();
  const { init } = useAudio();

  const handleClickToPlay = useCallback(async () => {
    try {
      await init();
    } catch (e) {
      console.error('Failed to initialize audio:', e);
    }
    // iOS motion permission (optional)
    try {
      if (typeof DeviceMotionEvent !== 'undefined' &&
          // @ts-expect-error - DeviceMotionEvent.requestPermission is iOS-specific
          typeof DeviceMotionEvent.requestPermission === 'function') {
        // @ts-expect-error - DeviceMotionEvent.requestPermission is iOS-specific
        await DeviceMotionEvent.requestPermission();
      }
    } catch (e) {
      console.log('Motion permission not available or denied:', e);
    }
    lock({ unadjustedMovement: false });
  }, [init, lock]);

  if (isLocked || isLoading || loadError) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-center gap-4 rounded-xl border border-zinc-700 bg-zinc-900/80 px-8 py-6 text-center backdrop-blur">
        <p className="text-sm text-zinc-300">
          WASD + mouse to move and look.
          <br />
          Walk to a glowing door and press{' '}
          <span className="font-bold text-amber-300">E</span> to enter.
        </p>
        <Button
          className="px-6 py-3 rounded-md border border-zinc-700 bg-zinc-800 text-base font-medium hover:bg-zinc-700 hover:border-zinc-600 transition-colors"
          onClick={handleClickToPlay}
          label="Click to play"
        />
      </div>
    </div>
  );
}

// On-screen "Press E to enter <room>" hint, shown only while playing.
function DoorHint({ name }: { name: string | null }) {
  const { isLocked } = usePointerLock();
  if (!name || !isLocked) return null;
  return (
    <div className="absolute left-1/2 bottom-24 z-20 -translate-x-1/2 pointer-events-none">
      <div className="rounded-md border border-white/15 bg-black/70 px-4 py-2 text-sm text-white backdrop-blur">
        Press <span className="font-bold text-amber-300">E</span> to enter {name}
      </div>
    </div>
  );
}

function RootUIOverlays({
  isLoading,
  loadError,
}: {
  isLoading: boolean; loadError?: string;
}) {
  const { isLocked, unlock } = usePointerLock();
  const { muted, setMuted } = useAudio();

  return (
    <>
      <Reticle visible={isLocked && !isLoading && !loadError} />

      {/* Mute button - top-right on desktop, bottom-right on mobile */}
      <IconButton
        aria-label="Toggle volume"
        onClick={() => setMuted(!muted)}
        className="absolute top-4 right-4 sm:top-4 sm:right-4 max-sm:top-auto max-sm:bottom-4 z-10 stroke-secondary"
        icon={muted ? <VolumeXLine /> : <VolumeMaxLine />}
      />

      {/* Exit play button - mobile only, above mute button */}
      {isLocked && (
        <IconButton
          aria-label="Exit play"
          onClick={unlock}
          className="absolute bottom-20 right-4 sm:hidden z-10 stroke-secondary"
          icon={<HomeLine />}
        />
      )}

      {/* Loading overlay */}
      {(isLoading || loadError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-zinc-900/90 border border-zinc-800">
            {isLoading ? (
              <>
                <Spinner size={32} className="text-white" />
                <p className="text-white text-sm">Loading world...</p>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">!</span>
                </div>
                <div className="text-center">
                  <p className="text-red-400 text-sm font-medium">Failed to load world</p>
                  <p className="text-zinc-400 text-xs mt-1 max-w-xs">{loadError}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const EMPTY_EXITS: Exit[] = [];

function PageContent() {
  const [object] = useState<ObjectDef>(OBJECTS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [activeExitTo, setActiveExitTo] = useState<string | null>(null);
  const shootRef = useRef<ShootHandle | null>(null);
  const mobileInputRef = useRef<{x:number;y:number}>({x:0,y:0});
  const { setMusic } = useAudio();
  const { manifest } = useEdit();

  // Runtime room list comes entirely from the manifest (start_room first).
  const worlds = React.useMemo(() => (manifest ? manifestToWorldDefs(manifest) : []), [manifest]);
  const [worldId, setWorldId] = useState<string | null>(null);

  // One URL = one room: the room is chosen by ?room=<id> on load (default = start
  // room), and the URL is kept in sync as you walk through doors.
  React.useEffect(() => {
    if (!manifest || worldId !== null) return;
    const requested = new URLSearchParams(window.location.search).get('room');
    setWorldId(requested && manifest.rooms[requested] ? requested : manifest.world.start_room);
  }, [manifest, worldId]);

  const world = worlds.find((w) => w.id === worldId) ?? null;

  const currentExits = React.useMemo(
    () => (worldId && manifest ? manifest.rooms[worldId]?.exits ?? EMPTY_EXITS : EMPTY_EXITS),
    [manifest, worldId],
  );

  const goToRoom = React.useCallback((to: string) => {
    setWorldId(to);
    setActiveExitTo(null);
    const params = new URLSearchParams(window.location.search);
    params.set('room', to);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, []);

  // Switch music when the room changes. Safe before/after audio init().
  const musicUrl = world?.musicUrl;
  React.useEffect(() => {
    if (musicUrl) setMusic(musicUrl);  // no-op until user clicks play, then it starts
  }, [musicUrl, setMusic]);

  const handleLoadingChange = (loading: boolean, error?: string) => {
    setIsLoading(loading);
    setLoadError(error);
  };

  // Wait for the manifest before there's a room to show.
  if (!world) {
    return (
      <div className="relative h-dvh w-dvw bg-black text-white font-sans flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size={32} className="text-white" />
          <p className="text-sm text-zinc-300">Loading world…</p>
        </div>
      </div>
    );
  }

  const activeExitName =
    activeExitTo && manifest ? manifest.rooms[activeExitTo]?.display_name ?? activeExitTo : null;

  return (
    <div className="relative h-dvh w-dvw bg-black text-white font-sans">
      {/* 3D Canvas - fills entire viewport */}
      <RapierProvider world={world}>
        <WorldScene
          world={world}
          object={object}
          shootSink={shootRef}
          playerMoveSpeed={MOVE_SPEED}
          onLoadingChange={handleLoadingChange}
          mobileInputRef={mobileInputRef}
          exits={currentExits}
          onCross={goToRoom}
          onActiveExitChange={setActiveExitTo}
        />
      </RapierProvider>

      {/* Entry overlay + reticle + loading + mute */}
      <ClickToPlayCard isLoading={isLoading} loadError={loadError} />
      <RootUIOverlays isLoading={isLoading} loadError={loadError} />
      <DoorHint name={activeExitName} />

      {/* Edit-mode HUD (only renders when ?edit=1) */}
      <EditHud currentWorldId={world.id} />

      {/* Mobile controls */}
      <MobileHud mobileInputRef={mobileInputRef} />

      {/* keyboard shortcuts */}
      <ShootHotkey shootRef={shootRef} />
    </div>
  );
}

export default function Page() {
  return (
    <PointerLockProvider>
      <AudioProvider>
        <EditProvider>
          <PageContent />
        </EditProvider>
      </AudioProvider>
    </PointerLockProvider>
  );
}

function ShootHotkey({ shootRef }: { shootRef: React.RefObject<ShootHandle | null> }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        shootRef.current?.shoot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shootRef]);
  return null;
}
