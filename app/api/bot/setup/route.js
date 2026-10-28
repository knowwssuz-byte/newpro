import crypto from 'node:crypto';
import {setupTelegramBot} from '@/lib/telegramBot';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function sameToken(a,b) {
 if(!a||!b)return false;
 return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),
                               crypto.createHash('sha256').update(b).digest());
}
// Never take setup secrets in a URL, where proxies, browser history and logs capture them.
export async function GET(){return json({ok:false,error:'Setup POST orqali bajariladi'},405)}
export async function POST(request){
 const expected=String(process.env.BOT_SETUP_SECRET||'').trim();
 if(!expected)return json({ok:false,error:'Bot setup secret sozlanmagan'},503);
 const auth=String(request.headers.get('authorization')||'');
 const provided=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
 if(!sameToken(provided,expected))return json({ok:false,error:'Ruxsat yo‘q'},401);
 try{const result=await setupTelegramBot();return json({ok:true,message:'Bot konfiguratsiyasi yangilandi',...result})}
 catch(err){console.error('[bot:setup]',String(err?.message||'setup failed').slice(0,140));return json({ok:false,error:'Bot sozlanmadi'},500)}
}
