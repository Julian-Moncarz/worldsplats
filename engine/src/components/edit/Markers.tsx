'use client';

// Edit-mode-only: render every marker in the current draft as a glowing, labeled
// orb so the room's structure is readable at a glance. Green = entryway (arrive),
// cyan = exit (leave), amber = artifact (content). A doorway (entryway + exit at
// one spot) reads as a stacked green+cyan pair. The selected marker pulses larger.
// Published builds never mount this (editMode is false).

import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { useEdit, type MarkerKind } from '@/providers/edit';
import type { Vec3 } from '@/data/room';

const COLORS: Record<MarkerKind, string> = {
  entryway: '#39ff88',
  exit: '#33ccff',
  artifact: '#ffb020',
};

// A short label for an exit target: "../green/#from-red" → "→ green", an external
// URL → "→ host".
function exitLabel(to: string): string {
  if (!to) return '→ (unset)';
  try {
    if (/^https?:\/\//.test(to)) return `→ ${new URL(to).host}`;
  } catch { /* fall through */ }
  const slug = to.replace(/^\.\.\//, '').split('/')[0];
  return `→ ${slug || to}`;
}

function artifactLabel(url: string): string {
  if (!url) return 'artifact (no url)';
  try { return new URL(url).host; } catch { return 'artifact'; }
}

function Orb({
  pos, color, label, selected, yOffset = 0,
}: { pos: Vec3; color: string; label: string; selected: boolean; yOffset?: number }) {
  const p = useMemo<Vec3>(() => [pos[0], pos[1] + yOffset, pos[2]], [pos, yOffset]);
  const r = selected ? 0.16 : 0.11;
  return (
    <group position={p}>
      <mesh renderOrder={999}>
        <sphereGeometry args={[r, 20, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.95} depthTest={false} />
      </mesh>
      {selected && (
        <mesh renderOrder={998}>
          <sphereGeometry args={[r * 1.7, 20, 20]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.2} depthTest={false} />
        </mesh>
      )}
      <Billboard position={[0, r + 0.18, 0]}>
        <Text
          fontSize={0.14}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.012}
          outlineColor="#000000"
          renderOrder={1000}
          material-depthTest={false}
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
}

export default function Markers() {
  const { editMode, draft, selected } = useEdit();
  if (!editMode || !draft) return null;

  const sel = (kind: MarkerKind, i: number) => selected?.kind === kind && selected.index === i;

  return (
    <>
      {draft.entryways.map((e, i) => (
        <Orb key={`en-${i}`} pos={e.pos} color={COLORS.entryway} label={e.id || '(unnamed)'} selected={sel('entryway', i)} />
      ))}
      {draft.exits.map((e, i) => (
        // Nudge exits up so a co-located entryway+exit stack reads as two orbs.
        <Orb key={`ex-${i}`} pos={e.pos} color={COLORS.exit} label={exitLabel(e.to)} selected={sel('exit', i)} yOffset={0.34} />
      ))}
      {draft.artifacts.map((a, i) => (
        <Orb key={`ar-${i}`} pos={a.pos} color={COLORS.artifact} label={artifactLabel(a.url)} selected={sel('artifact', i)} />
      ))}
    </>
  );
}
