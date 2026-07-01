#!/usr/bin/env node
// The Otherplane CLI — one binary, a few verbs, like any other static site
// generator (Hugo/Astro/Eleventy). Your *project* is a folder: a
// otherplane.config.json plus rooms/, worlds/, music/. The *renderer* is the
// engine (content-free). These verbs operate on the project and drive the engine.
//
//   otherplane init                                 scaffold a new project here
//   otherplane new "<prompt>" --slug x --name "X"   generate a room (World Labs Marble)
//   otherplane dev                                  dev server (http://localhost:3000)
//   otherplane edit                                 dev server with edit mode on (+ a writer)
//   otherplane check                                validate every rooms/*/room.json
//   otherplane build [--base /museum]               static export → <engine>/out
//   otherplane serve                                serve the built export (:8000)
//   otherplane preview                              build, then serve
//   otherplane clean                                remove build output + synced mirror
//   otherplane setup                                install the engine's deps
//
// Two roots, kept separate so this can become an installable tool:
//   • SELF     — where the CLI + scripts + (bundled) engine live.
//   • PROJECT  — where the content lives. Defaults to the current directory, or
//                $OTHERPLANE_PROJECT. This is the source of truth.
//
// Why a sync step: Next can only statically serve files under the engine's
// public/, so before dev/build we mirror PROJECT's rooms/worlds/music into
// <engine>/public/ (gitignored). Keeps the engine content-free while letting the
// project's content live where it belongs.

import { spawn, spawnSync } from 'node:child_process';
import {
  readdirSync, statSync, mkdirSync, copyFileSync, cpSync, rmSync, existsSync, readFileSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// SELF: the otherplane install (this repo, or the installed package). Tooling
// (scripts/gen_world.py) lives here.
const SELF = join(dirname(fileURLToPath(import.meta.url)), '..');

// PROJECT: the content root. $OTHERPLANE_PROJECT wins; otherwise the current
// working directory (so `npx otherplane` works in any folder). When run via this
// repo's npm scripts, cwd IS the repo root, so behaviour is unchanged.
const PROJECT = process.env.OTHERPLANE_PROJECT || process.cwd();

// ENGINE: the renderer. Prefer a sibling engine/ (this repo's layout); else the
// installed @otherplane/engine package. This is the seam that lets the CLI ship
// as a tool with the engine as a dependency.
function resolveEngine() {
  const sibling = join(SELF, 'engine');
  if (existsSync(join(sibling, 'package.json'))) return sibling;
  try {
    const require = createRequire(import.meta.url);
    return dirname(require.resolve('@otherplane/engine/package.json'));
  } catch {
    return sibling; // best-effort; commands that need it will report the miss
  }
}
const ENGINE = resolveEngine();
const CONTENT_DIRS = ['rooms', 'worlds', 'music'];
const CONFIG_PATH = join(PROJECT, 'otherplane.config.json');
const OUT = join(PROJECT, 'out');

// When installed, the engine lives inside node_modules — but Next/Turbopack won't
// transpile app source under node_modules. So for an installed engine we build a
// COPY staged outside it (in the project's .otherplane/), with its own real
// node_modules. In this repo's sibling layout we build in place.
const INSTALLED = ENGINE.split(sep).includes('node_modules');
let BUILD_ENGINE = ENGINE;                 // where Next actually runs
const publicDir = () => join(BUILD_ENGINE, 'public');
const engineOut = () => join(BUILD_ENGINE, 'out');

// Install the engine's deps into `dir` if missing (real node_modules, not a
// symlink — Turbopack can't resolve `next` through a symlinked node_modules).
function ensureDepsIn(dir) {
  if (existsSync(join(dir, 'node_modules', 'next'))) return;
  console.log('installing the engine’s dependencies (one-time per project, ~a minute)…');
  run('npm', ['--prefix', dir, 'install', '--no-audit', '--no-fund']);
}

// Pick where Next runs and make sure its deps are there.
//  • sibling (this repo): build in place.
//  • installed: the engine sits inside node_modules, but Next won't transpile app
//    source under node_modules — so stage a copy in PROJECT/.otherplane/engine and
//    install deps THERE (kept across builds; `otherplane clean` drops it).
function prepareEngine() {
  if (!INSTALLED) { BUILD_ENGINE = ENGINE; ensureDepsIn(ENGINE); return; }
  const work = join(PROJECT, '.otherplane', 'engine');
  // Refresh source every run (cheap); keep node_modules (expensive) across builds.
  if (existsSync(work)) {
    for (const e of readdirSync(work)) {
      if (e !== 'node_modules') rmSync(join(work, e), { recursive: true, force: true });
    }
  } else {
    mkdirSync(work, { recursive: true });
  }
  cpSync(ENGINE, work, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(ENGINE.length);
      return !rel.startsWith(`${sep}node_modules`)
        && !rel.startsWith(`${sep}.next`)
        && !rel.startsWith(`${sep}out`);
    },
  });
  BUILD_ENGINE = work;
  ensureDepsIn(work);
}

