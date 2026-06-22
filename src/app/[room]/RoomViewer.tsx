'use client';

// The room viewer. Renders the room named by the path (/<room>/), spawning the
// player at the entryway named by the URL fragment (/<room>/#<entryway>, default
// if absent). Exits are hyperlinks: same-origin links navigate client-side (smooth
// room-to-room); cross-origin (another museum) links do a full navigation. There
// is no manifest and no "museum" object — the graph is emergent from linked rooms.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RapierProvider } from '@/physics';
import { Spinner, VolumeMaxLine, VolumeXLine, HomeLine } from '@/icons';

import WorldScene from '@/components/scene/WorldScene';
import { usePointerLock } from '@/providers/pointerLock';
import { useAudio } from '@/providers/audio';
import EditHud from '@/components/edit/EditHud';
import {
  loadRoom,
  resolveEntryway,
  entrywayIdFromHash,
  type Room,
  type Exit,
} from '@/data/room';
import { roomToWorldDef, OBJECTS, type ObjectDef } from '@/data/presets';
import { Reticle } from '@/components/hud/ClickToPlay';
import { IconButton } from '@/components/hud/Button';
import MobileHud from '@/components/controls/MobileHud';

type ShootHandle = { shoot: () => void; clear: () => void };

const MOVE_SPEED = 14;
const EMPTY_EXITS: Exit[] = [];

type Spawn = { pos: [number, number, number]; yaw: number; key: string } | null;

