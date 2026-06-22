'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { CONFIG as UNIVERSE_CONFIG } from '@/data/universeconfig'
import type { WorldDef } from '@/data/presets';

type RapierCtx = {
  rapier: typeof RAPIER | null;
  world: RAPIER.World | null;
  playerBody: RAPIER.RigidBody | null;
};
const Ctx = createContext<RapierCtx>({ rapier: null, world: null, playerBody: null });

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

// Find a clear, stand-able floor spot near the room's center, so we don't drop
// the player inside a wall or a bookshelf. For a grid of candidate (x,z) points
// (center first), cast a ray straight down from mid-height (inside the room,
// below any ceiling) to find the floor, then cast up to require player-height
// headroom. Returns the valid spot nearest the center, or null if none.
function findValidSpawn(
  world: RAPIER.World,
  rapier: typeof RAPIER,
  aabb: THREE.Box3,
  RADIUS: number,
  HALF_HEIGHT: number,
  excludeBody: RAPIER.RigidBody | null,
): { x: number; y: number; z: number } | null {
  const cx = (aabb.min.x + aabb.max.x) / 2;
  const cz = (aabb.min.z + aabb.max.z) / 2;
  const midY = (aabb.min.y + aabb.max.y) / 2;
  const stand = HALF_HEIGHT + RADIUS;            // body-center height above feet
  const playerH = 2 * HALF_HEIGHT + 2 * RADIUS;  // approx full capsule height
  const downMax = midY - aabb.min.y + 1;
  const exclude = excludeBody ?? undefined;

  const cand: Array<[number, number]> = [[cx, cz]];
  const N = 5;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const fx = (i + 0.5) / N;
      const fz = (j + 0.5) / N;
      cand.push([
        aabb.min.x + fx * (aabb.max.x - aabb.min.x),
        aabb.min.z + fz * (aabb.max.z - aabb.min.z),
      ]);
    }
  }

  let best: { x: number; y: number; z: number } | null = null;
  let bestD = Infinity;
  for (const [x, z] of cand) {
    const down = new rapier.Ray({ x, y: midY, z }, { x: 0, y: -1, z: 0 });
    const dh = world.castRay(down, downMax, true, undefined, undefined, undefined, exclude);
    if (!dh || dh.toi <= 0.001) continue;        // no floor below, or we're in a solid
    const floorY = midY - dh.toi;
    const up = new rapier.Ray({ x, y: floorY + 0.1, z }, { x: 0, y: 1, z: 0 });
    const uh = world.castRay(up, playerH, true, undefined, undefined, undefined, exclude);
    if (uh && uh.toi < playerH) continue;        // shelf / low ceiling above — not stand-able
    const d = (x - cx) ** 2 + (z - cz) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x, y: floorY + stand + 0.05, z };
    }
  }
  return best;
}

