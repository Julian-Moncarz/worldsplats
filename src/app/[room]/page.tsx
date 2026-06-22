// One room = one URL: /<room>/ (pretty path, e.g. /welcome-room/), entryway via
// the #fragment (/welcome-room/#frontdoor). This server wrapper exists only to
// enumerate which rooms to pre-render for static export; all the actual work is in
// the client RoomViewer.
//
// generateStaticParams reads the room folders that exist at BUILD time. For a
// published site the rooms live under public/rooms/<slug>/room.json, so each gets
// its own /<slug>/index.html in the static export.

import { readdirSync } from 'fs';
import { join } from 'path';
import RoomViewer from './RoomViewer';

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

export default async function Page({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <RoomViewer roomId={room} />;
}
