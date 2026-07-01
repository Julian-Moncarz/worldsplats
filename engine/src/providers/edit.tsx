'use client';

// Edit mode: the viewer's authoring flag. It's a property of the running INSTANCE,
// not the request — so a published museum simply has no edit mode and a visitor
// can't flip it on. Turn it on with `otherplane edit` (sets NEXT_PUBLIC_EDIT_MODE=1),
// which also starts the local writer sidecar this provider talks to.
//
// This provider owns the room's editable "draft" — its entryways, exits, and
// artifacts. Marking keys (EditCapture) and the editor panel both mutate the
// draft through here, and every mutation persists to disk via the writer
// (src/data/editApi.ts). Asset URLs are never touched: the writer merges only
// the three coordinate arrays into the source room.json.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Entryway, Exit, Artifact, Vec3 } from '@/data/room';
import { fetchRooms, saveMarks, saveConfig, linkDoor, type RoomSummary, type Marks } from '@/data/editApi';
import { CONFIG as UNIVERSE_CONFIG } from '@/data/universeconfig';

// Fixed player standing offset (feet → body center). Entryway/exit positions are
// stored as body-center standing spots = floorY + STAND; only the floorY part
// scales with the room, so the player stays feet-on-floor at any room scale.
const STAND = UNIVERSE_CONFIG.PLAYER.HALF_HEIGHT + UNIVERSE_CONFIG.PLAYER.RADIUS;

const ENV_EDIT = process.env.NEXT_PUBLIC_EDIT_MODE === '1';

export type LiveCoords = {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  hasBody: boolean;
  /** Floor-snapped feet-on-floor body-center below the player (for entryways). */
  floorPos: Vec3 | null;
  /** Last point the B beam hit (for artifacts). */
  lastBeam: Vec3 | null;
};

export type MarkerKind = 'entryway' | 'exit' | 'artifact';
export type Selection = { kind: MarkerKind; index: number } | null;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const emptyMarks = (): Marks => ({ entryways: [], exits: [], artifacts: [] });

