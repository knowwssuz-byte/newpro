import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Stars reward saves as balance type with stock, actual weight and Stars amount',()=>{
 const api=read('app/api/browser-admin/route.js');
 assert.match(api,/action === 'case_stars_reward_create'/);
 assert.match(api,/type:'balance'/);
 assert.match(api,/value:String\(amount\)/);
 assert.match(api,/Number\.isSafeInteger\(amount\)/);
 assert.match(api,/real_chance:realChance/);
 assert.match(api,/\.eq\('is_active',true\)\.is\('archived_at',null\)/);
});
test('admin chooses Stars or Telegram Gift and configures percent and reward',()=>{
 const admin=read('app/admin/AdminClient.jsx');
 assert.match(admin,/reward_kind === 'stars'/);
 assert.match(admin,/case_stars_reward_create/);
 assert.match(admin,/stars_amount/);
 assert.match(admin,/Haqiqiy tanlash vazni/);
 assert.match(admin,/Stars qo‘shish/);
});
test('Stars reward is shown as Star icon and credited balance win',()=>{
 const web=read('app/webapp/WebAppClient.jsx');
 assert.match(web,/Balansga \+.*Stars qo‘shildi/);
 assert.match(web,/<StarIcon variant="reward"/);
 const open=read('app/api/open-case/route.js');
 assert.match(open,/rpc\('open_case_atomic'/);
});