// Env passed to every engine (Next) invocation so it reads THIS project's config
// and content — not whatever happens to sit beside the engine dir.
const engineEnv = (extra = {}) => ({ ...process.env, OTHERPLANE_PROJECT: PROJECT, ...extra });

// ── helpers ────────────────────────────────────────────────────────────────
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: PROJECT, ...opts });
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
  for (const d of CONTENT_DIRS) syncDir(join(PROJECT, d), join(publicDir(), d));
}


// How many rooms the project actually has (a folder with a room.json).
function roomCount() {
  const dir = join(PROJECT, 'rooms');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'room.json'))).length;
}

// Mirror a single room.json into the engine mirror so the dev server serves the
// fresh copy right after an edit-mode write. (Cheap; used by the edit writer.)
function syncRoom(slug) {
  const src = join(PROJECT, 'rooms', slug, 'room.json');
  if (!existsSync(src)) return;
  const destDir = join(publicDir(), 'rooms', slug);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, join(destDir, 'room.json'));
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
  if (!entryways.length) warns.push('no entryways yet — mark one with `otherplane edit` (press C)');
  return { errs, warns };
}

function check() {
  const dir = join(PROJECT, 'rooms');
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

// ── edit-mode writer (a tiny local HTTP sidecar) ─────────────────────────────
// The static export has no server, but coords are only ever marked in `edit`
// (a real dev server). Persistence belongs in the CLI (it owns the project
// filesystem), NOT in a Next route handler (a dynamic handler breaks
// output:'export'). This writes to the PROJECT source — never the mirror, which
// a re-sync would clobber — then mirrors that one file so the dev server serves
// it immediately.
const EDIT_PORT = Number(process.env.OTHERPLANE_EDIT_PORT) || 4400;

function readRoom(slug) {
  return JSON.parse(readFileSync(join(PROJECT, 'rooms', slug, 'room.json'), 'utf8'));
}

// Pretty-print a room the way they're hand-authored: 2-space indent, but with
// [x, y, z] vectors AND each leaf object (an entryway/exit/artifact/calibration)
// kept on one line, so edit-mode saves read like the compact JSON humans write
// and produce clean one-line-per-marker diffs.
function stringifyRoom(room) {
  let json = JSON.stringify(room, null, 2);
  // Inline [x, y, z] vectors.
  json = json.replace(
    /\[\s*\n\s*(-?[\d.eE+]+),\s*\n\s*(-?[\d.eE+]+),\s*\n\s*(-?[\d.eE+]+)\s*\n\s*\]/g,
    '[$1, $2, $3]',
  );
  // Collapse leaf objects (those with no nested braces — vectors are now inline).
  json = json.replace(/\{[^{}]*\}/g, (m) => {
    const inner = m.slice(1, -1).replace(/\s+/g, ' ').trim();
    return inner ? `{ ${inner} }` : '{}';
  });
  return json + '\n';
}

function writeRoom(slug, room) {
  const { errs } = validateRoom(room);
  if (errs.length) throw new Error(errs.join('; '));
  writeFileSync(join(PROJECT, 'rooms', slug, 'room.json'), stringifyRoom(room));
  syncRoom(slug);
}

// Add an exit if an equivalent one (same target) isn't already present.
function addExitOnce(room, exit) {
  room.exits = Array.isArray(room.exits) ? room.exits : [];
  if (room.exits.some((e) => e.to === exit.to)) return false;
  room.exits.push(exit);
  return true;
}

function listRooms() {
  const dir = join(PROJECT, 'rooms');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      try {
        const r = readRoom(d.name);
        return {
          slug: d.name,
          display_name: r.display_name ?? d.name,
          entryways: (r.entryways ?? []).map((e) => ({ id: e.id, pos: e.pos, yaw: e.yaw })),
        };
      } catch { return { slug: d.name, display_name: d.name, entryways: [] }; }
    });
}

