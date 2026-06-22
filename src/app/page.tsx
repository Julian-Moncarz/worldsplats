'use client';

import React, { useRef, useState } from 'react';
import { RapierProvider } from '@/physics';
import { NavHeader } from "@/components/hud/NavHeader";
import { Spinner, VolumeMaxLine, VolumeXLine, HomeLine } from "@/icons";

import WorldScene from "@/components/scene/WorldScene";
import { PointerLockProvider, usePointerLock } from '@/providers/pointerLock';
import { AudioProvider, useAudio } from '@/providers/audio';
import { EditProvider, useEdit } from '@/providers/edit';
import EditHud from '@/components/edit/EditHud';
import type { Exit } from '@/data/manifest';
//const WorldScene = dynamic(() => import('@/components/scene/WorldScene'), { ssr: false });
type ShootHandle = { shoot: () => void; clear: () => void; };
import { OBJECTS, manifestToWorldDefs, type WorldDef, type ObjectDef } from '@/data/presets';
import { Reticle } from '@/components/hud/ClickToPlay';
import { IconButton, Button } from '@/components/hud/Button';
import MobileHud from '@/components/controls/MobileHud';

function OverlayUI({
  world,
  currentIndex,
  total,
  speed,
  setSpeed,
  onBack,
  onForward,
  isLoading,
  loadError,
}: {
  world: WorldDef;
  currentIndex: number;
  total: number;
  speed: number;
  setSpeed: (speed: number) => void;
  onBack: () => void;
  onForward: () => void;
  isLoading: boolean;
  loadError?: string;
}) {
  const { isLocked, lock } = usePointerLock();
  const { init } = useAudio();

  const handleClickToPlay = React.useCallback(async () => {
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
        const res = await DeviceMotionEvent.requestPermission();
        console.log('Motion permission:', res);
      }
    } catch (e) {
      console.log('Motion permission not available or denied:', e);
    }

    lock({ unadjustedMovement: false });
  }, [init, lock]);

  return (
    <div className="pointer-events-auto flex w-full sm:w-[480px] max-h-[80vh] flex-col rounded-lg border border-normal bg-zinc-900/70 bg-root backdrop-blur overflow-hidden">
      {/* NavHeader - always visible */}
      <div className="p-4 flex-shrink-0">
        <NavHeader
          title={world.name}
          detail={`${currentIndex + 1} of ${total}`}
          onBack={onBack}
          onForward={onForward}
        />
      </div>

      {/* Additional UI - hidden when locked */}
      <div className={`px-4 pb-4 space-y-4 overflow-y-auto flex-1 ${isLocked ? 'hidden' : ''}`}>
        <Divider />

        <label className="flex items-center gap-3 text-xs">
          <span className="pr-4">Speed</span>
          <input
            type="range" min={2} max={40} step={1}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full"
          />
          <span className="w-10 text-right tabular-nums">{speed}</span>
        </label>

        <p className="text-xs text-secondary">
          Movement: W/A/S/D + mouse.
          <br />
          Navigation: ←/→ or Q/E.
        </p>

        <Divider />
        <div className="space-y-1">
          <p className="text-xs text-secondary">Prompt image</p>
          <img src={world.imageUrl} alt="Prompt image" className="w-fit h-40 rounded-lg pt-2" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-secondary">World guide</p>
          <p className="text-xs text-zinc-200 max-h-40 overflow-y-auto">{world.guide}</p>
        </div>
        {world.imageCredit && <div className="space-y-1">
          <p className="text-xs text-secondary">Image credit</p>
          <p className="text-xs text-zinc-200 max-h-40 overflow-y-auto">{world.imageCredit}</p>
        </div>}
      </div>

      {/* Click to Play Footer - always visible when not locked */}
      {!isLocked && !isLoading && !loadError && (
        <div className="p-4 border-t border-normal">
          <Button
            className="w-full px-6 py-3 rounded-md border border-zinc-700 bg-zinc-800 text-base font-medium hover:bg-zinc-700 hover:border-zinc-600 transition-colors"
            onClick={handleClickToPlay}
            label="Click to play"
          />
        </div>
      )}
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

      {/* Loading overlay (kept from your code) */}
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

const Divider = () => {
  return (
    <div className="h-0.5 w-full bg-zinc-700"></div>
  );
};

const EMPTY_EXITS: Exit[] = [];

function PageContent() {
  const [object] = useState<ObjectDef>(OBJECTS[0]);
  const [speed, setSpeed] = useState<number>(14);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const shootRef = useRef<ShootHandle | null>(null);
  const mobileInputRef = useRef<{x:number;y:number}>({x:0,y:0});
  const { setMusic } = useAudio();
  const { manifest } = useEdit();

  // Runtime room list comes entirely from the manifest (start_room first).
  const worlds = React.useMemo(() => (manifest ? manifestToWorldDefs(manifest) : []), [manifest]);
  const [worldId, setWorldId] = useState<string | null>(null);

  // Enter the start room once the manifest has loaded.
  React.useEffect(() => {
    if (manifest && worldId === null) setWorldId(manifest.world.start_room);
  }, [manifest, worldId]);

  const world = worlds.find((w) => w.id === worldId) ?? null;
  const currentIndex = worlds.findIndex((w) => w.id === worldId);

  // The current room's doors, and the handler that walks you into a target room.
  const currentExits = React.useMemo(
    () => (worldId && manifest ? manifest.rooms[worldId]?.exits ?? EMPTY_EXITS : EMPTY_EXITS),
    [manifest, worldId],
  );
  const goToRoom = React.useCallback((to: string) => setWorldId(to), []);

  // Switch music when the room changes. Safe before/after audio init().
  const musicUrl = world?.musicUrl;
  React.useEffect(() => {
    if (musicUrl) setMusic(musicUrl);  // no-op until user clicks play, then it starts
  }, [musicUrl, setMusic]);

  const handleBack = () => {
    if (worlds.length === 0) return;
    const i = currentIndex < 0 ? 0 : currentIndex;
    setWorldId(worlds[(i - 1 + worlds.length) % worlds.length].id);
  };

  const handleForward = () => {
    if (worlds.length === 0) return;
    const i = currentIndex < 0 ? 0 : currentIndex;
    setWorldId(worlds[(i + 1) % worlds.length].id);
  };

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

  return (
    <div className="relative h-dvh w-dvw bg-black text-white font-sans">
      {/* 3D Canvas - fills entire viewport */}
      <RapierProvider world={world}>
        <WorldScene
          world={world}
          object={object}
          shootSink={shootRef}
          playerMoveSpeed={speed}
          onLoadingChange={handleLoadingChange}
          mobileInputRef={mobileInputRef}
          exits={currentExits}
          onCross={goToRoom}
        />
      </RapierProvider>

      {/* Overlay UI - positioned at top with pointer-events-none on container */}
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        <div className="flex justify-center p-4 sm:px-4 sm:pt-4">
          <OverlayUI
            world={world}
            currentIndex={currentIndex}
            total={worlds.length}
            speed={speed}
            setSpeed={setSpeed}
            onBack={handleBack}
            onForward={handleForward}
            isLoading={isLoading}
            loadError={loadError}
          />
        </div>
      </div>

      {/* Reticle + loading overlays + mute button */}
      <RootUIOverlays isLoading={isLoading} loadError={loadError} />

      {/* Edit-mode HUD (only renders when ?edit=1) */}
      <EditHud currentWorldId={world.id} />

      {/* Mobile controls */}
      <MobileHud mobileInputRef={mobileInputRef} />

      {/* keyboard shortcuts */}
      <ShootHotkey shootRef={shootRef} />
      <WorldNavigationHotkeys onBack={handleBack} onForward={handleForward} />
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

function WorldNavigationHotkeys({ onBack, onForward }: { onBack: () => void; onForward: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        onBack();
      } else if (e.code === 'ArrowRight' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        onForward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, onForward]);
  return null;
}
