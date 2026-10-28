import {getSupabaseAdmin} from '@/lib/supabaseAdmin';
import {ensureUser,jsonError,readTelegramRequest} from '@/lib/telegramAuth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const ACTIONS=new Set(['start','state','move','cancel']);
const STAKES=new Set([5,10,25,50]);
function publicError(error) {
 const raw=String(error?.message||'');
 const map={
  PVP_INVALID_ACTION:['Amal noto‘g‘ri',400],
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
  const mode=action==='start'?String(body.mode||''):null;
  const stake=action==='start'?Number(body.stake):null;
  if(action==='start'&&(!['bot','online'].includes(mode)||!STAKES.has(stake)))
    return jsonError('Tikish 5, 10, 25 yoki 50 Stars bo‘lishi kerak',400);
  const id=body.matchId==null?null:String(body.matchId);
  if(action!=='start'&&!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id||''))
    return jsonError('O‘yin ID noto‘g‘ri',400);
  const cell=action==='move'?Number(body.cell):null;
  if(action==='move'&&(!Number.isInteger(cell)||cell<0||cell>8))
    return jsonError('Katak 1 dan 9 gacha',400);
  const {data,error}=await getSupabaseAdmin().rpc('pvp_xo_command',{
   p_user_id:Number(auth.telegramUser.id),p_action:action,
   p_match_id:id,p_mode:mode,p_stake:stake,p_cell:cell
  });
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
