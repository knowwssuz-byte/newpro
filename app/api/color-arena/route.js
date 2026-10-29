import crypto from 'node:crypto';
import {getSupabaseAdmin} from '@/lib/supabaseAdmin';
import {ensureUser,readTelegramRequest,jsonError} from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['state','join','raise','leave']);
const json=(value)=>Response.json({ok:true,...value},{headers:{'Cache-Control':'no-store'}});
function parseIntStrict(value,min,max) {
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;
}
function dbMessage(error) {
  const raw=String(error?.message||'');
  const entries={
    ARENA_NO_TISH:['TISH balansingiz yetarli emas',400],
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
  const [b,h]=await Promise.all([
    db.rpc('color_arena_public_players',{p_round:room.round_id}),
    includeHistory?db.from('color_arena_history')
      .select('round_id,round_no,winner_id,pot,created_at')
      .eq('room_id',room.id).order('created_at',{ascending:false}).limit(8)
      :Promise.resolve({data:[]})
  ]);
  const bets=dbThrow(b)||[],history=dbThrow(h)||[];
  const winner=bets.find(v=>String(v.id)===String(room.winner_id));
  const pot=Number(room.total_stake)||0;
  return {
    id:room.id,roundId:room.round_id,roundNo:room.round_no,version:room.version,
    status:room.status,minStake:room.min_stake,maxPlayers:null,
    pot,seed:room.seed,bettingEndsAt:room.betting_ends_at,
    rollingAt:room.rolling_at,rollEndsAt:room.roll_ends_at,resultEndsAt:room.result_ends_at,
    winnerId:room.winner_id,winnerName:winner?.name||null,
    // The target is only disclosed when animation is allowed to begin.
    target:['ROLLING','RESULT'].includes(room.status) && room.finish_x!=null
      ?{x:Number(room.finish_x),y:Number(room.finish_y)}:null,
    players:bets.map(v=>({
      id:v.id,seat:v.seat,stake:Number(v.stake),name:v.name||'Player',
      percentage:pot?Number((Number(v.stake)/pot*100).toFixed(3)):0,
      isMe:String(v.user_id)===String(userId)
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
    if(['join','raise'].includes(action)&&!UUID.test(String(input.requestId||'')))
      return jsonError('So‘rov ID noto‘g‘ri',400);
    // One authoritative public room; caller cannot choose wager destination.
    const publicRoom=dbThrow(await db.from('color_arena_rooms')
      .select('id').eq('is_public',true).maybeSingle());
    if(!publicRoom)return jsonError('Ommaviy arena topilmadi',503);
    const roomId=publicRoom.id;
    if(input.roomId!=null && String(input.roomId)!==roomId)
      return jsonError('Faqat ommaviy arena mavjud',400);
    if(action==='join'||action==='raise'){
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
    return json({balance:dbThrow(await db.rpc('color_arena_wallet_init',{p_user:id})),
      serverNow:Date.now(),room:state});
  }catch(error){
    const [message,status]=dbMessage(error);
    return jsonError(message,status);
  }
}
