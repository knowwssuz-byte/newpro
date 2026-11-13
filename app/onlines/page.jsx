import { cookies } from 'next/headers';
import OnlinesClient from './OnlinesClient';
import { validSession, ADMIN_COOKIE } from '@/lib/security/adminSession';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'NewPro · Live Control',
  description:'Admin-only member analytics and online monitoring',
  robots:{index:false,follow:false,nocache:true},
};
export default async function OnlinesPage() {
  const store = await cookies();
  const authorized = await validSession(store.get(ADMIN_COOKIE)?.value).catch(() => false);
  return <OnlinesClient initiallyAuthorized={authorized} />;
}
