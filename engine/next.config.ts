import type { NextConfig } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';

// Deploy config lives at the repo root (promenade.config.json), not in renderer
// source. Only `basePath` is needed at the Next layer (for project-page hosting
// under a sub-path); landingRoom/siteTitle are read in src/data/site.ts.
function basePath(): string {
  try {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), '..', 'promenade.config.json'), 'utf8'));
    return typeof cfg.basePath === 'string' ? cfg.basePath : '';
  } catch {
    return '';
  }
}

const nextConfig: NextConfig = {
  // Static export: the viewer is a pure client-side player with no server needs,
  // so it builds to plain files hostable on GitHub Pages / R2 / any static host.
  output: 'export',
  basePath: basePath() || undefined,
  trailingSlash: true, // so /welcome-room/ serves /welcome-room/index.html
  images: { unoptimized: true },
  webpack: (config) => {
    // If Next uses webpack (e.g., for some plugins), Spark’s WASM URL resolution is safer this way.
    // See: spark-react-nextjs / spark-react-r3f notes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = (config.module as any)?.parser ?? {};
    config.module.parser = {
      ...parser,
      javascript: {
        ...(parser.javascript ?? {}),
        url: false
      },
    };
    return config;
  },
};

export default nextConfig;
