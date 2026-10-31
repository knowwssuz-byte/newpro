// Startup failure coverage in isolated Chromium / Telegram mocks.
// All API requests are intercepted; no live Supabase state is ever mutated.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base=process.env.BASE_URL||'http://127.0.0.1:3000';
const engine=process.env.BROWSER_ENGINE==='webkit'?webkit:chromium;
const dir='artifacts/myst-smoke/recovery-'+engine.name();
await fs.mkdir(dir,{recursive:true});
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
for(let i=0;i<70;i++){
 try{if((await fetch(base+'/webapp')).ok)break;}catch{}
 if(i===69)throw Error('WebApp server unavailable');
 await sleep(350);
}
const browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox']:[]});
const run=[];
const data={
 ok:true,showWelcomeTour:true,user:{id:24680,balance:150,is_banned:false},
 telegramUser:{id:24680,first_name:'Test'},isAdmin:false,
 cases:[],gifts:[],inventoryGifts:[],history:[],withdrawals:[],upgradeRounds:[],featureSettings:{},
};
const scenarios=[
 {name:'telegram-ui-methods-throw',throws:true,corruptCache:true},
 {name:'telegram-script-delayed',delayScript:5000},
 {name:'bootstrap-503-retry',failOnce:true},
 {name:'bootstrap-401',status401:true,corruptCache:true},
 {name:'telegram-no-session',noSession:true},
];
for(const scenario of scenarios) {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 if(scenario.corruptCache) {
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('gift_myst_bootstrap_v3_24680',JSON.stringify({
        savedAt:Date.now(),data:{
          user:{id:24680,balance:9999},telegramUser:{id:24680,first_name:'Stale'},
          cases:{bad:'shape'},gifts:'invalid',history:'invalid',inventoryGifts:{bad:true},
        },
      }));
    }catch {}
  });
 }
 const source=`window.Telegram={WebApp:{
  initData:${scenario.noSession ? "''" : "'verified-mock-session'"},
  initDataUnsafe:{user:{id:24680,first_name:'Test'}},
  ready(){${scenario.throws ? "throw Error('host-ready-failed')" : ""}},
  expand(){${scenario.throws ? "throw Error('host-expand-failed')" : ""}},
  MainButton:{hide(){${scenario.throws ? "throw Error('host-hide-failed')" : ""}}},
  BackButton:{hide(){}},
  HapticFeedback:{notificationOccurred(){},impactOccurred(){}},
  platform:'android',version:'8.0'
 }};`;
 await context.route('https://telegram.org/js/telegram-web-app.js',async(route)=>{
  if(scenario.delayScript)await sleep(scenario.delayScript);
  await route.fulfill({status:200,contentType:'application/javascript',body:source});
 });
 let count=0,essentialCount=0;
 await context.route('**/api/**',async(route)=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/bootstrap'){
   count++;
   const phase=route.request().postDataJSON()?.phase||'full';
   if(phase!=='extras')essentialCount++;
   if(scenario.status401)
    return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({ok:false,error:'Session expired'})});
   if(scenario.failOnce&&phase!=='extras'&&essentialCount===1)
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Server temporarily unavailable'})});
   await sleep(110);
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
 });
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',(err)=>errors.push(err.message));
 await page.goto(base+'/webapp',{waitUntil:'domcontentloaded',timeout:25000});
 if(scenario.noSession||scenario.status401){
  await page.getByRole('button',{name:'Qayta urinish'}).waitFor({timeout:17000});
  assert.equal(await page.getByRole('main',{name:'MYST tanishtiruv'}).count(),0,
    'Session error must not reveal any stale cached profile');
 }else if(scenario.failOnce){
  // Retry only idempotent initial bootstrap automatically after a transient 503.
  // No full-screen manual Retry prompt should interrupt a new player.
  await page.getByRole('main',{name:'MYST tanishtiruv'}).waitFor({timeout:16000});
  assert.equal(essentialCount,2,'Exactly one safe retry for the first boot');
  assert.equal(await page.getByRole('button',{name:'Qayta urinish'}).count(),0);
 }else{
  if(scenario.delayScript){
   await page.getByRole('status',{name:/MYST yuklanmoqda/}).waitFor({timeout:3000});
  }
  await page.getByRole('main',{name:'MYST tanishtiruv'}).waitFor({timeout:18000});
  assert.equal(await page.locator('main[aria-label="MYST yuklashda muammo"]').count(),0,'Loader must be replaced after successful boot');
  await page.getByRole('button',{name:/Tanishtiruvni o‘tkazib yuborish/}).click();
  await page.getByRole('heading',{name:'Play. Win. Repeat.'}).waitFor({timeout:9000});
 }
 assert.deepEqual(errors,[],`Unhandled startup exception in ${scenario.name}`);
 await page.screenshot({path:`${dir}/${scenario.name}.png`,fullPage:false});
 run.push({case:scenario.name,requests:count,pageErrors:errors.length});
 await context.close();
}
await browser.close();
await fs.writeFile(`${dir}/results.json`,JSON.stringify(run,null,2));
console.log(JSON.stringify(run,null,2));
