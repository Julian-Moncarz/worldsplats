'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LANDING_ROOM } from '@/data/site';

// The viewer renders one room per URL at /<room>/. The root has no museum of its
// own — it just sends you to this deploy's landing room. (Client redirect because
// static export has no server to redirect at request time.)
export default function Home() {
  const router = useRouter();
  useEffect(() => { router.replace(`/${LANDING_ROOM}`); }, [router]);
  return null;
}
