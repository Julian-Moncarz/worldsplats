'use client';

// Door crossings. Lives inside the Canvas. Given the current room's exits (from
// the manifest), it (1) draws a glowing marker at each door, (2) detects when the
// player is near a door AND looking at it, reporting that door as "active" so a
// DOM hint ("Press E to enter …") can show, and (3) crosses to the target room
// when the interact key is pressed while a door is active.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld } from '@/physics';
import { usePointerLock } from '@/providers/pointerLock';
import type { Exit } from '@/data/manifest';

const INTERACT_CODE = 'KeyE';
const GAZE_DOT = Math.cos((45 * Math.PI) / 180); // within ~45° of looking at the door

export default function DoorCrossing({
  exits,
  onCross,
  onActiveChange,
}: {
  exits: Exit[];
  onCross: (to: string) => void;
  onActiveChange: (to: string | null) => void;
}) {
  const { playerBody } = useRapierWorld();
  const { camera } = useThree();
  const { isLocked } = usePointerLock();
  const activeRef = useRef<string | null>(null);
  const armAt = useRef(0); // suppress interaction until performance.now() >= this
  const fwd = useMemo(() => new THREE.Vector3(), []);

  const setActive = useMemo(
    () => (to: string | null) => {
      if (activeRef.current !== to) {
        activeRef.current = to;
        onActiveChange(to);
      }
    },
    [onActiveChange],
  );

  // On room switch, clear the active door and suppress interaction for a beat
  // while the player settles into the new room.
  useEffect(() => {
    armAt.current = performance.now() + 600;
    setActive(null);
  }, [exits, setActive]);

  useFrame(() => {
    if (!playerBody || exits.length === 0 || !isLocked || performance.now() < armAt.current) {
      setActive(null);
      return;
    }
    const p = playerBody.translation();
    camera.getWorldDirection(fwd);
    const fhLen = Math.hypot(fwd.x, fwd.z) || 1;

    let active: string | null = null;
    for (const e of exits) {
      const r = e.vol.radius || 1.3;
      const dx = e.vol.pos[0] - p.x;
      const dz = e.vol.pos[2] - p.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > r * r) continue;
      // gaze: is the door roughly in front of where we're looking?
      const dLen = Math.hypot(dx, dz) || 1;
      const dot = (dx / dLen) * (fwd.x / fhLen) + (dz / dLen) * (fwd.z / fhLen);
      if (dot >= GAZE_DOT) {
        active = e.to;
        break;
      }
    }
    setActive(active);
  });

  // Interact key crosses through the active door.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== INTERACT_CODE) return;
      const to = activeRef.current;
      if (to && performance.now() >= armAt.current) {
        setActive(null);
        onCross(to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCross, setActive]);

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
