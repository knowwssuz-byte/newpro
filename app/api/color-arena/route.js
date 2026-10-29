import crypto from 'node:crypto';
import {getSupabaseAdmin} from '@/lib/supabaseAdmin';
import {ensureUser,readTelegramRequest,jsonError} from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['state','join','raise','leave','inventory','gift']);
const json=(value)=>Response.json({ok:true,...value},{headers:{'Cache-Control':'no-store'}});
function parseIntStrict(value,min,max) {
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;
}
function dbMessage(error) {
  const raw=String(error?.message||'');
  const entries={
    ARENA_NO_STARS:['Stars balansingiz yetarli emas',400],
    ARENA_GIFT_UNAVAILABLE:['Gift inventarda mavjud emas yoki band qilingan',409],
    ARENA_GIFT_ESCROWED:['Gift arena natijasi chiqquncha bloklangan',409],
    ARENA_GIFT_VALUE_INVALID:['Giftning stavka qiymati mos kelmaydi',400],
    ARENA_BETS_LOCKED:['Stavka qabul qilish tugagan',409],
    ARENA_MIN_STAKE:['Xonaning minimal stavkasi bajarilmadi',400],
    ARENA_ALREADY_JOINED:['Siz allaqachon shu raunddasiz',409],
    ARENA_ROOM_FULL:['Xona to‘lgan',409],
    ARENA_NO_ROOM:['Xona topilmadi',404],
    ARENA_CANNOT_CANCEL:['Endi bu xonani bekor qilib bo‘lmaydi',409],
    ARENA_NOT_PLAYER:['Avval raundga qo‘shiling',403],
    ARENA_NO_USER:['O‘yinchi topilmadi',403],
    ARENA_INVALID_ENTRY:['Stavka yoki xona sozlamasi noto‘g‘ri',400],
    ARENA_STALE_ROUND:['Raund yangilangan, qayta tekshiring',409],
    ARENA_NOT_FINISHABLE:['Raund hali yakunlanmagan',409]
  };
  for (const [code,result] of Object.entries(entries)) if(raw.includes(code))return result;
  if(error?.code==='PGRST202'||error?.code==='42P01')return ['COLOR ARENA bazasi o‘rnatilmagan',503];
  console.error('[color-arena]',error?.code||'DATABASE_ERROR');
  return ['COLOR ARENA server xatosi',500];
}
function dbThrow(result) {if(result.error)throw result.error;return result.data;}
async function advance(db,id) {
  let room=dbThrow(await db.from('color_arena_rooms').select('*').eq('id',id).maybeSingle());
  if(!room)return null;
  if(['BETTING','LOCKED','RESULT'].includes(room.status)){
    dbThrow(await db.rpc('color_arena_tick',{p_room:id}));
    room=dbThrow(await db.from('color_arena_rooms').select('*').eq('id',id).single());
  }
  // Commit the CSPRNG result before the ball animation begins. A second
  // parallel request cannot replace it (DB locks room in color_arena_plan).
  if(room.status==='LOCKED' && room.finish_x==null){
    const x=crypto.randomInt(1_000_000_000)/1_000_000_000;
    const y=crypto.randomInt(1_000_000_000)/1_000_000_000;
    dbThrow(await db.rpc('color_arena_plan',{p_room:id,p_round:room.round_id,p_x:x,p_y:y}));
    room=dbThrow(await db.from('color_arena_rooms').select('*').eq('id',id).single());
  }
  if(room.status==='LOCKED' && Date.now()>=Date.parse(room.rolling_at)){
    dbThrow(await db.rpc('color_arena_tick',{p_room:id}));
    room=dbThrow(await db.from('color_arena_rooms').select('*').eq('id',id).single());
  }
  if(room.status==='ROLLING' && Date.now()>=Date.parse(room.roll_ends_at)){
    if(room.finish_x==null || room.finish_y==null)throw Error('ARENA_NOT_PLANNABLE');
    dbThrow(await db.rpc('color_arena_finish',{
      p_room:id,p_round:room.round_id,p_x:room.finish_x,p_y:room.finish_y
    }));
    room=dbThrow(await db.from('color_arena_rooms').select('*').eq('id',id).single());
  }
  return room;
}
async function roomState(db,id,userId,includeHistory=true) {
  const room=await advance(db,id);
  if(!room)return null;
  const [b,h,g]=await Promise.all([
    db.rpc('color_arena_public_players',{p_round:room.round_id}),
    includeHistory?db.from('color_arena_history')
      .select('round_id,round_no,winner_id,pot,created_at')
      .eq('room_id',room.id).eq('currency','stars').order('created_at',{ascending:false}).limit(8)
      :Promise.resolve({data:[]}),
    db.from('color_arena_gift_stakes').select('history_id,owner_id,value_stars,status,winner_id')
      .eq('round_id',room.round_id).in('status',['locked','settled'])
  ]);
  const bets=dbThrow(b)||[],historyRaw=dbThrow(h)||[],giftStakes=dbThrow(g)||[];
  const historyRounds=historyRaw.map(h=>h.round_id);
  const [feeHist,giftHist]=historyRounds.length?await Promise.all([
    db.from('color_arena_platform_revenue').select('round_id,net_stars').in('round_id',historyRounds),
    db.from('color_arena_gift_stakes').select('round_id').in('round_id',historyRounds)
  ]):[{data:[]},{data:[]}];
  const netStars=new Map((dbThrow(feeHist)||[]).map(r=>[r.round_id,Number(r.net_stars)]));
  const giftCounts=new Map();
  for(const g of dbThrow(giftHist)||[])giftCounts.set(g.round_id,(giftCounts.get(g.round_id)||0)+1);
  const history=historyRaw.map(h=>({...h,
    pot:netStars.get(h.round_id)??Number(h.pot),giftCount:giftCounts.get(h.round_id)||0}));
  const giftValue=giftStakes.reduce((sum,item)=>sum+Number(item.value_stars),0);
  const starsPot=Math.max(0,Number(room.total_stake)-giftValue);
  const feeBps=Number(room.fee_bps)||0;
  const feeStars=Math.floor(starsPot*feeBps/10000);
  const winner=bets.find(v=>String(v.id)===String(room.winner_id));
  const pot=Number(room.total_stake)||0;
  return {
    id:room.id,roundId:room.round_id,roundNo:room.round_no,version:room.version,
    status:room.status,minStake:room.min_stake,maxPlayers:null,
    pot,seed:room.seed,bettingEndsAt:room.betting_ends_at,
    starsPot,feeBps,feeStars,prizeStars:starsPot-feeStars,
    giftPotCount:giftStakes.length,giftValue,
    myGiftIds:giftStakes.filter(g=>String(g.owner_id)===String(userId)).map(g=>g.history_id),
    rollingAt:room.rolling_at,rollEndsAt:room.roll_ends_at,resultEndsAt:room.result_ends_at,
    winnerId:room.winner_id,winnerName:winner?.name||null,
    // The target is only disclosed when animation is allowed to begin.
    target:['ROLLING','RESULT'].includes(room.status) && room.finish_x!=null
      ?{x:Number(room.finish_x),y:Number(room.finish_y)}:null,
    players:bets.map(v=>({
      id:v.id,seat:v.seat,stake:Number(v.stake),name:v.name||'Player',
      percentage:pot?Number((Number(v.stake)/pot*100).toFixed(3)):0,
      isMe:String(v.id)===String(userId)
    })),
    history
  };
}
export async function POST(request){
  try {
    const auth=await readTelegramRequest(request);
    if(!auth.ok)return jsonError(auth.error,auth.status);
    const user=await ensureUser(auth.telegramUser);
    if(user.is_banned)return jsonError('Bloklangan akkaunt',403);
    const db=getSupabaseAdmin(),id=Number(auth.telegramUser.id);
    const input=auth.body||{},action=String(input.action||'state');
    if(!ACTIONS.has(action))return jsonError('Noto‘g‘ri amal',400);
    if(['join','raise','gift'].includes(action)&&!UUID.test(String(input.requestId||'')))
      return jsonError('So‘rov ID noto‘g‘ri',400);
    // One authoritative public room; caller cannot choose wager destination.
    const publicRoom=dbThrow(await db.from('color_arena_rooms')
      .select('id').eq('is_public',true).maybeSingle());
    if(!publicRoom)return jsonError('Ommaviy arena topilmadi',503);
    const roomId=publicRoom.id;
    if(input.roomId!=null && String(input.roomId)!==roomId)
      return jsonError('Faqat ommaviy arena mavjud',400);
    if(action==='inventory'){
      // Never trust any gift ID from the browser. Query caller-owned unsold
      // inventory, excluding withdrawals and gifts already escrowed.
      const rows=dbThrow(await db.from('open_history').select('id,gift_id')
        .eq('user_id',id).is('sold_at',null).is('upgraded_at',null)
        .order('created_at',{ascending:false}).limit(120));
      const giftIds=[...new Set(rows.map(r=>r.gift_id).filter(Boolean))];
      const [gf,wd,locked]=await Promise.all([
        giftIds.length?db.from('gifts')
          .select('id,title,type,image_url,animation_url,sell_price,buy_price,floor_price')
          .in('id',giftIds):Promise.resolve({data:[]}),
        rows.length?db.from('withdraw_requests').select('history_id')
          .in('history_id',rows.map(r=>r.id)):Promise.resolve({data:[]}),
        rows.length?db.from('color_arena_gift_stakes').select('history_id')
          .in('history_id',rows.map(r=>r.id)).eq('status','locked'):Promise.resolve({data:[]})
      ]);
      const gifts=new Map((dbThrow(gf)||[]).map(g=>[g.id,g]));
      const blocked=new Set([...(dbThrow(wd)||[]),...(dbThrow(locked)||[])].map(r=>r.history_id));
      const inventory=rows.filter(r=>!blocked.has(r.id)).map(r=>{
        const gift=gifts.get(r.gift_id);
        if(!gift||String(gift.type||'gift').toLowerCase()!=='gift')return null;
        const value=Math.floor(Math.max(0,Number(gift.sell_price??gift.buy_price??gift.floor_price??0)));
        if(!Number.isSafeInteger(value)||value<1||value>200000)return null;
        return {historyId:r.id,title:gift.title,imageUrl:gift.image_url,
          animationUrl:gift.animation_url,value};
      }).filter(Boolean);
      return json({inventory,serverNow:Date.now()});
    }
    if(action==='gift'){
      if(!UUID.test(String(input.historyId||'')))return jsonError('Gift ID noto‘g‘ri',400);
      dbThrow(await db.rpc('color_arena_stake_gift',{p_room:roomId,p_user:id,
        p_history:input.historyId,p_request:input.requestId}));
    }else if(action==='join'||action==='raise'){
      const amount=parseIntStrict(action==='join'?input.stake:input.amount,
        action==='join'?5:1,200000);
      if(amount===null)return jsonError('Stavka noto‘g‘ri',400);
      const rpc=action==='join'?'color_arena_join':'color_arena_raise';
      const params=action==='join'
        ?{p_room:roomId,p_user:id,p_stake:amount,p_request:input.requestId}
        :{p_room:roomId,p_user:id,p_amount:amount,p_request:input.requestId};
      dbThrow(await db.rpc(rpc,params));
    }else if(action==='leave'){
      dbThrow(await db.rpc('color_arena_leave_waiting',{p_user:id,p_room:roomId}));
    }
    const state=await roomState(db,roomId,id);
    if(!state)return jsonError('Xona topilmadi',404);
    const balanceData=dbThrow(await db.from('users').select('balance').eq('id',id).single());
    return json({balance:Number(balanceData.balance),
      serverNow:Date.now(),room:state});
  }catch(error){
    const [message,status]=dbMessage(error);
    return jsonError(message,status);
  }
}
