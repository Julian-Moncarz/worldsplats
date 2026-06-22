import { redirect } from 'next/navigation';
import { LANDING_ROOM } from '@/data/site';

// The viewer renders one room per URL at /r/<id>. The root has no museum of its
// own — it just sends you to this deploy's landing room.
export default function Home() {
  redirect(`/r/${LANDING_ROOM}`);
}
