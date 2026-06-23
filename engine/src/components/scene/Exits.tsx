'use client';

// Exits. Lives inside the Canvas. Given the current room's exits, it (1) detects
// when the player is near an exit AND looking at it, reporting it as "active" so a
// DOM hint ("Press E") can show, and (2) follows the exit's link when E is pressed
// while one is active. No visual marker — the doorway in the splat IS the exit.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld } from '@/physics';
import { usePointerLock } from '@/providers/pointerLock';
import type { Exit } from '@/data/room';

const INTERACT_CODE = 'KeyE';
const GAZE_DOT = Math.cos((45 * Math.PI) / 180); // within ~45° of looking at it

export default function Exits({
  exits,
  onExit,
  onActiveChange,
}: {
  exits: Exit[];
  onExit: (to: string) => void;
  onActiveChange: (active: boolean) => void;
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
        onActiveChange(to != null);
      }
    },
    [onActiveChange],
  );

  // On room switch, clear the active exit and suppress interaction for a beat
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
      const r = e.radius || 1.3;
      const dx = e.pos[0] - p.x;
      const dz = e.pos[2] - p.z;
      if (dx * dx + dz * dz > r * r) continue;
      // gaze: is the exit roughly in front of where we're looking?
      const dLen = Math.hypot(dx, dz) || 1;
      const dot = (dx / dLen) * (fwd.x / fhLen) + (dz / dLen) * (fwd.z / fhLen);
      if (dot >= GAZE_DOT) {
        active = e.to;
        break;
      }
    }
    setActive(active);
  });

  // Interact key follows the active exit's link.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== INTERACT_CODE) return;
      const to = activeRef.current;
      if (to && performance.now() >= armAt.current) {
        setActive(null);
        onExit(to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, setActive]);

  return null;
}
