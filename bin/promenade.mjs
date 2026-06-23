#!/usr/bin/env node
// The Promenade CLI — one binary, a few verbs, like any other static site
// generator (Hugo/Astro/Eleventy). Your *project* is the repo root: a
// promenade.config.json plus rooms/, worlds/, music/. The *renderer* is engine/
// (content-free). These verbs operate on the project and drive the engine.
//
//   promenade new "<prompt>" --slug x --name "X"   generate a room (World Labs Marble)
//   promenade dev                                  dev server (http://localhost:3000)
//   promenade edit                                 dev server with edit mode on
//   promenade check                                validate every rooms/*/room.json
//   promenade build                                static export → engine/out
//   promenade serve                                serve the built export (:8000)
//   promenade preview                              build, then serve
//   promenade clean                                remove build output + synced mirror
//   promenade setup                                install the engine's deps
//
// Why a sync step: Next can only statically serve files under engine/public/, so
// before dev/build we mirror the project's rooms/worlds/music into engine/public/
// (gitignored — the repo root is the source of truth). Keeps the engine
// content-free while letting the project's content live where it belongs.

import { spawnSync } from 'node:child_process';
import {
  readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync, readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'engine');
const PUBLIC = join(ENGINE, 'public');
const CONTENT_DIRS = ['rooms', 'worlds', 'music'];

// ── helpers ────────────────────────────────────────────────────────────────
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r;
}

// rsync-lite: copy changed files, drop orphans. Avoids re-copying ~20MB of
// splats on every dev start.
function syncDir(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  const srcEntries = readdirSync(src, { withFileTypes: true });
  const keep = new Set(srcEntries.map((e) => e.name));
  for (const e of readdirSync(dest, { withFileTypes: true })) {
    if (!keep.has(e.name)) rmSync(join(dest, e.name), { recursive: true, force: true });
  }
  for (const e of srcEntries) {
    const s = join(src, e.name);
    const d = join(dest, e.name);
    if (e.isDirectory()) { syncDir(s, d); continue; }
    const ss = statSync(s);
    if (existsSync(d)) {
      const ds = statSync(d);
      if (ds.size === ss.size && ds.mtimeMs >= ss.mtimeMs) continue;
    }
    copyFileSync(s, d);
  }
}

function sync() {
  for (const d of CONTENT_DIRS) syncDir(join(ROOT, d), join(PUBLIC, d));
}

// ── validation (mirrors schema/room.schema.json) ────────────────────────────
const isVec3 = (v) =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

function validateRoom(room) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  need(typeof room.display_name === 'string' && room.display_name, 'display_name (non-empty string) required');
  need(typeof room.splat_url === 'string' && room.splat_url, 'splat_url (non-empty string) required');
  need(typeof room.collider_url === 'string' && room.collider_url, 'collider_url (non-empty string) required');
  need(room.calibration && typeof room.calibration.scale === 'number' && room.calibration.scale > 0,
    'calibration.scale (number > 0) required');
  for (const k of ['music_url', 'pano_url', 'thumbnail_url']) {
    if (room[k] != null && typeof room[k] !== 'string') errs.push(`${k} must be a string or null`);
  }
  const list = (name) => {
    const a = room[name];
    if (a == null) return [];
    if (!Array.isArray(a)) { errs.push(`${name} must be an array`); return []; }
    return a;
  };
  const ids = new Set();
  list('entryways').forEach((e, i) => {
    need(typeof e.id === 'string' && e.id, `entryways[${i}].id (non-empty string) required`);
    need(isVec3(e.pos), `entryways[${i}].pos must be [x,y,z] numbers`);
    need(typeof e.yaw === 'number', `entryways[${i}].yaw (number) required`);
    if (e.id) { if (ids.has(e.id)) errs.push(`duplicate entryway id "${e.id}"`); ids.add(e.id); }
  });
  list('exits').forEach((e, i) => {
    need(isVec3(e.pos), `exits[${i}].pos must be [x,y,z] numbers`);
    need(typeof e.to === 'string' && e.to, `exits[${i}].to (non-empty string) required`);
    if (e.radius != null) need(typeof e.radius === 'number' && e.radius > 0, `exits[${i}].radius must be > 0`);
  });
  list('artifacts').forEach((a, i) => {
    need(isVec3(a.pos), `artifacts[${i}].pos must be [x,y,z] numbers`);
    need(typeof a.radius === 'number' && a.radius > 0, `artifacts[${i}].radius (number > 0) required`);
    need(typeof a.url === 'string' && a.url, `artifacts[${i}].url (non-empty string) required`);
  });
  const warns = [];
  const entryways = Array.isArray(room.entryways) ? room.entryways : [];
  if (entryways.length && !entryways.some((e) => e.id === 'default')) {
    warns.push('no "default" entryway — the no-fragment spawn falls back to the first one');
  }
  if (!entryways.length) warns.push('no entryways yet — mark one with `promenade edit` (press C)');
  return { errs, warns };
}

