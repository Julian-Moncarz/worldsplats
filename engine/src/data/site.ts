// Deploy-level config, read from `promenade.config.json` at the repo root.
//
// A museum is just rooms linked by exits — there is no global "museum" object and
// no start_room baked into the room model. But a single *deploy* still has to
// answer a few per-deploy questions: which room does the site root (/) land on,
// what is the page titled, is it served under a sub-path. Those choices belong to
// the project, NOT to the renderer source — so they live in the project's
// promenade.config.json and the engine reads them here.
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
};

const DEFAULTS: SiteConfig = { landingRoom: '', basePath: '', siteTitle: 'Promenade' };

function load(): SiteConfig {
  try {
    // `next dev`/`next build` run with the engine dir as cwd; the project's
    // config sits one level up at the repo root.
    const raw = readFileSync(join(process.cwd(), '..', 'promenade.config.json'), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export const SITE: SiteConfig = load();
export const LANDING_ROOM = SITE.landingRoom;
