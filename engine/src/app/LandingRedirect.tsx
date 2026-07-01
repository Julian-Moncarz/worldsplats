'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Client redirect to the deploy's landing room. The room slug is resolved at
// build time (server) and passed in; the redirect itself must be client-side
// because a static export has no server to redirect at request time.
export default function LandingRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    if (to) router.replace(`/${to}`);
  }, [router, to]);
  return null;
}
