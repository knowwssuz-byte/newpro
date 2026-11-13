import { readTelegramRequest, jsonError } from '@/lib/telegramAuth';
export const runtime = 'nodejs';
export async function POST(request) {
  const auth = await readTelegramRequest(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  return Response.json({ ok: true, user: auth.telegramUser, auth_date: auth.authDate }, { headers: { 'Cache-Control': 'no-store' } });
}
