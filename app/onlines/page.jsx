import { cookies } from 'next/headers';
import OnlinesClient from './OnlinesClient';
import { isOnlineAdmin, ONLINE_ADMIN_COOKIE } from '@/lib/onlinesAuth';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'NewPro · Live Control',
  description:'Admin-only member analytics and online monitoring',
  robots:{index:false,follow:false,nocache:true},
};
export default async function OnlinesPage() {
  const store = await cookies();
  const authorized = isOnlineAdmin(store.get(ONLINE_ADMIN_COOKIE)?.value);
  return <OnlinesClient initiallyAuthorized={authorized} />;
}
