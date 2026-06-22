'use client';

// The room viewer. Renders the room named by the path (/<room>/), spawning the
// player at the entryway named by the URL fragment (/<room>/#<entryway>, default
// if absent). Exits are hyperlinks: same-origin links navigate client-side (smooth
// room-to-room); cross-origin (another museum) links do a full navigation. There
// is no manifest and no "museum" object — the graph is emergent from linked rooms.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  type Artifact,
} from '@/data/room';
import { roomToWorldDef } from '@/data/presets';
import { Reticle } from '@/components/hud/ClickToPlay';
import { IconButton } from '@/components/hud/Button';
import ContentOverlay from '@/components/hud/ContentOverlay';
import MobileHud from '@/components/controls/MobileHud';

const MOVE_SPEED = 14;
const EMPTY_EXITS: Exit[] = [];
const EMPTY_ARTIFACTS: Artifact[] = [];

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
    <div className="absolute left-1/2 bottom-24 z-20 -translate-x-1/2 pointer-events-none select-none">
      {/* Sharp-edged retro HUD prompt — monochrome pixel font, keycap glyph. */}
      <div
        className="flex items-center gap-2 bg-black/70 px-3 py-1.5 text-white/90 backdrop-blur-sm"
        style={{ fontFamily: 'var(--font-retro)' }}
      >
        <span className="text-[8px] uppercase leading-none">Press</span>
        <kbd className="grid h-5 min-w-[1.25rem] place-items-center border border-white/60 px-1 text-[10px] uppercase leading-none">
          E
        </kbd>
      </div>
    </div>
  );
}