function check() {
  const dir = join(ROOT, 'rooms');
  if (!existsSync(dir)) { console.log('no rooms/ yet — nothing to check'); return; }
  const slugs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  let bad = 0;
  for (const slug of slugs) {
    const path = join(dir, slug, 'room.json');
    if (!existsSync(path)) { console.log(`✗ ${slug}: no room.json`); bad++; continue; }
    let room;
    try { room = JSON.parse(readFileSync(path, 'utf8')); }
    catch (e) { console.log(`✗ ${slug}: invalid JSON — ${e.message}`); bad++; continue; }
    const { errs, warns } = validateRoom(room);
    if (errs.length) { bad++; console.log(`✗ ${slug}`); errs.forEach((m) => console.log(`    ${m}`)); }
    else { console.log(`✓ ${slug}`); }
    warns.forEach((m) => console.log(`    ⚠ ${m}`));
  }
  if (bad) { console.error(`\n${bad} room(s) failed validation`); process.exit(1); }
  console.log(`\nall ${slugs.length} room(s) valid`);
}

// ── commands ─────────────────────────────────────────────────────────────────
const HELP = `promenade — a static site generator for walkable Gaussian-splat museums

usage: promenade <command> [args]

  new "<prompt>" --slug <slug> --name "<Name>"   generate a room (World Labs Marble)
  dev                                            dev server (http://localhost:3000)
  edit                                           dev server with edit mode on (mark coords)
  check                                          validate every rooms/*/room.json
  build                                          static export → engine/out
  serve                                          serve the built export (http://localhost:8000)
  preview                                        build, then serve
  clean                                          remove build output + synced mirror
  setup                                          install the engine's dependencies
`;

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case 'new':
    run('uv', ['run', '--with', 'requests', '--with', 'trimesh', join('scripts', 'gen_world.py'), ...rest]);
    sync();
    break;
  case 'dev':
    sync();
    run('npm', ['--prefix', ENGINE, 'run', 'dev']);
    break;
  case 'edit':
    sync();
    run('npm', ['--prefix', ENGINE, 'run', 'edit']);
    break;
  case 'check':
    check();
    break;
  case 'build':
    check();
    sync();
    run('npm', ['--prefix', ENGINE, 'run', 'build']);
    break;
  case 'serve':
    run('python3', ['-m', 'http.server', '8000'], { cwd: join(ENGINE, 'out') });
    break;
  case 'preview':
    check();
    sync();
    run('npm', ['--prefix', ENGINE, 'run', 'build']);
    run('python3', ['-m', 'http.server', '8000'], { cwd: join(ENGINE, 'out') });
    break;
  case 'clean':
    for (const p of ['.next', 'out']) rmSync(join(ENGINE, p), { recursive: true, force: true });
    for (const d of CONTENT_DIRS) rmSync(join(PUBLIC, d), { recursive: true, force: true });
    console.log('cleaned engine/.next, engine/out, and the synced mirror');
    break;
  case 'setup':
    run('npm', ['--prefix', ENGINE, 'install']);
    break;
  case 'help':
  case undefined:
    process.stdout.write(HELP);
    break;
  default:
    console.error(`unknown command: ${cmd}\n`);
    process.stdout.write(HELP);
    process.exit(1);
}
