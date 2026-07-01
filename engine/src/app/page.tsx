import { LANDING_ROOM } from '@/data/site';
import LandingRedirect from './LandingRedirect';

// The viewer renders one room per URL at /<room>/. The root has no museum of its
// own — it just sends you to this deploy's landing room (otherplane.config.json's
// `landingRoom`). This is a server component so the slug is baked in at build;
// the redirect happens client-side (LandingRedirect) since a static export has
// no server to redirect at request time.
export default function Home() {
  return <LandingRedirect to={LANDING_ROOM} />;
}
