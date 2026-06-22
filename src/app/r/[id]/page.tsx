'use client';

// One room = one URL. This route renders the room named by the path (/r/<id>),
// spawning the player at the entryway named by the URL fragment (/r/<id>#<entryway>,
// default if absent). Exits are hyperlinks: same-museum links navigate client-side;
// cross-museum (different origin) links do a full navigation. There is no manifest
// and no "museum" object — the graph is emergent from linked rooms.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RapierProvider } from '@/physics';
import { Spinner, VolumeMaxLine, VolumeXLine, HomeLine } from '@/icons';

import WorldScene from '@/components/scene/WorldScene';
import { usePointerLock } from '@/providers/pointerLock';
import { useAudio } from '@/providers/audio';
import { useEdit } from '@/providers/edit';
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

// Full-screen click catcher. The world renders immediately (no enter modal), but
// browsers require a user gesture before pointer-lock + audio, so the first click
// anywhere engages look controls and starts sound.
function ClickToEngage({ isLoading, loadError }: { isLoading: boolean; loadError?: string }) {
  const { isLocked, lock } = usePointerLock();
  const { init } = useAudio();

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

  if (isLocked || isLoading || loadError) return null;

  return (
    <button
      onClick={engage}
      className="absolute inset-0 z-20 flex items-end justify-center bg-transparent pb-16 text-center"
    >
      <span className="rounded-md border border-white/15 bg-black/60 px-4 py-2 text-sm text-zinc-200 backdrop-blur">
        Click to explore · WASD to move · look with the mouse
      </span>
    </button>
  );
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

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');

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
    if (!id) return;
    let cancelled = false;
    setRoom(null);
    setSpawn(null);
    setRoomError(undefined);
    loadRoom(id)
      .then((r) => {
        if (cancelled) return;
        setRoom(r);
        const ewId = entrywayIdFromHash(window.location.hash);
        const ew = resolveEntryway(r, ewId);
        setSpawn(ew ? { pos: ew.pos, yaw: ew.yaw, key: `${id}#${ew.id}` } : null);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('Room load failed:', e);
        setRoomError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [id]);

  // Memoize so position/quaternion/scale keep stable references — otherwise
  // SplatWorld's load effect (and the collider build) re-fire every render.
  const world = React.useMemo(() => (room ? roomToWorldDef(id, room) : null), [room, id]);
  const exits = room?.exits ?? EMPTY_EXITS;

  // Follow an exit's link. Same-origin /r/ links navigate client-side (the page
  // re-renders with the new id + fragment); anything else is a full navigation
  // (cross-museum). Dead links just 404 — acceptable by design.
  const onExit = useCallback((to: string) => {
    const url = new URL(to, window.location.href);
    const sameApp = url.origin === window.location.origin && url.pathname.startsWith('/r/');
    if (sameApp) {
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
          <p className="text-sm text-zinc-300">Room “{id}” couldn’t be loaded.</p>
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
