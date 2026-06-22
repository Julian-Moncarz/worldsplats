'use client';

// Step 3 — door crossings. Lives inside the Canvas. Given the current room's
// exits (from the manifest), it (1) draws a glowing marker at each door so you
// can see where to walk, and (2) crosses to the target room when you walk into
// the door's volume. Crossing is rising-edge + briefly armed after arrival, so
// spawning near a door doesn't bounce you straight back through it.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld } from '@/physics';
import { usePointerLock } from '@/providers/pointerLock';
import type { Exit } from '@/data/manifest';

export default function DoorCrossing({
  exits,
  onCross,
}: {
  exits: Exit[];
  onCross: (to: string) => void;
}) {
  const { playerBody } = useRapierWorld();
  const { isLocked } = usePointerLock();
  const wasInside = useRef(false);
  const armAt = useRef(0); // crossing suppressed until performance.now() >= this

  // On room switch (exits identity changes), reset the edge state and suppress
  // crossing for a beat while the player teleports/settles into the new room.
  useEffect(() => {
    wasInside.current = false;
    armAt.current = performance.now() + 900;
  }, [exits]);

  useFrame(() => {
    if (!playerBody || exits.length === 0) return;
    const p = playerBody.translation();

    let insideTo: string | null = null;
    for (const e of exits) {
      const r = e.vol.radius || 1.3;
      const dx = p.x - e.vol.pos[0];
      const dz = p.z - e.vol.pos[2];
      if (dx * dx + dz * dz <= r * r) {
        insideTo = e.to;
        break;
      }
    }

    const inside = insideTo !== null;
    const now = performance.now();
    if (inside && !wasInside.current && isLocked && now >= armAt.current) {
      onCross(insideTo!);
    }
    wasInside.current = inside;
  });

  return (
    <>
      {exits.map((e, i) => {
        const r = e.vol.radius || 1.3;
        return (
          <group key={i} position={[e.vol.pos[0], e.vol.pos[1], e.vol.pos[2]]}>
            {/* glowing translucent pillar */}
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[0.28, 0.28, 2.6, 24, 1, true]} />
              <meshBasicMaterial
                color="#39d0ff"
                transparent
                opacity={0.3}
                side={THREE.DoubleSide}
                toneMapped={false}
                depthWrite={false}
              />
            </mesh>
            {/* ring near the floor marking the trigger radius */}
            <mesh position={[0, -0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[r * 0.55, r * 0.7, 40]} />
              <meshBasicMaterial
                color="#39d0ff"
                transparent
                opacity={0.5}
                side={THREE.DoubleSide}
                toneMapped={false}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
