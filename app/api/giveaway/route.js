import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { readTelegramRequest, jsonError } from '@/lib/telegramAuth';
import { joinedBalance, publicBoard } from '@/lib/giveawayServer.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const auth=await readTelegramRequest(request);
  if(!auth.ok)return jsonError(auth.error,auth.status);
  const userId=Number(auth.telegramUser.id);
  const db=getSupabaseAdmin();
  const body=auth.body||{};
  const action=String(body.action||'list');
  try {
    const user=await db.from('users').select('balance,is_banned').eq('id',userId).maybeSingle();
    if(user.error)throw user.error;
    if(!user.data||user.data.is_banned)return jsonError('Hisobingizga kirishga ruxsat yo‘q.',403);
    if(action==='list') {
      const {data:expired,error:expError}=await db.from('giveaways').select('id')
        .eq('status','live').lte('ends_at',new Date().toISOString()).limit(3);
      if(expError)throw expError;
      for(const g of expired||[]) {
        const {error:drawError}=await db.rpc('newpro_giveaway_draw',{p_giveaway:g.id});
        if(drawError)console.error('[giveaway:draw]',drawError.code||'draw_failed');
      }
      const feed=await db.rpc('newpro_giveaway_public_list',{p_user_id:userId});
      if(feed.error)throw feed.error;
      return response({ok:true,giveaways:Array.isArray(feed.data)?feed.data:[],balance:joinedBalance(user),
        serverTime:new Date().toISOString()});
    }
    if(action==='leaderboard') {
      const giveawayId=String(body.giveawayId||'');
      const offset=Number(body.offset||0);
      const revision=body.revision==null?null:String(body.revision);
      if(!UUID.test(giveawayId)||!Number.isSafeInteger(offset)||offset<0||offset>2147483600||
        (revision!==null&&!/^\d+:\d+$/.test(revision)))return jsonError('So‘rov noto‘g‘ri.',400);
      const {data:board,error}=await db.rpc('newpro_giveaway_leaderboard_v2',{
        p_giveaway:giveawayId,p_user:userId,p_limit:30,p_offset:offset,p_revision:revision
      });
      if(error)throw error;
      if(!board)return jsonError('Giveaway mavjud emas.',404);
      return response({ok:true,...publicBoard(board),serverTime:new Date().toISOString()});
    }
    if(action==='join') {
      const giveawayId=String(body.giveawayId||'');
      const requestId=String(body.requestId||'');
      const stars=Number(body.stars);
      if(!UUID.test(giveawayId)||!UUID.test(requestId)||!Number.isSafeInteger(stars)||
        stars<0||stars>10000)return jsonError('Giveaway yoki Stars miqdori noto‘g‘ri.',400);
      // The RPC validates price, deadline and balance under a row lock. Retried
      // request IDs are resolved before the deadline check inside the transaction.
      const {data,error}=await db.rpc('newpro_giveaway_join',{
        p_giveaway:giveawayId,p_user:userId,p_amount:stars,p_request:requestId
      });
      if(error){
        const msg=String(error.message||'');
        const messages={
          ALREADY_JOINED:'Siz bu Giveaway’da allaqachon qatnashyapsiz.',
          INSUFFICIENT_BALANCE:'Balansda Stars yetarli emas.',
          GIVEAWAY_NOT_OPEN:'Giveaway hozir qatnashish uchun ochiq emas.',
          GIVEAWAY_CANCELLED:'Giveaway bekor qilingan. Stars qaytarilgan.',
          GIVEAWAY_NOT_FOUND:'Giveaway topilmadi.',
          INVALID_PRICE:'Kirish narxi o‘zgardi. Sahifani yangilang.',
          INVALID_STAKE:'Stars miqdori shartlarga mos emas.',
          MAX_STAKE_REACHED:'Jami Stars limitingizga yetdingiz.',
          REQUEST_CONFLICT:'Bu so‘rov boshqa miqdor uchun ishlatilgan.',
          USER_NOT_ALLOWED:'Hisobingizga qatnashishga ruxsat berilmagan.'
        };
        const key=Object.keys(messages).find(k=>msg.includes(k));
        if(key)return jsonError(messages[key],409);
        throw error;
      }
      const userAfter=await db.from('users').select('balance').eq('id',userId).single();
      const balance=joinedBalance(userAfter);
      if(balance===null)console.error('[giveaway:balance]',userAfter.error?.code||'balance_unavailable');
      return response({ok:true,entry:data,balance,balanceUnavailable:balance===null});
    }
    return jsonError('Noto‘g‘ri amal.',400);
  } catch(error) {
    console.error('[giveaway]',error.code||'server_error');
    return jsonError('Giveaway ma’lumotlarini yuklashda xatolik. Qayta urinib ko‘ring.',500);
  }
}