function RootUIOverlays({ covered, loadError }: { covered: boolean; loadError?: string }) {
  const { isLocked, unlock } = usePointerLock();
  const { muted, setMuted } = useAudio();
  // Reticle + veil follow the blink (`covered`), not raw loading, so the crosshair
  // stays hidden behind the black and reappears only once the room is revealed.
  return (
    <>
      <Reticle visible={isLocked && !covered && !loadError} />
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
      {/* Cinematic "doorway blink": a full-screen black div whose opacity ramps
          0→1→0, so it literally dims every pixel to black and back. Driven by
          `covered` (see RoomViewer). The fade OUT is ~280ms — deliberately a hair
          shorter than the 320ms swap gate, so the veil is fully opaque before the
          new room is committed and nothing can flash through. Fade IN is a slower
          ~420ms reveal. The <Canvas> stays mounted underneath, so pointer lock,
          audio, and the GPU context persist across the swap. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-10 bg-black transition-opacity ${
          covered && !loadError
            ? 'opacity-100 duration-[280ms] ease-in-out'
            : 'opacity-0 duration-[420ms] ease-out'
        }`}
      />

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-zinc-900/90 border border-zinc-800">
            <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">!</span>
            </div>
            <div className="text-center">
              <p className="text-red-400 text-sm font-medium">Failed to load room</p>
              <p className="text-zinc-400 text-xs mt-1 max-w-xs">{loadError}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// roomId is read from the URL via usePathname() — NOT a prop — because this
// component is mounted in the ROOT layout (app/layout.tsx), not the page. The
// root layout is the only layout that survives navigation between sibling
// dynamic-segment values (/study → /library); a layout INSIDE the [room] segment
// remounts when the param changes. Because this instance (and the <Canvas> +
// pointer lock it owns) is never unmounted across a room switch, usePathname()
// just re-renders it with the new slug, the load effect below re-runs, and the
// room swaps in place with the mouse still locked. (If this were a page-level
// prop, the page subtree would remount on every router.push and the browser
// would drop pointer lock with the removed canvas element.)
export default function RoomViewer() {
  const router = useRouter();
  const pathname = usePathname();
  // Routes are a single segment: /<room>/. Take the first path part as the slug.
  // Off a room route (e.g. "/" before the landing redirect, or Next-internal
  // paths like "/_not-found") there is no room — render nothing and let the page
  // handle it. Reserved segments starting with "_" are ignored.
  const seg = (pathname ?? '').split('/').filter(Boolean)[0] ?? '';
  const roomId = seg.startsWith('_') ? '' : seg;

  const [room, setRoom] = useState<Room | null>(null);
  // The id the loaded `room` belongs to. Tracked separately from the `roomId`
  // prop so that, mid-transition, `world` is built from the room we're actually
  // still rendering (the old one) — never the new id paired with stale data.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [spawn, setSpawn] = useState<Spawn>(null);
  const [roomError, setRoomError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [exitActive, setExitActive] = useState(false);
  const [artifactActive, setArtifactActive] = useState(false);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const mobileInputRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const { setMusic } = useAudio();

  // Client-only gate. This viewer is hosted in the ROOT layout, which is
  // prerendered for every route during static export — but it renders nothing
  // meaningful on the server (no window, no splat, no pointer lock). Holding the
  // first client render to match the server's (null) avoids a hydration mismatch;
  // everything real mounts on the effect tick.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ---- Cinematic "doorway blink" ----
  // The black veil's opacity is driven by `covered`. The key to a smooth, glitch-
  // free transition is that the room SWAP is GATED on the veil being fully black:
  // the OLD world dims to black first, the NEW world is committed only behind an
  // opaque veil (see the load effect), then we fade back in. Binding the veil to
  // raw isLoading instead let the incoming splat finish mid-fade and flash its
  // brightest parts through the half-transparent veil.
  const FADE_OUT_MS = 320;   // gate: wait this long (veil fully black) before swapping
  const HOLD_MS = 140;       // min extra black hold after the new splat is ready
  const [covered, setCovered] = useState(true); // start covered for the cold load
  const coverStartRef = useRef(0);
  const loadedIdRef = useRef<string | null>(null); // committed room id, sync (no stale dep)

  // Load the room for the current path id, and resolve the spawn entryway from the
  // URL fragment (#entryway). Re-runs whenever the room id changes.
  //
  // We do NOT null the old room first. Room-to-room moves are same-origin soft
  // navigations (router.push, no document reload), so the <Canvas> below stays
  // mounted the whole time — which means the WebGL context, the audio, and the
  // pointer lock all survive the swap. Keeping the old room rendered until the
  // new one's data is in flips the room over in a single atomic state update
  // (room + id + spawn together) with no teardown, so the player never loses
  // mouselook and resumes walking the instant the new collider loads. The brief
  // splat/collider load is hidden by the cross-fade veil, not a re-engage gate.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setRoomError(undefined);
    // Begin the blink: dim the CURRENT world to black, and mark loading so the
    // reveal waits for the NEW splat (not the old one that's still on screen).
    setCovered(true);
    setIsLoading(true);
    coverStartRef.current = performance.now();
    const hadWorld = loadedIdRef.current !== null; // cold start has nothing to fade

    (async () => {
      let r: Room;
      try {
        r = await loadRoom(`/rooms/${roomId}/room.json`);
      } catch (e) {
        if (cancelled) return;
        console.error('Room load failed:', e);
        setRoomError(e instanceof Error ? e.message : String(e));
        return;
      }
      if (cancelled) return;
      // Gate the swap on the fade-to-black having fully finished, so the new room
      // mounts behind an opaque veil and can never flash through it. (Skip on cold
      // start — there's no old world to fade, just the loading screen.)
      const elapsed = performance.now() - coverStartRef.current;
      if (hadWorld && elapsed < FADE_OUT_MS) {
        await new Promise((res) => setTimeout(res, FADE_OUT_MS - elapsed));
        if (cancelled) return;
      }
      const ew = resolveEntryway(r, entrywayIdFromHash(window.location.hash));
      setRoom(r);
      setLoadedId(roomId);
      loadedIdRef.current = roomId;
      setSpawn(ew ? { pos: ew.pos, yaw: ew.yaw, key: `${roomId}#${ew.id}` } : null);
    })();
    return () => { cancelled = true; };
  }, [roomId]);

  // Reveal: once the committed room matches the URL AND its splat has finished
  // loading (behind the black), hold briefly then fade the veil back in. The
  // `loadedId === roomId` gate keeps us from revealing the OLD world during the
  // fade-out, and the manual setIsLoading(true) above keeps us from revealing in
  // the stale-false window right after the swap, before the new splat reports.
  useEffect(() => {
    if (loadedId !== roomId || isLoading) return;
    const elapsed = performance.now() - coverStartRef.current;
    const wait = Math.max(0, FADE_OUT_MS + HOLD_MS - elapsed);
    const t = setTimeout(() => setCovered(false), wait);
    return () => clearTimeout(t);
  }, [loadedId, roomId, isLoading]);

  // Preload neighbors: warm the HTTP cache for each same-origin exit's room.json
  // and its splat + collider, so walking through a door swaps in near-instantly
  // (the scene's loaders hit cache instead of the network). Best-effort and
  // fire-and-forget; dead/cross-origin links are skipped (the live nav handles
  // them). Plain fetch() → works on any static host, no server needed.
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    (async () => {
      for (const exit of room.exits) {
        let target: URL;
        try { target = new URL(exit.to, window.location.href); } catch { continue; }
        if (target.origin !== window.location.origin) continue;
        const slug = target.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
        if (!slug) continue;
        try {
          const neighbor = await loadRoom(`/rooms/${slug}/room.json`);
          if (cancelled) return;
          void fetch(neighbor.splat_url).catch(() => {});
          void fetch(neighbor.collider_url).catch(() => {});
        } catch { /* missing/dead room — skip */ }
      }
    })();
    return () => { cancelled = true; };
  }, [room]);

  // Memoize so position/quaternion/scale keep stable references — otherwise
  // SplatWorld's load effect (and the collider build) re-fire every render.
  // Built from `loadedId` (the id the loaded room actually belongs to), so a
  // mid-transition render never pairs the new id with the old room's assets.
  const world = React.useMemo(() => (room && loadedId ? roomToWorldDef(loadedId, room) : null), [room, loadedId]);
  const exits = room?.exits ?? EMPTY_EXITS;
  const artifacts = room?.artifacts ?? EMPTY_ARTIFACTS;
  const onArtifactOpen = useCallback((url: string) => setOverlayUrl(url), []);

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

  // Render nothing until mounted on the client, or when off a room route (e.g.
  // "/" before the landing redirect) — so the canvas host stays inert and the
  // page shows through.
  if (!mounted || !roomId) return null;

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
          playerMoveSpeed={MOVE_SPEED}
          onLoadingChange={handleLoadingChange}
          mobileInputRef={mobileInputRef}
          exits={exits}
          onExit={onExit}
          onActiveExitChange={setExitActive}
          artifacts={artifacts}
          onArtifactOpen={onArtifactOpen}
          onActiveArtifactChange={setArtifactActive}
          spawnYaw={spawn?.yaw}
          spawnKey={spawn?.key}
        />
      </RapierProvider>

      <ClickToEngage isLoading={isLoading} loadError={loadError} />
      <RootUIOverlays covered={covered} loadError={loadError} />
      <ExitHint active={exitActive || artifactActive} />
      {overlayUrl && <ContentOverlay url={overlayUrl} onClose={() => setOverlayUrl(null)} />}

      <EditHud roomName={world.name} />
      <MobileHud mobileInputRef={mobileInputRef} />
    </div>
  );
}