// The world renders immediately — the user is "in the room" on page load. But
// browsers require a user gesture before pointer-lock + audio can start, so the
// FIRST interaction the user makes anyway (any click, or the first WASD keypress)
// silently engages look controls and starts sound. No button, no prompt.
function ClickToEngage({ isLoading, loadError }: { isLoading: boolean; loadError?: string }) {
  const { isLocked, lock } = usePointerLock();
  const { init } = useAudio();
  const blocked = isLocked || isLoading || !!loadError;

  const engage = useCallback(async () => {
    try { await init(); } catch (e) { console.error('Failed to initialize audio:', e); }
    try {
      if (typeof DeviceMotionEvent !== 'undefined' &&
          // @ts-expect-error - iOS-specific
          typeof DeviceMotionEvent.requestPermission === 'function') {
        // @ts-expect-error - iOS-specific
        await DeviceMotionEvent.requestPermission();
      }
    } catch (e) { console.log('Motion permission not available or denied:', e); }
    lock({ unadjustedMovement: false });
  }, [init, lock]);

  // First keypress is a valid user gesture too — engage on it so movement keys
  // double as the "enter" action and the mouse grabs without a separate click.
  useEffect(() => {
    if (blocked) return;
    const onKey = () => { void engage(); };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [blocked, engage]);

  if (blocked) return null;

  // Invisible full-screen catcher: the first click anywhere engages, no label.
  return <button onClick={engage} aria-label="Enter room" className="absolute inset-0 z-20 bg-transparent" />;
}

// On-screen "Press E" hint, shown while playing and near an exit.
function ExitHint({ active }: { active: boolean }) {
  const { isLocked } = usePointerLock();
  if (!active || !isLocked) return null;
  return (
    <div className="absolute left-1/2 bottom-24 z-20 -translate-x-1/2 pointer-events-none">
      <div className="rounded-md border border-white/15 bg-black/70 px-4 py-2 text-sm text-white backdrop-blur">
        Press <span className="font-bold text-amber-300">E</span>
      </div>
    </div>
  );
}

function RootUIOverlays({ isLoading, loadError }: { isLoading: boolean; loadError?: string }) {
  const { isLocked, unlock } = usePointerLock();
  const { muted, setMuted } = useAudio();
  return (
    <>
      <Reticle visible={isLocked && !isLoading && !loadError} />
      <IconButton
        aria-label="Toggle volume"
        onClick={() => setMuted(!muted)}
        className="absolute top-4 right-4 sm:top-4 sm:right-4 max-sm:top-auto max-sm:bottom-4 z-10 stroke-secondary"
        icon={muted ? <VolumeXLine /> : <VolumeMaxLine />}
      />
      {isLocked && (
        <IconButton
          aria-label="Exit play"
          onClick={unlock}
          className="absolute bottom-20 right-4 sm:hidden z-10 stroke-secondary"
          icon={<HomeLine />}
        />
      )}
      {(isLoading || loadError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-zinc-900/90 border border-zinc-800">
            {isLoading ? (
              <>
                <Spinner size={32} className="text-white" />
                <p className="text-white text-sm">Loading room…</p>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">!</span>
                </div>
                <div className="text-center">
                  <p className="text-red-400 text-sm font-medium">Failed to load room</p>
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

function ShootHotkey({ shootRef }: { shootRef: React.RefObject<ShootHandle | null> }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); shootRef.current?.shoot(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shootRef]);
  return null;
}

export default function RoomViewer({ roomId }: { roomId: string }) {
  const router = useRouter();

  const [object] = useState<ObjectDef>(OBJECTS[0]);
  const [room, setRoom] = useState<Room | null>(null);
  const [spawn, setSpawn] = useState<Spawn>(null);
  const [roomError, setRoomError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [exitActive, setExitActive] = useState(false);
  const shootRef = useRef<ShootHandle | null>(null);
  const mobileInputRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const { setMusic } = useAudio();

  // Load the room for the current path id, and resolve the spawn entryway from the
  // URL fragment (#entryway). Re-runs whenever the room id changes.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setRoom(null);
    setSpawn(null);
    setRoomError(undefined);
    loadRoom(`/rooms/${roomId}/room.json`)
      .then((r) => {
        if (cancelled) return;
        setRoom(r);
        const ewId = entrywayIdFromHash(window.location.hash);
        const ew = resolveEntryway(r, ewId);
        setSpawn(ew ? { pos: ew.pos, yaw: ew.yaw, key: `${roomId}#${ew.id}` } : null);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('Room load failed:', e);
        setRoomError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [roomId]);

  // Memoize so position/quaternion/scale keep stable references — otherwise
  // SplatWorld's load effect (and the collider build) re-fire every render.
  const world = React.useMemo(() => (room ? roomToWorldDef(roomId, room) : null), [room, roomId]);
  const exits = room?.exits ?? EMPTY_EXITS;

  // Follow an exit's link. Same-origin links navigate client-side (smooth room
  // swap); other origins do a full navigation (cross-museum). Dead links 404 —
  // acceptable by design.
  const onExit = useCallback((to: string) => {
    const url = new URL(to, window.location.href);
    if (url.origin === window.location.origin) {
      router.push(url.pathname + url.hash);
    } else {
      window.location.href = url.href;
    }
  }, [router]);

  // Switch music when the room changes.
  const musicUrl = world?.musicUrl;
  useEffect(() => { if (musicUrl) setMusic(musicUrl); }, [musicUrl, setMusic]);

  const handleLoadingChange = (loading: boolean, error?: string) => {
    setIsLoading(loading);
    setLoadError(error);
  };

  if (roomError) {
    return (
      <div className="relative h-dvh w-dvw bg-black text-white font-sans flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-white text-sm font-bold">!</span>
          </div>
          <p className="text-sm text-zinc-300">Room “{roomId}” couldn’t be loaded.</p>
          <p className="text-xs text-zinc-500 max-w-xs">{roomError}</p>
        </div>
      </div>
    );
  }

  if (!world) {
    return (
      <div className="relative h-dvh w-dvw bg-black text-white font-sans flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size={32} className="text-white" />
          <p className="text-sm text-zinc-300">Loading room…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-dvw bg-black text-white font-sans">
      <RapierProvider
        world={world}
        spawn={spawn ? { x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2] } : null}
      >
        <WorldScene
          world={world}
          object={object}
          shootSink={shootRef}
          playerMoveSpeed={MOVE_SPEED}
          onLoadingChange={handleLoadingChange}
          mobileInputRef={mobileInputRef}
          exits={exits}
          onExit={onExit}
          onActiveExitChange={setExitActive}
          spawnYaw={spawn?.yaw}
          spawnKey={spawn?.key}
        />
      </RapierProvider>

      <ClickToEngage isLoading={isLoading} loadError={loadError} />
      <RootUIOverlays isLoading={isLoading} loadError={loadError} />
      <ExitHint active={exitActive} />

      <EditHud roomName={world.name} />
      <MobileHud mobileInputRef={mobileInputRef} />
      <ShootHotkey shootRef={shootRef} />
    </div>
  );
}
