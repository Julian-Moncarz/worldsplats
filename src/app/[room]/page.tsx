// One room = one URL: /<room>/ (pretty path, e.g. /welcome-room/), entryway via
// the #fragment (/welcome-room/#frontdoor).
//
// This page is intentionally EMPTY: the viewer lives in the persistent [room]
// layout (layout.tsx), so it survives navigation between rooms and never drops
// pointer lock. The page exists only to (1) make /<room>/ a real route and
// (2) enumerate which rooms to pre-render for static export.
//
// generateStaticParams reads the room folders that exist at BUILD time. For a
// published site the rooms live under public/rooms/<slug>/room.json, so each gets
// its own /<slug>/index.html in the static export.

import { readdirSync } from 'fs';
import { join } from 'path';

export function generateStaticParams() {
  try {
    const dir = join(process.cwd(), 'public', 'rooms');
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ room: d.name }));
  } catch {
    return []; // no rooms yet — a content-free engine still builds
  }
}

export default function Page() {
  // Rendered as the layout's `children`; the layout's <RoomViewer /> is the UI.
  return null;
}
