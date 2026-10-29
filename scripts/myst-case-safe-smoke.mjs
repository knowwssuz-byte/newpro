// Production-build browser QA with intercepted Telegram and API endpoints.
// Does NOT access live user balances or call the real case-opening backend.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const output='artifacts/myst-smoke/case';
await mkdir(output,{recursive:true});
const gift={
 id:'authorized-prize',case_id:'case-test',title:'Mock Premium Gift',type:'gift',
 rarity:'epic',value:24,sell_price:18,floor_price:20,stock:15,
 chance:100,real_chance:100,is_active:true,image_url:'/gifts/telegram-collectible.svg',
};
const caseItem={
 id:'case-test',title:'Demo case',description:'Real case artwork preview',
 image_url:'/cases/starter.svg',price:0,is_active:true,sort_order:0,
};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const reports=[];
for(const width of [320,375,390,430,768,1024,1440]){
 const mobile=width<=430;
 const context=await browser.newContext({
   viewport:{width,height:mobile?(width===320?600:width===375?667:844):900},
   deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,
 });
 const telegramScript=`window.Telegram={WebApp:{initData:'mocked-session',initDataUnsafe:{user:{id:24680,first_name:'Test'}},ready(){},expand(){},MainButton:{hide(){}},BackButton:{hide(){}},HapticFeedback:{notificationOccurred(){},impactOccurred(){}},platform:'android',version:'8.0'}};`;
 await context.route('https://telegram.org/js/telegram-web-app.js',(route)=>route.fulfill({status:200,contentType:'application/javascript',body:telegramScript}));
 let opened=0,firstHistory=[];
 await context.route('**/api/**',async(route)=>{
  const url=new URL(route.request().url());
  let value={ok:true};
  if(url.pathname==='/api/bootstrap'){
   value={ok:true,user:{id:24680,balance:150,is_banned:false},telegramUser:{id:24680,first_name:'Test'},
     isAdmin:false,cases:[caseItem],gifts:[gift],inventoryGifts:[],history:firstHistory,
     withdrawals:[],upgradeRounds:[],featureSettings:{}};
  }else if(url.pathname==='/api/open-case'){
    opened++;
    if(width===375) await new Promise(r=>setTimeout(r,800));
    const history={id:'mock-opening-1',case_id:caseItem.id,gift_id:gift.id,user_id:24680,created_at:new Date().toISOString()};
    firstHistory=[history];
    value={ok:true,case:caseItem,gift:{...gift},history,price:0,balanceBefore:150,balanceAfter:150,balance:150,
      reelPool:[{...gift}],opening:{rewardType:'gift',rewardAmount:0,openedAt:history.created_at}};
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 const page=await context.newPage();
 const exceptions=[];page.on('pageerror',e=>exceptions.push(String(e)));
 await page.goto(base+'/webapp',{waitUntil:'domcontentloaded'});
 await page.getByRole('main',{name:'MYST tanishtiruv'}).waitFor({timeout:16000});
 await page.getByRole('button',{name:/Tanishtiruvni o‘tkazib yuborish/}).click();
 await page.getByRole('heading',{name:'Play. Win. Repeat.'}).waitFor({timeout:9000});
 await page.getByRole('button',{name:'Demo case case tafsilotlari'}).click();
 await page.getByRole('heading',{name:'Demo case'}).first().waitFor({timeout:6000});
 await page.locator('[aria-label="Case rasmi"] img[data-ready="true"]').waitFor({timeout:6000});
 await page.screenshot({path:`${output}/${width}-detail.png`,fullPage:false});
 const layout=await page.evaluate(()=>{
   const stage=document.querySelector('[aria-label="Case rasmi"]');
   const artwork=stage?.querySelector('img[class*="caseStageArt"]');
   const frame=stage?.getBoundingClientRect();
   const image=artwork?.getBoundingClientRect();
   const heading=document.querySelector('.case-page-top')?.getBoundingClientRect();
   return {
     scrollWidth:document.documentElement.scrollWidth,
     innerWidth:window.innerWidth,
     mainStage:frame?.height||0,
     headingTop:heading?.top||0,
     imageInside:Boolean(frame&&image&&image.top>=frame.top+2&&image.bottom<=frame.bottom-2),
     imageNaturalWidth:artwork?.naturalWidth||0,
   };
 });
 assert.ok(layout.scrollWidth<=layout.innerWidth+2,`Overflow at ${width}: ${JSON.stringify(layout)}`);
 assert.ok(layout.mainStage>=130,`Missing real case artwork stage on ${width}`);
 assert.ok(layout.headingTop>=55,`Case page inherited Home scroll position at ${width}: ${JSON.stringify(layout)}`);
 assert.ok(layout.imageInside && layout.imageNaturalWidth>0,`Artwork clipped or not loaded at ${width}: ${JSON.stringify(layout)}`);
 const btn=page.getByRole('button',{name:'OPEN',exact:true});
 await btn.waitFor({timeout:5000});
 // Double click during a single synchronous event loop: one request maximum.
 await btn.evaluate((element)=>{element.click();element.click()});
 await page.locator('[aria-label="Case prizes preview"][aria-busy="true"]').waitFor({timeout:5000});
 await page.locator('[role="dialog"][aria-labelledby="case-win-title"]').waitFor({timeout:12000});
 assert.equal(opened,1,`Duplicate transaction request at width=${width}`);
 const coordinates=await page.evaluate(()=>{
  const prize=document.querySelector('[data-winning="true"]');
  const windowEl=prize?.closest('[aria-label="Case prizes preview"]');
  if(!prize||!windowEl) return null;
  const win=prize.getBoundingClientRect(),frame=windowEl.getBoundingClientRect();
  return {centerError:Math.round(((win.left+win.width/2)-(frame.left+frame.width/2))*100)/100,
     gift:document.getElementById('case-win-title')?.textContent,viewportWidth:innerWidth,
     stage:document.querySelector('[aria-label="Case rasmi"]')?.getAttribute('data-phase')};
 });
 assert.ok(coordinates,`Missing winner and frame at width=${width}`);
 assert.ok(Math.abs(coordinates.centerError)<=1.5,`WINNER NOT CENTERED at ${width}: ${JSON.stringify(coordinates)}`);
 assert.equal(coordinates.gift,'Mock Premium Gift');
 await page.screenshot({path:`${output}/${width}-reward.png`,fullPage:false});
 await page.locator('[role="dialog"][aria-labelledby="case-win-title"]').getByRole('button',{name:'Inventar'}).click();
 assert.equal(opened,1,'Inventory must not trigger a second opening');
 await page.getByText('Inventory',{exact:true}).first().waitFor({timeout:5000});
 assert.deepEqual(exceptions,[],`Browser JS errors at width=${width}`);
 reports.push({width,...layout,...coordinates,opened,errorCount:exceptions.length});
 await context.close();
}
await browser.close();
await writeFile(`${output}/results.json`,JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports,null,2));