function startEditServer() {
  const send = (res, code, body) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, {});
      const url = new URL(req.url, `http://localhost:${EDIT_PORT}`);
      const parts = url.pathname.split('/').filter(Boolean);

      // GET /rooms — enumerate rooms + their entryways (for the exit dropdown).
      if (req.method === 'GET' && parts[0] === 'rooms' && parts.length === 1) {
        return send(res, 200, { rooms: listRooms() });
      }

      // PUT /rooms/:slug — merge the marked arrays into the room, preserving all
      // asset URLs (the client only ever sends coordinate data).
      if (req.method === 'PUT' && parts[0] === 'rooms' && parts.length === 2) {
        const slug = parts[1];
        const body = await readBody(req);
        let room;
        try { room = readRoom(slug); } catch { return send(res, 404, { error: `no room "${slug}"` }); }
        if (Array.isArray(body.entryways)) room.entryways = body.entryways;
        if (Array.isArray(body.exits)) room.exits = body.exits;
        if (Array.isArray(body.artifacts)) room.artifacts = body.artifacts;
        if (body.calibration && typeof body.calibration.scale === 'number' && body.calibration.scale > 0) {
          room.calibration = { ...room.calibration, scale: body.calibration.scale };
        }
        try { writeRoom(slug, room); } catch (e) { return send(res, 400, { error: e.message }); }
        return send(res, 200, { ok: true, room });
      }

      // PUT /config — merge fields into otherplane.config.json (e.g. moveSpeed).
      if (req.method === 'PUT' && parts[0] === 'config' && parts.length === 1) {
        const patch = await readBody(req);
        let cfg = {};
        try { cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { /* new config */ }
        const next = { ...cfg, ...patch };
        writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n');
        return send(res, 200, { ok: true, config: next });
      }

      // POST /doors/link — wire a two-way door by reusing each side's existing
      // entryway position. { a:{slug,entryId}, b:{slug,entryId} }.
      if (req.method === 'POST' && parts[0] === 'doors' && parts[1] === 'link') {
        const { a, b } = await readBody(req);
        if (!a?.slug || !a?.entryId || !b?.slug || !b?.entryId) {
          return send(res, 400, { error: 'need a:{slug,entryId} and b:{slug,entryId}' });
        }
        let roomA, roomB;
        try { roomA = readRoom(a.slug); roomB = readRoom(b.slug); }
        catch { return send(res, 404, { error: 'unknown room' }); }
        const entryA = (roomA.entryways ?? []).find((e) => e.id === a.entryId);
        const entryB = (roomB.entryways ?? []).find((e) => e.id === b.entryId);
        if (!entryA || !entryB) return send(res, 400, { error: 'both entryways must already exist' });
        addExitOnce(roomA, { pos: entryA.pos, radius: 1.3, to: `../${b.slug}/#${b.entryId}` });
        addExitOnce(roomB, { pos: entryB.pos, radius: 1.3, to: `../${a.slug}/#${a.entryId}` });
        try { writeRoom(a.slug, roomA); writeRoom(b.slug, roomB); }
        catch (e) { return send(res, 400, { error: e.message }); }
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  server.on('error', (e) => {
    console.error(`edit writer failed to start on :${EDIT_PORT} — ${e.message}`);
    console.error('(set OTHERPLANE_EDIT_PORT to use another port)');
  });
  server.listen(EDIT_PORT, () => console.log(`✎ edit writer on http://localhost:${EDIT_PORT}`));
  return server;
}

// Run the engine dev server with an edit writer alongside it. Uses async spawn
// (not spawnSync) so the writer's event loop keeps serving while Next runs.
function runEdit() {
  const server = startEditServer();
  const child = spawn('npm', ['--prefix', BUILD_ENGINE, 'run', 'edit'], {
    stdio: 'inherit',
    cwd: PROJECT,
    env: engineEnv({ NEXT_PUBLIC_EDIT_API: `http://localhost:${EDIT_PORT}` }),
  });
  const shutdown = () => { try { server.close(); } catch {} try { child.kill(); } catch {} };
  process.on('SIGINT', () => { shutdown(); process.exit(0); });
  process.on('SIGTERM', () => { shutdown(); process.exit(0); });
  child.on('close', (code) => { server.close(); process.exit(code ?? 0); });
}

// ── init: scaffold a fresh project in PROJECT ────────────────────────────────
function init() {
  const wrote = [];
  const put = (rel, contents) => {
    const p = join(PROJECT, rel);
    if (existsSync(p)) return;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, contents);
    wrote.push(rel);
  };
  put('otherplane.config.json', JSON.stringify({ landingRoom: '', basePath: '', siteTitle: 'My Museum' }, null, 2) + '\n');
  put('.gitignore', ['# Otherplane build artifacts', 'node_modules/', 'out/', '.next/', ''].join('\n'));
  put('.env.example', 'WORLD_LABS_KEY=\n');
  mkdirSync(join(PROJECT, 'rooms'), { recursive: true });
  mkdirSync(join(PROJECT, 'worlds'), { recursive: true });
  mkdirSync(join(PROJECT, 'music'), { recursive: true });
  if (wrote.length) {
    console.log(`✓ initialised a Otherplane project in ${PROJECT}`);
    wrote.forEach((f) => console.log(`    + ${f}`));
    console.log('\nnext: cp .env.example .env (paste WORLD_LABS_KEY), then `otherplane new "<prompt>" --slug <slug> --name "<Name>"`');
  } else {
    console.log('project already initialised — nothing to do');
  }
}

