'use client';

// Lives INSIDE the r3f Canvas (next to PlayerController) so it can read the camera
// and the Rapier collider. It (1) feeds live pos+yaw to the HUD every frame, and
// (2) handles the two marking keys (spec §10):
//   C  copy the player's pos + yaw  — for spawns and doors (feed straight back as a spawn)
//   B  "beam": raycast from the camera and copy the hit point — for artifacts,
//      including ones above/below eye level. Cast against the Rapier collider
//      (the actual collision geometry) since a Gaussian-splat cloud isn't raycastable.
//      Each hit also drops a red orb in the scene so you can see what you marked.
//   X  clear the dropped orbs.

import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld } from '@/physics';
import { useEdit } from '@/providers/edit';

const f2 = (n: number) => Number(n.toFixed(2));

export default function EditCapture() {
  const { camera } = useThree();
  const { world, rapier, playerBody } = useRapierWorld();
  const { editMode, liveRef, setLastCopied } = useEdit();
  const [beamHits, setBeamHits] = useState<[number, number, number][]>([]);

  // Feed live values to the HUD.
  useFrame(() => {
    if (!editMode) return;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd).normalize();
    const yaw = (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;
    const pitch = (Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) * 180) / Math.PI;
    if (playerBody) {
      const p = playerBody.translation();
      liveRef.current = { pos: [p.x, p.y, p.z], yaw, pitch, hasBody: true };
    } else {
      liveRef.current = { ...liveRef.current, yaw, pitch, hasBody: false };
    }
  });

  // Marking keys.
  useEffect(() => {
    if (!editMode) return;

    const copy = async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // clipboard may be blocked (e.g. not focused); the HUD + console still show it
      }
      setLastCopied(text);
      console.log('[edit] copied:', text);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyC') {
        if (!playerBody) {
          setLastCopied('player body not ready yet');
          return;
        }
        const p = playerBody.translation();
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd).normalize();
        const yaw = (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;
        void copy(`pos:[${f2(p.x)},${f2(p.y)},${f2(p.z)}], yaw:${f2(yaw)}`);
      } else if (e.code === 'KeyB') {
        if (!world || !rapier) return;
        const origin = camera.getWorldPosition(new THREE.Vector3());
        const dir = camera.getWorldDirection(new THREE.Vector3()).normalize();
        const ray = new rapier.Ray(
          { x: origin.x, y: origin.y, z: origin.z },
          { x: dir.x, y: dir.y, z: dir.z },
        );
        // Exclude the player's own body — the ray starts at the camera, which is
        // inside the player capsule, so without this it self-hits at distance ~0
        // and drops the orb where you're standing.
        const hit = world.castRay(
          ray, 100, true,
          undefined, undefined, undefined,
          playerBody ?? undefined,
        );
        if (!hit) {
          setLastCopied('beam: nothing in view (no collider hit)');
          return;
        }
        const hp = {
          x: origin.x + dir.x * hit.toi,
          y: origin.y + dir.y * hit.toi,
          z: origin.z + dir.z * hit.toi,
        };
        setBeamHits((prev) => [...prev, [hp.x, hp.y, hp.z]]);
        void copy(`pos:[${f2(hp.x)},${f2(hp.y)},${f2(hp.z)}]`);
      } else if (e.code === 'KeyX') {
        setBeamHits([]);
        setLastCopied('cleared beam markers');
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, camera, world, rapier, playerBody, setLastCopied]);

  if (!editMode) return null;

  return (
    <>
      {beamHits.map((p, i) => (
        <mesh key={i} position={p} renderOrder={999}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#ff2d2d" toneMapped={false} depthTest={false} transparent opacity={0.95} />
        </mesh>
      ))}
    </>
  );
}
