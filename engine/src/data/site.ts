// Deploy-level config, read from `otherplane.config.json` at the repo root.
//
// A museum is just rooms linked by exits — there is no global "museum" object and
// no start_room baked into the room model. But a single *deploy* still has to
// answer a few per-deploy questions: which room does the site root (/) land on,
// what is the page titled, is it served under a sub-path. Those choices belong to
// the project, NOT to the renderer source — so they live in the project's
// otherplane.config.json and the engine reads them here.
//
// Read at BUILD time and SERVER-SIDE only (it touches fs). Never import this from
// a 'use client' component, or the build will try to bundle fs for the browser.
import { readFileSync } from 'fs';
import { join } from 'path';

export type SiteConfig = {
  /** Slug the site root (/) redirects to. Empty = no redirect. */
  landingRoom: string;
  /** Sub-path prefix for project-page hosting ("" = served at domain root). */
  basePath: string;
  /** Document <title> / metadata. */
  siteTitle: string;
  /** Per-museum walk speed (ships to every viewer). Editable in edit mode. */
  moveSpeed: number;
};

const DEFAULTS: SiteConfig = { landingRoom: '', basePath: '', siteTitle: 'Otherplane', moveSpeed: 14 };

function projectDir(): string {
  // The CLI passes the project root via OTHERPLANE_PROJECT. Falling back to the
  // engine's parent keeps this repo's sibling layout working when run directly.
  return process.env.OTHERPLANE_PROJECT || join(process.cwd(), '..');
}

function load(): SiteConfig {
  let cfg = DEFAULTS;
  try {
    const raw = readFileSync(join(projectDir(), 'otherplane.config.json'), 'utf8');
    cfg = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    cfg = DEFAULTS;
  }
  // `otherplane build --base /museum` overrides basePath for a one-off deploy.
  if (typeof process.env.OTHERPLANE_BASE_PATH === 'string') {
    cfg = { ...cfg, basePath: process.env.OTHERPLANE_BASE_PATH };
  }
  return cfg;
}

export const SITE: SiteConfig = load();
export const LANDING_ROOM = SITE.landingRoom;
