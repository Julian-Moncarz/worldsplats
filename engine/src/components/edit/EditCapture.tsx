'use client';

// Lives INSIDE the r3f Canvas (next to PlayerController) so it can read the camera
// and the Rapier collider. In edit mode it (1) feeds live pos+yaw+floor-snap to
// the provider every frame, and (2) turns keypresses into edits that persist to
// room.json through the provider's writer:
//
//   C  floor-snapped spawn — add an entryway, or reposition the selected
//      entryway/exit (feet-on-floor, valid however high you're flying).
//   B  "beam": raycast from the camera — add an artifact at the hit point, or
//      reposition the selected artifact (walls/ceilings included). Cast against
//      the Rapier collider since a splat cloud isn't raycastable.
//   F  select the marker you're looking at (nearest within the gaze cone).
//   Delete / Backspace  remove the selected marker.
//   Esc-like X  clear the selection.
//   Z  toggle specter (noclip + fly).
//
// The orbs you see are rendered by <Markers>; this component only captures input.

import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld } from '@/physics';
import { useEdit, type MarkerKind, type Selection } from '@/providers/edit';
import { CONFIG as UNIVERSE_CONFIG } from '@/data/universeconfig';
import type { Vec3 } from '@/data/room';

const f2 = (n: number) => Number(n.toFixed(2));
// Body-center height above the feet (so a copied spawn lands feet-on-floor).
const STAND = UNIVERSE_CONFIG.PLAYER.HALF_HEIGHT + UNIVERSE_CONFIG.PLAYER.RADIUS;
const GAZE_DOT = Math.cos((25 * Math.PI) / 180); // select markers within ~25°

export default function EditCapture() {
  const { camera } = useThree();
  const { world, rapier, playerBody } = useRapierWorld();
  const {
    editMode, liveRef, setLastCopied, toggleSpecter, specterRef,
    draft, selected, setSelected,
    addEntryway, addArtifact, updateEntryway, updateExit, updateArtifact, removeMarker,
  } = useEdit();

  // Feed live values (incl. floor-snap) to the provider/HUD every frame.
  useFrame(() => {
    if (!editMode) return;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd).normalize();
    const yaw = (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;
    const pitch = (Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) * 180) / Math.PI;
    if (playerBody) {
      const p = playerBody.translation();
      let floorPos: Vec3 | null = null;
      if (world && rapier) {
        const down = new rapier.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
        const hit = world.castRay(down, 1000, true, undefined, undefined, undefined, playerBody ?? undefined);
        if (hit) floorPos = [f2(p.x), f2(p.y - hit.toi + STAND), f2(p.z)];
      }
      liveRef.current = { ...liveRef.current, pos: [p.x, p.y, p.z], yaw, pitch, hasBody: true, floorPos };
    } else {
      liveRef.current = { ...liveRef.current, yaw, pitch, hasBody: false };
    }
  });

  // Marking + selection keys.
  useEffect(() => {
    if (!editMode) return;

    // Floor-snapped standing spot directly below the player (valid at any fly
    // height), with the facing yaw. Null if there's no floor beneath.
    const floorSpot = (): { pos: Vec3; yaw: number } | null => {
      if (!playerBody) return null;
      const p = playerBody.translation();
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd).normalize();
      const yaw = f2((Math.atan2(fwd.x, fwd.z) * 180) / Math.PI);
      let y = p.y;
      if (world && rapier) {
        const down = new rapier.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
        const hit = world.castRay(down, 1000, true, undefined, undefined, undefined, playerBody ?? undefined);
        if (hit) y = p.y - hit.toi + STAND;
        else return null;
      }
      return { pos: [f2(p.x), f2(y), f2(p.z)], yaw };
    };

    // Point the camera is looking at, against the collider (for artifacts).
    const beamSpot = (): Vec3 | null => {
      if (!world || !rapier) return null;
      const origin = camera.getWorldPosition(new THREE.Vector3());
      const dir = camera.getWorldDirection(new THREE.Vector3()).normalize();
      const ray = new rapier.Ray(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: dir.x, y: dir.y, z: dir.z },
      );
      const hit = world.castRay(ray, 100, true, undefined, undefined, undefined, playerBody ?? undefined);
      if (!hit) return null;
      return [f2(origin.x + dir.x * hit.toi), f2(origin.y + dir.y * hit.toi), f2(origin.z + dir.z * hit.toi)];
    };

    // Pick the marker nearest the crosshair within the gaze cone. The pick lives
    // in its own function with an explicit return type so `best` isn't narrowed to
    // null (it's only ever reassigned inside the nested scan closure).
    const gazePick = () => {
      if (!draft) return;
      const eye = camera.getWorldPosition(new THREE.Vector3());
      const fwd = camera.getWorldDirection(new THREE.Vector3()).normalize();
      const findBest = (): Selection => {
        let best: Selection = null;
        let bestDot = GAZE_DOT;
        const scan = (kind: MarkerKind, list: { pos: Vec3 }[]) => {
          list.forEach((m, i) => {
            const dx = m.pos[0] - eye.x, dy = m.pos[1] - eye.y, dz = m.pos[2] - eye.z;
            const len = Math.hypot(dx, dy, dz) || 1;
            const dot = (dx / len) * fwd.x + (dy / len) * fwd.y + (dz / len) * fwd.z;
            if (dot > bestDot) { bestDot = dot; best = { kind, index: i }; }
          });
        };
        scan('entryway', draft.entryways);
        scan('exit', draft.exits);
        scan('artifact', draft.artifacts);
        return best;
      };
      const best = findBest();
      setSelected(best);
      setLastCopied(best ? `selected ${best.kind} #${best.index + 1}` : 'nothing under crosshair');
    };

    const onKey = (e: KeyboardEvent) => {
      // Ignore marking keys while typing into the editor panel's fields.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
        return;
      }
      if (e.code === 'KeyC') {
        const s = floorSpot();
        if (!s) { setLastCopied('no floor below — can’t place'); return; }
        if (selected?.kind === 'entryway') {
          updateEntryway(selected.index, { pos: s.pos, yaw: s.yaw });
          setLastCopied(`moved entryway #${selected.index + 1}`);
        } else if (selected?.kind === 'exit') {
          updateExit(selected.index, { pos: s.pos });
          setLastCopied(`moved exit #${selected.index + 1}`);
        } else {
          addEntryway(s.pos, s.yaw);
          setLastCopied('added entryway');
        }
      } else if (e.code === 'KeyB') {
        const p = beamSpot();
        if (!p) { setLastCopied('beam: nothing in view'); return; }
        if (selected?.kind === 'artifact') {
          updateArtifact(selected.index, { pos: p });
          setLastCopied(`moved artifact #${selected.index + 1}`);
        } else {
          addArtifact(p);
          setLastCopied('added artifact — set its URL in the panel');
        }
        liveRef.current = { ...liveRef.current, lastBeam: p };
      } else if (e.code === 'KeyF') {
        gazePick();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selected) {
          removeMarker(selected.kind, selected.index);
          setLastCopied(`deleted ${selected.kind}`);
        }
      } else if (e.code === 'KeyX') {
        setSelected(null);
        setLastCopied('cleared selection');
      } else if (e.code === 'KeyZ') {
        toggleSpecter();
        setLastCopied(`specter fly: ${specterRef.current ? 'ON (↑/↓)' : 'OFF'}`);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    editMode, camera, world, rapier, playerBody, liveRef, setLastCopied, toggleSpecter, specterRef,
    draft, selected, setSelected,
    addEntryway, addArtifact, updateEntryway, updateExit, updateArtifact, removeMarker,
  ]);

  return null;
}
