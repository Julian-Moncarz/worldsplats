'use client';

// Artifacts. Lives inside the Canvas. Detects when the player is near an artifact
// AND looking at it (gaze from the camera/eye, 3D — artifacts can be above/below
// eye level), reports it active so a DOM hint can show, and opens its URL when E
// is pressed. The doorway/object in the splat IS the artifact — no visual marker.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld } from '@/physics';
import { usePointerLock } from '@/providers/pointerLock';
import type { Artifact } from '@/data/room';

const INTERACT_CODE = 'KeyE';
const GAZE_DOT = Math.cos((45 * Math.PI) / 180); // within ~45° of looking at it

export default function Artifacts({
  artifacts,
  onOpen,
  onActiveChange,
}: {
  artifacts: Artifact[];
  onOpen: (url: string) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const { playerBody } = useRapierWorld();
  const { camera } = useThree();
  const { isLocked } = usePointerLock();
  const activeRef = useRef<string | null>(null);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const eye = useMemo(() => new THREE.Vector3(), []);

  const setActive = useMemo(
    () => (url: string | null) => {
      if (activeRef.current !== url) {
        activeRef.current = url;
        onActiveChange(url != null);
      }
    },
    [onActiveChange],
  );

  useFrame(() => {
    if (!playerBody || artifacts.length === 0 || !isLocked) {
      setActive(null);
      return;
    }
    camera.getWorldPosition(eye);
    camera.getWorldDirection(fwd); // normalized

    let active: string | null = null;
    for (const a of artifacts) {
      const r = a.radius || 1.0;
      const dx = a.pos[0] - eye.x;
      const dy = a.pos[1] - eye.y;
      const dz = a.pos[2] - eye.z;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 > r * r) continue;
      const dLen = Math.sqrt(dist2) || 1;
      const dot = (dx / dLen) * fwd.x + (dy / dLen) * fwd.y + (dz / dLen) * fwd.z;
      if (dot >= GAZE_DOT) {
        active = a.url;
        break;
      }
    }
    setActive(active);
  });

  // Interact key opens the active artifact's URL.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== INTERACT_CODE) return;
      const url = activeRef.current;
      if (url) {
        setActive(null);
        onOpen(url);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen, setActive]);

  return null;
}