// Drop not-yet-complete markers before persisting (an exit with no target, an
// artifact with no url, an entryway with no id). They stay in the local draft so
// you can finish them; they just aren't written until valid — the writer would
// reject them and, more importantly, an unfinished door shouldn't ship.
function sanitize(m: Marks): Marks {
  return {
    entryways: m.entryways.filter((e) => e.id.trim()),
    exits: m.exits.filter((e) => e.to.trim()),
    artifacts: m.artifacts.filter((a) => a.url.trim()),
  };
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const round2 = (n: number) => Math.round(n * 100) / 100;

type EditCtx = {
  editMode: boolean;
  /** Mutated every frame by EditCapture (inside the canvas); read by the HUD. */
  liveRef: React.MutableRefObject<LiveCoords>;
  lastCopied: string | null;
  setLastCopied: (s: string | null) => void;

  specter: boolean;
  specterRef: React.MutableRefObject<boolean>;
  toggleSpecter: () => void;

  /**
   * Walk speed — a per-museum setting from otherplane.config.json (ships to every
   * viewer). Editing it writes the config so it applies for everyone, not just
   * this browser.
   */
  moveSpeed: number;
  setMoveSpeed: (n: number) => void;

  // ── authoring ──────────────────────────────────────────────────────────
  /** The current room's editable marks (null until a room is seeded). */
  draft: Marks | null;
  draftSlug: string | null;
  /** Every room + its entryways, for wiring exits by menu. */
  rooms: RoomSummary[];
  selected: Selection;
  setSelected: (s: Selection) => void;
  saveStatus: SaveStatus;

  /** Seed the draft from a freshly loaded room (RoomViewer calls this). */
  seed: (slug: string, marks: Marks, scale: number) => void;
  /** Step back through edit history (also bound to Cmd/Ctrl-Z). */
  undo: () => void;
  canUndo: boolean;

  /**
   * Room scale (calibration.scale) — real per-room data, written to room.json.
   * Setting it live-resizes the splat + collider AND rescales every marker by the
   * same ratio so orbs stay on the walls; undo history is cleared at that point.
   */
  scale: number;
  setScale: (n: number) => void;

  addEntryway: (pos: Vec3, yaw: number) => void;
  addArtifact: (pos: Vec3) => void;
  addExit: (pos: Vec3) => void;
  updateEntryway: (i: number, patch: Partial<Entryway>) => void;
  updateExit: (i: number, patch: Partial<Exit>) => void;
  updateArtifact: (i: number, patch: Partial<Artifact>) => void;
  removeMarker: (kind: MarkerKind, i: number) => void;
  /** Add an exit co-located with entryway i (a doorway is arrive + leave). */
  promoteEntryway: (i: number) => void;
  /** True-two-way: reuse a target entryway's position for the return exit. */
  makeTwoWay: (entryIndex: number, toSlug: string, toEntryId: string) => Promise<void>;
  /** The entryway (if any) sitting at this exit's position — the door's source. */
  entrywayAt: (pos: Vec3) => Entryway | null;
};

const Ctx = createContext<EditCtx | null>(null);

export function EditProvider({
  children,
  moveSpeed: initialMoveSpeed = 14,
}: {
  children: React.ReactNode;
  /** Seeded from otherplane.config.json by the root layout (server-read). */
  moveSpeed?: number;
}) {
  const [editMode] = useState(ENV_EDIT);
  // Config-sourced walk speed; the slider writes it back to otherplane.config.json.
  const [moveSpeed, setMoveSpeedState] = useState(initialMoveSpeed);
  const setMoveSpeed = useCallback((n: number) => {
    setMoveSpeedState(n);
    saveConfig({ moveSpeed: n }).catch((e) => console.error('[edit] config save failed:', e));
  }, []);
  const liveRef = useRef<LiveCoords>({
    pos: [0, 0, 0], yaw: 0, pitch: 0, hasBody: false, floorPos: null, lastBeam: null,
  });
  const [lastCopied, setLastCopied] = useState<string | null>(null);
  const [specter, setSpecter] = useState(false);
  const specterRef = useRef(false);
  const toggleSpecter = () => {
    specterRef.current = !specterRef.current;
    setSpecter(specterRef.current);
  };
  const [draft, setDraft] = useState<Marks | null>(null);
  const draftRef = useRef<Marks | null>(null);
  const [draftSlug, setDraftSlug] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selected, setSelected] = useState<Selection>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  // Undo stack of prior draft snapshots. Mutators always build fresh objects, so
  // each stored reference is an immutable snapshot — no cloning needed.
  const historyRef = useRef<Marks[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const [scale, setScaleState] = useState(1);
  const scaleRef = useRef(1);

  // Load the room list once for the exit dropdown (edit mode only).
  useEffect(() => {
    if (!editMode) return;
    let cancelled = false;
    fetchRooms().then((r) => { if (!cancelled) setRooms(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [editMode]);

  const refreshRooms = useCallback(() => {
    fetchRooms().then(setRooms).catch(() => {});
  }, []);

  // Commit a new draft to state + disk. Sanitized before writing; the local copy
  // keeps in-progress markers so you can finish them. `record` pushes the prior
  // draft onto the undo stack (false when the change IS an undo).
  const commit = useCallback((next: Marks, record = true) => {
    const slug = draftSlug;
    if (record && draftRef.current) {
      historyRef.current.push(draftRef.current);
      if (historyRef.current.length > 100) historyRef.current.shift();
      setUndoDepth(historyRef.current.length);
    }
    draftRef.current = next;
    setDraft(next);
    if (!slug) return;
    setSaveStatus('saving');
    saveMarks(slug, sanitize(next))
      .then(() => setSaveStatus('saved'))
      .catch((e) => { setSaveStatus('error'); console.error('[edit] save failed:', e); });
  }, [draftSlug]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    setUndoDepth(historyRef.current.length);
    if (prev) { commit(prev, false); setSelected(null); }
  }, [commit]);

  const seed = useCallback((slug: string, marks: Marks, roomScale: number) => {
    draftRef.current = marks;
    setDraft(marks);
    setDraftSlug(slug);
    setSelected(null);
    setSaveStatus('idle');
    historyRef.current = [];
    setUndoDepth(0);
    scaleRef.current = roomScale;
    setScaleState(roomScale);
  }, []);

  // Set room scale: rescale every marker by the ratio (so they stay on the walls),
  // write marks + calibration.scale together, and clear undo (every position moved
  // at once — stepping back one marker edit would desync from the old scale).
  const setScale = useCallback((next: number) => {
    if (!(next > 0)) return;
    const slug = draftSlug;
    const prev = scaleRef.current || 1;
    const ratio = next / prev;
    scaleRef.current = next;
    setScaleState(next);
    if (ratio === 1) return;
    const m = draftRef.current ?? emptyMarks();
    // Standing markers (entryway/exit): scale the floor part of Y, keep the fixed
    // player standing offset, so they don't sink underground as the room shrinks.
    const spFloor = (p: Vec3): Vec3 =>
      [round2(p[0] * ratio), round2((p[1] - STAND) * ratio + STAND), round2(p[2] * ratio)];
    // Artifacts are raw surface points → scale fully.
    const spFull = (p: Vec3): Vec3 => [round2(p[0] * ratio), round2(p[1] * ratio), round2(p[2] * ratio)];
    const rescaled: Marks = {
      entryways: m.entryways.map((e) => ({ ...e, pos: spFloor(e.pos) })),
      exits: m.exits.map((e) => ({ ...e, pos: spFloor(e.pos), radius: e.radius != null ? round2(e.radius * ratio) : e.radius })),
      artifacts: m.artifacts.map((a) => ({ ...a, pos: spFull(a.pos), radius: round2(a.radius * ratio) })),
    };
    draftRef.current = rescaled;
    setDraft(rescaled);
    historyRef.current = [];
    setUndoDepth(0);
    if (!slug) return;
    setSaveStatus('saving');
    saveMarks(slug, sanitize(rescaled), { scale: next })
      .then(() => setSaveStatus('saved'))
      .catch((e) => { setSaveStatus('error'); console.error('[edit] scale save failed:', e); });
  }, [draftSlug]);

  // Cmd/Ctrl-Z undoes — unless you're typing in a field (let native text-undo win).
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, undo]);

  const cur = () => draftRef.current ?? emptyMarks();

  const addEntryway = useCallback((pos: Vec3, yaw: number) => {
    const m = cur();
    const has = new Set(m.entryways.map((e) => e.id));
    let id = has.has('default') ? 'entry-2' : 'default';
    let n = 2;
    while (has.has(id)) id = `entry-${++n}`;
    const next = { ...m, entryways: [...m.entryways, { id, pos, yaw }] };
    commit(next);
    setSelected({ kind: 'entryway', index: next.entryways.length - 1 });
  }, [commit]);

  const addArtifact = useCallback((pos: Vec3) => {
    const m = cur();
    const next = { ...m, artifacts: [...m.artifacts, { pos, radius: 1.0, url: '' }] };
    commit(next);
    setSelected({ kind: 'artifact', index: next.artifacts.length - 1 });
  }, [commit]);

  const addExit = useCallback((pos: Vec3) => {
    const m = cur();
    const next = { ...m, exits: [...m.exits, { pos, radius: 1.3, to: '' }] };
    commit(next);
    setSelected({ kind: 'exit', index: next.exits.length - 1 });
  }, [commit]);

  const updateEntryway = useCallback((i: number, patch: Partial<Entryway>) => {
    const m = cur();
    commit({ ...m, entryways: m.entryways.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }, [commit]);
  const updateExit = useCallback((i: number, patch: Partial<Exit>) => {
    const m = cur();
    commit({ ...m, exits: m.exits.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }, [commit]);
  const updateArtifact = useCallback((i: number, patch: Partial<Artifact>) => {
    const m = cur();
    commit({ ...m, artifacts: m.artifacts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  }, [commit]);

  const removeMarker = useCallback((kind: MarkerKind, i: number) => {
    const m = cur();
    const key = (kind + 's') as 'entryways' | 'exits' | 'artifacts';
    commit({ ...m, [key]: m[key].filter((_, j) => j !== i) });
    setSelected(null);
  }, [commit]);

  const promoteEntryway = useCallback((i: number) => {
    const m = cur();
    const e = m.entryways[i];
    if (!e) return;
    const next = { ...m, exits: [...m.exits, { pos: e.pos, radius: 1.3, to: '' }] };
    commit(next);
    setSelected({ kind: 'exit', index: next.exits.length - 1 });
  }, [commit]);

  const entrywayAt = useCallback((pos: Vec3): Entryway | null => {
    const m = cur();
    return m.entryways.find((e) => dist(e.pos, pos) < 0.5) ?? null;
  }, []);

  const makeTwoWay = useCallback(async (entryIndex: number, toSlug: string, toEntryId: string) => {
    const m = cur();
    const from = m.entryways[entryIndex];
    if (!from || !draftSlug) return;
    const to = `../${toSlug}/#${toEntryId}`;
    // Forward exit at this entryway, if not already present.
    let exits = m.exits;
    if (!exits.some((e) => e.to === to && dist(e.pos, from.pos) < 0.5)) {
      exits = [...exits, { pos: from.pos, radius: 1.3, to }];
    }
    commit({ ...m, exits });
    // Reciprocal: the writer adds the return exit in the target room, reusing the
    // target entryway's own position. Both entryways must already exist.
    try {
      await linkDoor({ slug: draftSlug, entryId: from.id }, { slug: toSlug, entryId: toEntryId });
      refreshRooms();
    } catch (e) {
      console.error('[edit] two-way link failed:', e);
      setSaveStatus('error');
    }
  }, [commit, draftSlug, refreshRooms]);

  return (
    <Ctx.Provider value={{
      editMode, liveRef, lastCopied, setLastCopied,
      specter, specterRef, toggleSpecter,
      moveSpeed, setMoveSpeed,
      draft, draftSlug, rooms, selected, setSelected, saveStatus,
      seed, undo, canUndo: undoDepth > 0, scale, setScale,
      addEntryway, addArtifact, addExit,
      updateEntryway, updateExit, updateArtifact, removeMarker,
      promoteEntryway, makeTwoWay, entrywayAt,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEdit() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEdit must be used within EditProvider');
  return c;
}
