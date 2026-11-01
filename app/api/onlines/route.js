import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ONLINE_ADMIN_COOKIE, isOnlineAdmin } from '@/lib/onlinesAuth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers = { 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' };
const json = (value,status=200)=>Response.json(value,{status,headers});
const validId = id=> /^\d{1,16}$/.test(String(id||'')) && Number.isSafeInteger(Number(id)) && Number(id)>0;

async function activityForUser(db,id) {
  const selections = [
    ['deposits','deposit_transactions','id,method,status,pay_currency,pay_amount,credit_amount,created_at,completed_at'],
    ['withdrawals','withdraw_requests','id,status,admin_note,gift_id,created_at,updated_at'],
    ['cases','open_history','id,case_id,gift_id,sold_at,sale_price,upgraded_at,created_at'],
    ['dice','dice_rounds','id,mode,target,roll,won,bet,payout,created_at'],
    ['rocket','rocket_game_bets','id,bet,payout,status,cashout_multiplier,created_at'],
    ['color','color_arena_bets','id,room_id,round_id,stake,created_at'],
    ['colorLedger','color_arena_ledger','id,kind,amount,created_at'],
    ['xoLedger','pvp_xo_ledger','id,kind,amount,created_at'],
    ['upgrade','upgrade_rounds','id,source_price,target_price,outcome,created_at'],
    ['errors','user_client_errors','id,section,message,created_at'],
  ];
  const result = await Promise.all(selections.map(async ([key,table,columns])=>{
    const {data,error}=await db.from(table).select(columns).eq('user_id',id)
      .order('created_at',{ascending:false}).limit(40);
    if (error) throw new Error(table+': '+error.code);
    return [key,data||[]];
  }));
  const {data:xo,error:xoError}=await db.from('pvp_xo_matches')
    .select('id,mode,status,stake,moves,winner,created_at,finished_at')
    .or('x_id.eq.'+id+',o_id.eq.'+id).order('created_at',{ascending:false}).limit(40);
  if(xoError)throw new Error('pvp_xo_matches: '+xoError.code);
  const parts=Object.fromEntries(result);
  parts.xo=xo||[];
  const titles = {
    deposits:'Deposit', withdrawals:'Gift yechish',cases:'Case',dice:'Dice',rocket:'Rocket',
    color:'Color Arena',colorLedger:'Color Arena balans',xoLedger:'X/O balans',
    xo:'X/O Duel',upgrade:'Upgrade',errors:'Ilova xatosi'
  };
  const events=Object.entries(parts).flatMap(([key,rows])=>rows.map(row=>({
    id:key+':'+row.id, kind:key, title:titles[key], createdAt:row.created_at,
    info:key==='deposits'
      ? (row.method||'deposit')+' · '+row.status+' · '+Number(row.credit_amount||0)+' Stars'
      :key==='withdrawals' ? row.status+(row.admin_note?' · '+String(row.admin_note).slice(0,130):'')
      :key==='cases' ? (row.sold_at?'Sotildi · '+Number(row.sale_price||0)+' Stars':'Case ochildi')
      :key==='dice' ? Number(row.bet||0)+' bet · '+Number(row.payout||0)+' payout · '+(row.won?'Win':'Loss')
      :key==='rocket' ? Number(row.bet||0)+' bet · '+Number(row.payout||0)+' payout · '+row.status
      :key==='color' ? Number(row.stake||0)+' Stars tikildi'
      :key==='colorLedger'||key==='xoLedger' ? row.kind+' · '+Number(row.amount||0)+' Stars'
      :key==='xo' ? row.status+' · '+Number(row.stake||0)+' Stars'
      :key==='upgrade' ? row.outcome+' · '+Number(row.source_price||0)+' → '+Number(row.target_price||0)+' Stars'
      :key==='errors' ? row.section+' · '+row.message : '',
  }))).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,100);
  return {events, recentFailures:parts.errors.slice(0,15), recentDeposits:parts.deposits.slice(0,25),
    recentWithdrawals:parts.withdrawals.slice(0,25)};
}
export async function GET(request) {
  if (!isOnlineAdmin(request.cookies.get(ONLINE_ADMIN_COOKIE)?.value)) {
    return json({ok:false,error:'Admin sessiyasi talab qilinadi.'},401);
  }
  const params=new URL(request.url).searchParams;
  const db=getSupabaseAdmin();
  try {
    if(params.get('mode')==='detail') {
      const userId=params.get('user');
      if(!validId(userId)) return json({ok:false,error:'Foydalanuvchi ID noto‘g‘ri'},400);
      const id=Number(userId);
      const [user,insights,activity,latest] = await Promise.all([
        db.from('users').select('id,first_name,username,balance,is_banned,level_xp,created_at,updated_at').eq('id',id).maybeSingle(),
        db.rpc('newpro_user_insights',{p_user_id:id}),
        activityForUser(db,id),
        db.from('user_presence_sessions').select('section,last_seen_at,active').eq('user_id',id).order('last_seen_at',{ascending:false}).limit(10)
      ]);
      for(const res of [user,insights,latest])if(res.error)throw res.error;
      if(!user.data)return json({ok:false,error:'Foydalanuvchi topilmadi'},404);
      const active=(latest.data||[]).find(x=>x.active&&Date.now()-Date.parse(x.last_seen_at)<65000);
      return json({ok:true,user:user.data,insights:insights.data||{},...activity,
        presence:{online:!!active,section:active?.section||null,lastSeenAt:latest.data?.[0]?.last_seen_at||null}});
    }
    const search=String(params.get('q')||'').replace(/[%_,()\\]/g,'').slice(0,50);
    const status=['all','online','offline'].includes(params.get('status'))?params.get('status'):'all';
    const page=Math.max(1,Math.min(100000,parseInt(params.get('page')||'1',10)||1));
    const limit=30;
    const [totals, users, count] = await Promise.all([
      db.rpc('newpro_presence_totals'),
      db.rpc('newpro_admin_user_page',{p_query:search,p_status:status,p_limit:limit,p_offset:(page-1)*limit}),
      db.from('users').select('id',{count:'exact',head:true}),
    ]);
    for(const res of [totals,users,count])if(res.error)throw res.error;
    return json({ok:true,overview:totals.data,users:users.data?.users||[],
      resultCount:Number(users.data?.total||0),totalUsers:Number(count.count||0),
      page,limit,query:search,status});
  } catch(error) {
    console.error('[onlines:dashboard]',error.code||String(error.message).slice(0,100));
    return json({ok:false,error:'Admin ma’lumotlarini yuklashda xatolik. Server loglarini tekshiring.'},500);
  }
}
