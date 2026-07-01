'use client';

// The edit-mode authoring panel — a DOM overlay (outside the Canvas) that turns
// the room's marks into editable lists: name/move/delete entryways, wire exits by
// menu or arbitrary URL, promote an entryway into a doorway, and set artifact
// URLs. Position comes from the world (press C/B, or "set here" which reads the
// live floor-snap); this panel owns everything else. Every change persists to
// room.json through the provider. Only mounts in edit mode.

import { useEffect, useState } from 'react';
import { useEdit, type MarkerKind } from '@/providers/edit';
import type { Vec3 } from '@/data/room';

const vec = (p: Vec3) => `${p[0]}, ${p[1]}, ${p[2]}`;

// "../green/#from-red" → { slug: "green", entryId: "from-red" }; null if not an
// internal room link.
function parseInternal(to: string): { slug: string; entryId: string } | null {
  const m = to.match(/^\.\.\/([^/]+)\/#(.+)$/);
  return m ? { slug: m[1], entryId: m[2] } : null;
}

const CUSTOM = '__custom__';

export default function EditorPanel() {
  const {
    editMode, draft, draftSlug, rooms, selected, setSelected, saveStatus, liveRef,
    addEntryway, addExit, updateEntryway, updateExit, updateArtifact,
    removeMarker, promoteEntryway, makeTwoWay, entrywayAt,
    undo, canUndo, moveSpeed, setMoveSpeed, scale, setScale,
  } = useEdit();

  // Room-scale slider: track live for the label, but only commit (resize + rescale
  // markers + save) on release — the collider re-bake is too heavy to run per tick.
  const [scaleInput, setScaleInput] = useState(scale);
  useEffect(() => { setScaleInput(scale); }, [scale]);
  // Move-speed slider: track live, write otherplane.config.json on release.
  const [speedInput, setSpeedInput] = useState(moveSpeed);
  useEffect(() => { setSpeedInput(moveSpeed); }, [moveSpeed]);

  if (!editMode || !draft) return null;

  const isSel = (kind: MarkerKind, i: number) => selected?.kind === kind && selected.index === i;
  const rowCls = (kind: MarkerKind, i: number) =>
    `rounded border px-2 py-1.5 ${isSel(kind, i) ? 'border-amber-400 bg-amber-500/10' : 'border-zinc-700 bg-zinc-800/40'}`;

  // "Add … here" and "set … here" read the live floor-snap the player is standing
  // on (updated every frame by EditCapture).
  const floor = () => liveRef.current.floorPos;
  const yawNow = () => liveRef.current.yaw;

  const status =
    saveStatus === 'saving' ? 'saving…' :
    saveStatus === 'saved' ? 'saved ✓' :
    saveStatus === 'error' ? 'save failed ✗' : '';

  const selLabel = selected ? `${selected.kind} #${selected.index + 1}` : 'none';

  return (
    <div className="pointer-events-auto absolute top-4 left-4 z-30 flex max-h-[92vh] w-80 flex-col gap-2 overflow-y-auto rounded-lg border border-amber-500/40 bg-zinc-900/90 p-3 font-mono text-xs text-zinc-200 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-amber-400">EDITOR · {draftSlug}</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded bg-zinc-700 px-1.5 py-0.5 hover:bg-zinc-600 disabled:opacity-30"
            disabled={!canUndo}
            title="Undo (⌘Z)"
            onClick={() => undo()}
          >↶ undo</button>
          <span className={saveStatus === 'error' ? 'text-red-400' : 'text-emerald-300'}>{status}</span>
        </div>
      </div>

      {/* How-to: the one place these live now. */}
      <div className="rounded border border-zinc-700 bg-zinc-800/50 p-2 text-[11px] leading-snug">
        <div className="mb-1 text-zinc-400">
          <b className="text-amber-300">Esc</b> = edit here · click scene = walk (WASD)
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <b className="text-amber-300">F</b><span>select the orb you look at</span>
          <b className="text-amber-300">C</b><span>add entryway · <i>move</i> selected one</span>
          <b className="text-amber-300">B</b><span>add artifact (aim first) · <i>move</i> selected</span>
          <b className="text-amber-300">Del</b><span>delete selected · <b className="text-amber-300">X</b> deselect</span>
          <b className="text-amber-300">Z</b><span>toggle fly (↑/↓) · <b className="text-amber-300">⌘Z</b> undo</span>
        </div>
        <div className="mt-1 text-zinc-400">selected: <span className="text-amber-200">{selLabel}</span></div>
      </div>

      {/* Walk speed — a per-museum setting, saved to otherplane.config.json so it
          ships to every viewer (not a per-browser preference). */}
      <div className="rounded border border-zinc-700 bg-zinc-800/50 p-2">
        <label className="flex items-center gap-2">
          <span className="w-16 text-zinc-400">speed</span>
          <input type="range" min={2} max={40} step={1} value={speedInput}
            className="flex-1 accent-amber-400"
            onChange={(e) => setSpeedInput(Number(e.target.value))}
            onPointerUp={() => setMoveSpeed(speedInput)}
            onKeyUp={() => setMoveSpeed(speedInput)} />
          <span className="w-10 text-right text-zinc-300">{speedInput}</span>
        </label>
        <div className="mt-1 text-[10px] text-zinc-500">saved to otherplane.config.json</div>
      </div>

      {/* Room scale — saved to room.json; rescales markers on release. */}
      <div className="rounded border border-zinc-700 bg-zinc-800/50 p-2">
        <label className="flex items-center gap-2">
          <span className="w-16 text-cyan-300">room scale</span>
          <input type="range" min={0.1} max={5} step={0.05} value={scaleInput}
            className="flex-1 accent-cyan-400"
            onChange={(e) => setScaleInput(Number(e.target.value))}
            onPointerUp={() => setScale(scaleInput)}
            onKeyUp={() => setScale(scaleInput)}
          />
          <span className="w-10 text-right text-zinc-300">{scaleInput.toFixed(2)}</span>
        </label>
        <div className="mt-1 text-[10px] text-zinc-500">
          saved to room.json · markers rescale with it · fit the room to a ~1.7m
          player (too small and you won’t fit — you’ll get stuck)
        </div>
      </div>

      {/* Entryways */}
      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-emerald-300">Entryways</span>
          <button
            className="rounded bg-emerald-600/30 px-1.5 py-0.5 text-emerald-200 hover:bg-emerald-600/50"
            onClick={() => { const p = floor(); if (p) addEntryway(p, yawNow()); }}
          >+ here</button>
        </div>
        {draft.entryways.map((e, i) => (
          <div key={i} className={rowCls('entryway', i)}>
            <div className="flex items-center gap-1">
              <input
                className="w-full rounded bg-zinc-900 px-1 py-0.5 text-emerald-200 outline-none focus:ring-1 focus:ring-emerald-400"
                value={e.id}
                spellCheck={false}
                onChange={(ev) => updateEntryway(i, { id: ev.target.value })}
                onFocus={() => setSelected({ kind: 'entryway', index: i })}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-zinc-400">
              <span>[{vec(e.pos)}] yaw {e.yaw}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <button className="rounded bg-zinc-700 px-1.5 py-0.5 hover:bg-zinc-600"
                onClick={() => setSelected({ kind: 'entryway', index: i })}>select</button>
              <button className="rounded bg-zinc-700 px-1.5 py-0.5 hover:bg-zinc-600"
                onClick={() => { const p = floor(); if (p) updateEntryway(i, { pos: p, yaw: yawNow() }); }}>set here</button>
              <button className="rounded bg-cyan-700/50 px-1.5 py-0.5 hover:bg-cyan-700"
                onClick={() => promoteEntryway(i)}>make exit</button>
              <button className="rounded bg-red-800/50 px-1.5 py-0.5 hover:bg-red-800"
                onClick={() => removeMarker('entryway', i)}>del</button>
            </div>
          </div>
        ))}
      </section>

      {/* Exits */}
      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-cyan-300">Exits</span>
          <button
            className="rounded bg-cyan-600/30 px-1.5 py-0.5 text-cyan-200 hover:bg-cyan-600/50"
            onClick={() => { const p = floor(); if (p) addExit(p); }}
          >+ here</button>
        </div>
        {draft.exits.map((e, i) => {
          const internal = parseInternal(e.to);
          const dropdownValue = internal ? e.to : (e.to ? CUSTOM : '');
          const src = entrywayAt(e.pos);
          const srcIndex = src ? draft.entryways.findIndex((x) => x.id === src.id) : -1;
          return (
            <div key={i} className={rowCls('exit', i)}>
              <select
                className="w-full rounded bg-zinc-900 px-1 py-0.5 text-cyan-200 outline-none focus:ring-1 focus:ring-cyan-400"
                value={dropdownValue}
                onFocus={() => setSelected({ kind: 'exit', index: i })}
                onChange={(ev) => {
                  const v = ev.target.value;
                  updateExit(i, { to: v === CUSTOM ? (internal ? '' : e.to) : v });
                }}
              >
                <option value="">— pick a destination —</option>
                {rooms.flatMap((r) =>
                  r.entryways.map((en) => (
                    <option key={`${r.slug}#${en.id}`} value={`../${r.slug}/#${en.id}`}>
                      {r.display_name} → {en.id}
                    </option>
                  )),
                )}
                <option value={CUSTOM}>Custom URL…</option>
              </select>
              {dropdownValue === CUSTOM && (
                <input
                  className="mt-1 w-full rounded bg-zinc-900 px-1 py-0.5 text-cyan-200 outline-none focus:ring-1 focus:ring-cyan-400"
                  placeholder="https://another-museum.example/room/#entry"
                  value={e.to}
                  spellCheck={false}
                  onChange={(ev) => updateExit(i, { to: ev.target.value })}
                  onFocus={() => setSelected({ kind: 'exit', index: i })}
                />
              )}
              <div className="mt-1 text-[10px] text-zinc-400">[{vec(e.pos)}] r {e.radius ?? 1.3}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <button className="rounded bg-zinc-700 px-1.5 py-0.5 hover:bg-zinc-600"
                  onClick={() => setSelected({ kind: 'exit', index: i })}>select</button>
                <button className="rounded bg-zinc-700 px-1.5 py-0.5 hover:bg-zinc-600"
                  onClick={() => { const p = floor(); if (p) updateExit(i, { pos: p }); }}>set here</button>
                {internal && srcIndex >= 0 && (
                  <button className="rounded bg-emerald-700/50 px-1.5 py-0.5 hover:bg-emerald-700"
                    title={`add the return door in ${internal.slug}`}
                    onClick={() => makeTwoWay(srcIndex, internal.slug, internal.entryId)}>two-way</button>
                )}
                <button className="rounded bg-red-800/50 px-1.5 py-0.5 hover:bg-red-800"
                  onClick={() => removeMarker('exit', i)}>del</button>
              </div>
              {internal && srcIndex < 0 && (
                <div className="mt-1 text-[10px] text-amber-400/80">
                  one-way — add an entryway here (C) to make it two-way
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Artifacts */}
      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-amber-300">Artifacts</span>
          <span className="text-[10px] text-zinc-500">aim + press B</span>
        </div>
        {draft.artifacts.map((a, i) => (
          <div key={i} className={rowCls('artifact', i)}>
            <input
              className="w-full rounded bg-zinc-900 px-1 py-0.5 text-amber-200 outline-none focus:ring-1 focus:ring-amber-400"
              placeholder="https://…"
              value={a.url}
              spellCheck={false}
              onChange={(ev) => updateArtifact(i, { url: ev.target.value })}
              onFocus={() => setSelected({ kind: 'artifact', index: i })}
            />
            <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-400">
              <span>[{vec(a.pos)}]</span>
              <label className="flex items-center gap-1">r
                <input type="number" step="0.1" min="0.1" value={a.radius}
                  className="w-14 rounded bg-zinc-900 px-1 py-0.5 text-amber-200 outline-none"
                  onChange={(ev) => updateArtifact(i, { radius: Number(ev.target.value) || a.radius })}
                  onFocus={() => setSelected({ kind: 'artifact', index: i })}
                />
              </label>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <button className="rounded bg-zinc-700 px-1.5 py-0.5 hover:bg-zinc-600"
                onClick={() => setSelected({ kind: 'artifact', index: i })}>select</button>
              <button className="rounded bg-red-800/50 px-1.5 py-0.5 hover:bg-red-800"
                onClick={() => removeMarker('artifact', i)}>del</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
