import {getSupabaseAdmin} from '@/lib/supabaseAdmin';
import {ensureUser,jsonError,readTelegramRequest} from '@/lib/telegramAuth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const ACTIONS=new Set(['list','create','join','state','move','cancel']);
const STAKES=new Set([5,10,25,50]);
function publicError(error) {
 const raw=String(error?.message||'');
 const map={
  PVP_INVALID_ACTION:['Amal noto‘g‘ri',400],
  PVP_ALREADY_IN_GAME:['Avvalgi o‘yiningiz yakunlanmagan',409],
  PVP_MATCH_UNAVAILABLE:['Bu duelga raqib allaqachon qo‘shilgan yoki muddati tugagan',409],
  PVP_INVALID_ENTRY:['Tikish yoki rejim noto‘g‘ri',400],
  PVP_INSUFFICIENT_BALANCE:['Stars balans yetarli emas',400],
  PVP_USER_NOT_FOUND:['O‘yinchi topilmadi yoki bloklangan',403],
  PVP_MATCH_NOT_FOUND:['O‘yin topilmadi',404],
  PVP_NOT_ACTIVE:['O‘yin hali boshlanmagan yoki yakunlangan',409],
  PVP_NOT_YOUR_TURN:['Hozir raqib navbati',409],
  PVP_INVALID_MOVE:['Katak band yoki yurish noto‘g‘ri',409],
 };
 for (const [key,value] of Object.entries(map)) if(raw.includes(key))return value;
 if(error?.code==='PGRST202')return ['PvP bazasi hali o‘rnatilmagan',503];
 console.error('[pvp-xo]',error?.code||'DB_ERROR');
 return ['PvP server xatosi. Qayta urinib ko‘ring.',500];
}
export async function POST(request) {
 try{
  const auth=await readTelegramRequest(request);
  if(!auth.ok)return jsonError(auth.error,auth.status);
  const user=await ensureUser(auth.telegramUser);
  if(user?.is_banned)return jsonError('Bloklangan akkaunt',403);
  const body=auth.body||{}, action=String(body.action||'state');
  if(!ACTIONS.has(action))return jsonError('Amal noto‘g‘ri',400);
  const stake=action==='create'?Number(body.stake):null;
  if(action==='create'&&!STAKES.has(stake))
    return jsonError('Tikish 5, 10, 25 yoki 50 Stars bo‘lishi kerak',400);
  const id=body.matchId==null?null:String(body.matchId);
  if(!['list','create'].includes(action)&&!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id||''))
    return jsonError('O‘yin ID noto‘g‘ri',400);
  const cell=action==='move'?Number(body.cell):null;
  if(action==='move'&&(!Number.isInteger(cell)||cell<0||cell>8))
    return jsonError('Katak 1 dan 9 gacha',400);
  const db=getSupabaseAdmin();
  if(action==='list'){
    const since=new Date(Date.now()-4*60*1000).toISOString();
    const [openRooms,ownGames]=await Promise.all([
      db.from('pvp_xo_matches').select('id,stake,created_at,x_id')
        .eq('mode','online').eq('status','waiting').gte('created_at',since)
        .order('created_at',{ascending:false}).limit(32),
      db.from('pvp_xo_matches').select('id').in('status',['active','waiting'])
        .or('x_id.eq.'+Number(auth.telegramUser.id)+',o_id.eq.'+Number(auth.telegramUser.id))
        .order('created_at',{ascending:false}).limit(1)
    ]);
    if(openRooms.error||ownGames.error){
      console.error('[pvp-xo:list]',openRooms.error?.code||ownGames.error?.code||'DB_ERROR');
      return jsonError('Duel ro‘yxatini olishda xatolik',500);
    }
    const rooms=openRooms.data||[];
    const owners=[...new Set(rooms.map(m=>m.x_id))];
    let players=[];
    if(owners.length){
      const result=await db.from('users').select('id,first_name,username').in('id',owners);
      if(result.error)return jsonError('Raqiblar ro‘yxati yuklanmadi',500);
      players=result.data||[];
    }
    const nameMap=new Map(players.map(u=>[String(u.id),
      String(u.first_name||u.username||'Player').slice(0,30)]));
    return Response.json({ok:true,
      games:rooms.map(m=>({
        id:m.id,stake:m.stake,createdAt:m.created_at,
        owner:nameMap.get(String(m.x_id))||'Player',
        isMine:String(m.x_id)===String(auth.telegramUser.id)
      })),
      myMatchId:ownGames.data?.[0]?.id||null
    },{headers:{'Cache-Control':'no-store'}});
  }
  const rpc=action==='create'?'pvp_xo_create':action==='join'?'pvp_xo_join':'pvp_xo_command';
  const payload=action==='create'?{p_user_id:Number(auth.telegramUser.id),p_stake:stake}
    :action==='join'?{p_user_id:Number(auth.telegramUser.id),p_match_id:id}
    :{p_user_id:Number(auth.telegramUser.id),p_action:action,
      p_match_id:id,p_mode:null,p_stake:null,p_cell:cell};
  const {data,error}=await db.rpc(rpc,payload);
  if(error){const [message,status]=publicError(error);return jsonError(message,status);}
  const userId=String(auth.telegramUser.id);
  const match=data?.match;
  const assignedMatch=match
    ? {...match,your_mark:String(match.x_id)===userId?'X':String(match.o_id)===userId?'O':null}
    : null;
  return Response.json({ok:true,...data,match:assignedMatch},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  console.error('[pvp-xo:route]',String(e?.message||'server error').slice(0,180));
  return jsonError('PvP so‘rovi bajarilmadi',500);
 }
}
