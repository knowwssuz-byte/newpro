import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortCasePrizesHighToLow,casePrizeValue} from '../lib/casePrizeOrder.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('expensive gifts precede cheaper gifts, including balance-value Stars',()=>{
 const input=[{id:'c',type:'balance',value:'50'}, {id:'a',type:'gift',floor_price:350},
 {id:'d',type:'balance',value:'3'}, {id:'b',type:'gift',floor_price:140}];
 assert.deepEqual(sortCasePrizesHighToLow(input).map(g=>g.id),['a','b','c','d']);
 assert.deepEqual(input.map(g=>g.id),['c','a','d','b']);
 assert.equal(casePrizeValue({type:'balance',value:'99',floor_price:0}),99);
});
test('bottom collection sorted; reel and lottery remain untouched',()=>{
 const detail=read('app/webapp/CaseDetailExperience.jsx');
 assert.match(detail,/orderedPrizes = sortCasePrizesHighToLow\(previewGifts\)/);
 assert.match(detail,/orderedPrizes\.map\(\(gift, index\)/);
 assert.match(detail,/buildIdlePreviewStrip\(previewGifts\)/);
});
test('one shared Stars art is persisted and applies to all balance case gift rows',()=>{
 const db=read('lib/caseStarsArtwork.mjs');
 const api=read('app/api/browser-admin/route.js');
 const admin=read('app/admin/AdminClient.jsx');
 assert.match(db,/case_stars_reward_artwork/);
 assert.match(db,/\.eq\('type','balance'\)\.not\('case_id','is',null\)/);
 assert.match(api,/setSharedStarsArtworkUrl\(supabase,uploadedImage\)/);
 assert.match(api,/setSharedStarsArtworkUrl\(supabase,image\.imageUrl\)/);
 assert.match(api,/getSharedStarsArtworkUrl\(supabase\)/);
 assert.match(admin,/sharedStarsArtworkUrl/);
 assert.match(admin,/Barchasining rasmini almashtirish/);
});