export function RapierProvider({
  gravity = UNIVERSE_CONFIG.GRAVITY,
  world: worldDef,
  spawn,
  children,
}: {
  gravity?: { x: number; y: number; z: number };
  world?: WorldDef;
  /** Entryway spawn (body-center). When set it overrides the floor search. */
  spawn?: { x: number; y: number; z: number } | null;
  children: React.ReactNode;
}) {
  const [rapierReady, setRapierReady] = useState(false);
  const worldRef = useRef<RAPIER.World | null>(null);
  const rapierRef = useRef<typeof RAPIER | null>(null);
  const accRef = useRef(0);
  const prevRef = useRef<number>(performance.now());
  const envBodyRef = useRef<RAPIER.RigidBody | null>(null);
  const envCollidersRef = useRef<RAPIER.Collider[]>([]);
  const playerBodyRef = useRef<RAPIER.RigidBody | null>(null);
  const [playerBodyState, setPlayerBodyState] = useState<RAPIER.RigidBody | null>(null);
  // spawn the player actually teleports to: the entryway override when provided,
  // else a best-effort floor search from the room collider.
  const [resolvedSpawn, setResolvedSpawn] = useState<{ x: number; y: number; z: number } | null>(null);
  // latest entryway override, read inside the async collider-load callback
  const spawnPropRef = useRef(spawn);
  spawnPropRef.current = spawn;

  // init once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await RAPIER.init();
      if (cancelled) return;
      rapierRef.current = RAPIER;
      worldRef.current = new RAPIER.World(gravity);
      setRapierReady(true);
    })();
    return () => {
      cancelled = true;
      // dispose world on unmount
      if (worldRef.current) {
        worldRef.current.free();
        worldRef.current = null;
      }
    };
  }, [gravity.x, gravity.y, gravity.z]);

  // fixed-step stepping loop (piggybacks on r3f’s render loop if present)
  useEffect(() => {
    if (!rapierReady) return;
    let mounted = true;
    const loop = (t: number) => {
      if (!mounted) return;
      const world = worldRef.current;
      if (world) {
        const dt = Math.min((t - prevRef.current) / 1000, 0.1);
        prevRef.current = t;
        accRef.current += dt;
        let steps = 0;
        while (accRef.current >= FIXED_DT && steps < MAX_STEPS) {
          world.step();
          accRef.current -= FIXED_DT;
          steps++;
        }
      }
      requestAnimationFrame(loop);
    };
    prevRef.current = performance.now();
    requestAnimationFrame(loop);
    return () => { mounted = false; };
  }, [rapierReady]);

  // Build the environment collider for the CURRENT world.
  // When the world has a colliderUrl (a Marble collider GLB), bake the same
  // position/quaternion/scale the splat uses (see SplatWorld) into the trimesh so
  // walls/floor line up with what you see; otherwise fall back to the flat floor.
  const colliderUrl = worldDef?.colliderUrl ?? UNIVERSE_CONFIG.ENVIRONMENT.MESH;
  const isRoomCollider = !!worldDef?.colliderUrl;
  const posKey = (worldDef?.position ?? [0, 0, 0]).join(',');
  const quatKey = (worldDef?.quaternion ?? [0, 0, 0, 1]).join(',');
  const scaleKey = worldDef?.scale ?? 1;

  useEffect(() => {
    if (!rapierReady) return;
    const world = worldRef.current;
    const rapier = rapierRef.current;
    if (!world || !rapier) return;
    let disposed = false;

    // transform matching the splat's (identity for the flat-floor fallback)
    const M = new THREE.Matrix4();
    if (isRoomCollider) {
      const p = worldDef!.position ?? [0, 0, 0];
      const q = worldDef!.quaternion ?? [0, 0, 0, 1];
      const s = worldDef!.scale ?? 1;
      M.compose(
        new THREE.Vector3(p[0], p[1], p[2]),
        new THREE.Quaternion(q[0], q[1], q[2], q[3]),
        new THREE.Vector3(s, s, s),
      );
    }

    const loader = new GLTFLoader();
    loader.load(colliderUrl, (gltf) => {
      if (disposed) return;
      const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      envBodyRef.current = body;
      const created: RAPIER.Collider[] = [];
      const aabb = new THREE.Box3();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((child: THREE.Object3D) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        mesh.updateWorldMatrix(true, false);
        const geom = mesh.geometry.clone();
        geom.applyMatrix4(new THREE.Matrix4().multiplyMatrices(M, mesh.matrixWorld));
        const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | null;
        if (!posAttr) return;
        geom.computeBoundingBox();
        if (geom.boundingBox) aabb.union(geom.boundingBox);
        const vertices = new Float32Array(posAttr.array);
        let indices: Uint32Array;
        if (geom.index) indices = new Uint32Array(geom.index.array as ArrayLike<number>);
        else {
          indices = new Uint32Array(posAttr.count);
          for (let i = 0; i < posAttr.count; i++) indices[i] = i;
        }
        const colDesc = rapier
          .ColliderDesc.trimesh(vertices, indices)
          .setRestitution(UNIVERSE_CONFIG.ENVIRONMENT_RESTITUTION);
        created.push(world.createCollider(colDesc, body));
      });
      envCollidersRef.current = created;

      const override = spawnPropRef.current;
      if (override) {
        // The room declares an entryway — trust it (this is the marked, known-good
        // spot, and what fixes feet-below-floor spawns).
        setResolvedSpawn(override);
      } else if (isRoomCollider && !aabb.isEmpty()) {
        // No entryway yet (e.g. a freshly generated, unmarked room): best-effort.
        const { RADIUS, HALF_HEIGHT } = UNIVERSE_CONFIG.PLAYER;
        const found = findValidSpawn(world, rapier, aabb, RADIUS, HALF_HEIGHT, playerBodyRef.current);
        setResolvedSpawn(
          found ?? {
            x: (aabb.min.x + aabb.max.x) / 2,
            y: aabb.min.y + HALF_HEIGHT + RADIUS + 0.4,
            z: (aabb.min.z + aabb.max.z) / 2,
          },
        );
      } else {
        setResolvedSpawn(null);
      }
      console.log(`✓ Environment collider loaded (${created.length} mesh parts) from ${colliderUrl}`);
    });

    return () => {
      disposed = true;
      const world = worldRef.current;
      if (!world) return;
      for (const c of envCollidersRef.current) world.removeCollider(c, true);
      envCollidersRef.current = [];
      if (envBodyRef.current) {
        world.removeRigidBody(envBodyRef.current);
        envBodyRef.current = null;
      }
    };
  }, [rapierReady, colliderUrl, isRoomCollider, posKey, quatKey, scaleKey, worldDef]);

  // Create player rigid body and capsule collider
  useEffect(() => {
    if (!rapierReady) return;
    const world = worldRef.current;
    const rapier = rapierRef.current;
    if (!world || !rapier) return;
    // Remove existing if any
    if (playerBodyRef.current) {
      world.removeRigidBody(playerBodyRef.current);
      playerBodyRef.current = null;
      setPlayerBodyState(null);
    }
    const { RADIUS, HALF_HEIGHT, START, FRICTION, RESTI, LINEAR_DAMPING } = UNIVERSE_CONFIG.PLAYER;
    const bodyDesc = rapier
      .RigidBodyDesc.dynamic()
      .setTranslation(START[0], START[1], START[2])
      .lockRotations()
      .setLinearDamping(LINEAR_DAMPING)
      .setCcdEnabled(true);
    const body = world.createRigidBody(bodyDesc);
    const colDesc = rapier
      .ColliderDesc.capsule(HALF_HEIGHT, RADIUS)
      .setFriction(FRICTION)
      .setRestitution(RESTI);
    world.createCollider(colDesc, body);
    playerBodyRef.current = body;
    setPlayerBodyState(body);
    return () => {
      const w = worldRef.current;
      if (w && playerBodyRef.current) {
        w.removeRigidBody(playerBodyRef.current);
        playerBodyRef.current = null;
        setPlayerBodyState(null);
      }
    };
  }, [rapierReady]);

  // Keep the resolved spawn in sync if the entryway override changes after the
  // collider has loaded (e.g. arriving through a different entryway).
  useEffect(() => {
    if (spawn) setResolvedSpawn(spawn);
  }, [spawn?.x, spawn?.y, spawn?.z]);

  // Teleport the player to the resolved spawn once both exist.
  useEffect(() => {
    if (!playerBodyState || !resolvedSpawn) return;
    playerBodyState.setTranslation(resolvedSpawn, true);
    playerBodyState.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [playerBodyState, resolvedSpawn]);

  const value = useMemo<RapierCtx>(
    () => ({ rapier: rapierRef.current, world: worldRef.current, playerBody: playerBodyState }),
    [rapierReady, playerBodyState]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRapierWorld() {
  const ctx = useContext(Ctx);
  if (!ctx.world || !ctx.rapier) throw new Error('Rapier not ready yet.');
  return ctx as Required<RapierCtx>;
}
