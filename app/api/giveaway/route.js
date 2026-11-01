import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { readTelegramRequest, jsonError } from '@/lib/telegramAuth';

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
    if(action==='list') {
      const {data:expired,error:expError}=await db.from('giveaways').select('id')
        .eq('status','live').lte('ends_at',new Date().toISOString()).limit(3);
      if(expError)throw expError;
      for(const g of expired||[]) {
        const {error:drawError}=await db.rpc('newpro_giveaway_draw',{p_giveaway:g.id});
        if(drawError)console.error('[giveaway:draw]',drawError.code||'draw_failed');
      }
      const [feed,user]=await Promise.all([
        db.rpc('newpro_giveaway_public_list',{p_user_id:userId}),
        db.from('users').select('balance,is_banned').eq('id',userId).maybeSingle()
      ]);
      if(feed.error)throw feed.error;
      if(user.error)throw user.error;
      if(!user.data)return jsonError('Avval Telegram botdan ro‘yxatdan o‘ting.',403);
      return response({ok:true,giveaways:feed.data||[],balance:Number(user.data.balance||0),
        paidEnabled:process.env.GIVEAWAY_PAID_ENABLED==='true',serverTime:new Date().toISOString()});
    }
    if(action==='join') {
      const giveawayId=String(body.giveawayId||'');
      const requestId=String(body.requestId||'');
      const stars=Number(body.stars);
      if(!UUID.test(giveawayId)||!UUID.test(requestId)||!Number.isSafeInteger(stars)||
        stars<0||stars>10000)return jsonError('Giveaway yoki Stars miqdori noto‘g‘ri.',400);
      const [giveaway,user]=await Promise.all([
        db.from('giveaways').select('mode,entry_price,status').eq('id',giveawayId).maybeSingle(),
        db.from('users').select('id,is_banned').eq('id',userId).maybeSingle()
      ]);
      if(giveaway.error)throw giveaway.error;
      if(user.error)throw user.error;
      if(!user.data||user.data.is_banned)return jsonError('Foydalanuvchi uchun ruxsat yo‘q.',403);
      if(!giveaway.data)return jsonError('Giveaway topilmadi.',404);
      if((giveaway.data.entry_price>0||giveaway.data.mode==='weighted') &&
        process.env.GIVEAWAY_PAID_ENABLED!=='true')
        return jsonError('Pullik Giveaway hozircha faol emas.',403);
      if(giveaway.data.mode==='equal'&&stars!==giveaway.data.entry_price)
        return jsonError('Kirish narxi mos kelmadi.',400);
      if(giveaway.data.mode==='weighted'&&stars<giveaway.data.entry_price)
        return jsonError('Minimum Stars yetarli emas.',400);
      const {data,error}=await db.rpc('newpro_giveaway_join',{
        p_giveaway:giveawayId,p_user:userId,p_amount:stars,p_request:requestId
      });
      if(error){
        const msg=String(error.message||'');
        const messages={
          ALREADY_JOINED:'Siz bu Giveaway’da allaqachon qatnashyapsiz.',
          INSUFFICIENT_BALANCE:'Balansda Stars yetarli emas.',
          GIVEAWAY_NOT_OPEN:'Giveaway hozir qatnashish uchun ochiq emas.',
          GIVEAWAY_NOT_FOUND:'Giveaway topilmadi.',
          INVALID_STAKE:'Stars miqdori shartlarga mos emas.',
          USER_NOT_ALLOWED:'Hisobingizga qatnashishga ruxsat berilmagan.'
        };
        return jsonError(messages[Object.keys(messages).find(k=>msg.includes(k))]||'Qatnashishda xatolik.',409);
      }
      const userAfter=await db.from('users').select('balance').eq('id',userId).single();
      return response({ok:true,entry:data,balance:Number(userAfter.data?.balance||0)});
    }
    return jsonError('Noto‘g‘ri amal.',400);
  } catch(error) {
    console.error('[giveaway]',error.code||'server_error');
    return jsonError('Giveaway ma’lumotlarini yuklashda xatolik.',500);
  }
}