// ── commands ─────────────────────────────────────────────────────────────────
const HELP = `otherplane — a static site generator for walkable Gaussian-splat museums

usage: otherplane <command> [args]

  init                                           scaffold a new project in this folder
  new "<prompt>" --slug <slug> --name "<Name>"   generate a room (World Labs Marble)
  dev                                            dev server (http://localhost:3000)
  edit                                           dev server with edit mode on (mark coords)
  check                                          validate every rooms/*/room.json
  build [--base /museum]                         static export → ./out (deploy this)
  serve                                          serve the built export (http://localhost:8000)
  preview                                        build, then serve
  clean                                          remove build output + synced mirror
  setup                                          install the engine's dependencies
`;

const [, , cmd, ...rest] = process.argv;

// Pull "--base <path>" out of build args and turn it into a config override the
// engine reads via env (see next.config.ts / site.ts).
function takeBase(args) {
  const i = args.indexOf('--base');
  if (i === -1) return undefined;
  return args[i + 1];
}

// Validate, mirror content, static-export, and land the deployable in PROJECT/out
// (the engine's own out/ may sit inside an installed package).
function buildEngine(base) {
  if (roomCount() === 0) {
    console.error('no rooms yet — add one with `otherplane new` or create rooms/<slug>/room.json, then build.');
    process.exit(1);
  }
  prepareEngine();
  check();
  sync();
  run('npm', ['--prefix', BUILD_ENGINE, 'run', 'build'], {
    env: engineEnv(base != null ? { OTHERPLANE_BASE_PATH: base } : {}),
  });
  if (engineOut() !== OUT) {
    rmSync(OUT, { recursive: true, force: true });
    cpSync(engineOut(), OUT, { recursive: true });
    console.log(`✓ exported to ${OUT}`);
  }
}

switch (cmd) {
  case 'init':
    init();
    break;
  case 'new':
    run('uv', ['run', '--with', 'requests', '--with', 'trimesh', join(SELF, 'scripts', 'gen_world.py'), ...rest],
      { env: engineEnv() });
    sync();
    break;
  case 'dev':
      prepareEngine();
    sync();
    run('npm', ['--prefix', BUILD_ENGINE, 'run', 'dev'], { env: engineEnv() });
    break;
  case 'edit':
      prepareEngine();
    sync();
    runEdit();
    break;
  case 'check':
    check();
    break;
  case 'build':
    buildEngine(takeBase(rest));
    break;
  case 'serve':
    run('python3', ['-m', 'http.server', '8000'], { cwd: OUT });
    break;
  case 'preview':
    buildEngine(takeBase(rest));
    run('python3', ['-m', 'http.server', '8000'], { cwd: OUT });
    break;
  case 'clean':
    // Remove build output in both layouts: the in-place engine (dev sibling), the
    // staged copy (installed), and the project's out/.
    rmSync(join(ENGINE, '.next'), { recursive: true, force: true });
    rmSync(join(ENGINE, 'out'), { recursive: true, force: true });
    for (const d of CONTENT_DIRS) rmSync(join(ENGINE, 'public', d), { recursive: true, force: true });
    rmSync(join(PROJECT, '.otherplane'), { recursive: true, force: true });
    rmSync(OUT, { recursive: true, force: true });
    console.log('cleaned build output (.next, out, .otherplane) and the synced mirror');
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
