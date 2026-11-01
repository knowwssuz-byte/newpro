import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const dynamic = 'force-dynamic';

const SECTIONS = new Set([
  'home','games','case','inventory','bonus','referral','profile',
  'history','upgrade','pvp','color','xo','rocket','dice','deposit','giveaway','other'
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const auth = await readTelegramRequest(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const userId = Number(auth.telegramUser.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return jsonError('Telegram ID noto‘g‘ri.', 400);
  const body = auth.body || {};
  const action = String(body.action || 'ping');
  const db = getSupabaseAdmin();
  try {
    if (action === 'error') {
      const section = SECTIONS.has(body.section) ? body.section : 'other';
      const message = String(body.message || '').replace(/[\x00-\x1f]/g, ' ').slice(0, 180);
      if (!message) return jsonError('Xatolik tavsifi kerak.', 400);
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const { count, error: checkError } = await db.from('user_client_errors')
        .select('id', { count: 'exact', head: true }).eq('user_id',userId)
        .gte('created_at',oneMinuteAgo);
      if (checkError) throw checkError;
      if (Number(count || 0) >= 5) return Response.json({ ok: true, rateLimited: true });
      const { error } = await db.from('user_client_errors').insert({
        user_id:userId, section, message,
      });
      if (error) throw error;
      return Response.json({ ok:true });
    }
    const session = String(body.sessionId || '');
    if (!UUID.test(session)) return jsonError('Session ID noto‘g‘ri.',400);
    if (action === 'away') {
      const { error } = await db.from('user_presence_sessions')
        .update({ active:false, last_seen_at:new Date().toISOString() })
        .eq('user_id',userId).eq('session_id',session);
      if (error) throw error;
      return Response.json({ ok:true }, {headers: {'Cache-Control':'no-store'}});
    }
    if (action !== 'ping') return jsonError('Amal noto‘g‘ri.',400);
    const section = SECTIONS.has(body.section) ? body.section : 'other';
    const { error } = await db.from('user_presence_sessions').upsert({
      user_id:userId, session_id:session, section, active:true, last_seen_at:new Date().toISOString()
    }, {onConflict:'user_id,session_id'});
    if (error) throw error;
    return Response.json({ok:true}, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error('[presence]',error.code || 'error');
    return jsonError('Faollikni qayd qilib bo‘lmadi.',500);
  }
}
