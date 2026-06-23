import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export: the viewer is a pure client-side player with no server needs,
  // so it builds to plain files hostable on GitHub Pages / R2 / any static host.
  output: 'export',
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
