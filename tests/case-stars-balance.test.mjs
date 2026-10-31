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

test('saved migration makes actual real_chance the winner weight',()=>{
  const migration=read('supabase/migrations/20261028_case_stars_actual_odds.sql');
  assert.match(migration,/SUM\(g\.real_chance\) OVER/);
  assert.match(migration,/COALESCE\(SUM\(real_chance\), 0\)/);
  assert.match(migration,/REVOKE EXECUTE/);
  assert.match(migration,/TO service_role/);
});
test('admin predicts actual normalized chance for a new reward',()=>{
 const admin=read('app/admin/AdminClient.jsx');
 assert.match(admin,/starsProjectedChance/);
 assert.match(admin,/weight \/ \(existing \+ weight\)/);
});

// Real 0% must remain zero through every admin and legacy entry point.
test('0% is never silently replaced with the display chance in old admin flows',()=>{
 const browser=read('app/admin/AdminClient.jsx');
 const mobile=read('app/webapp/WebAppClient.jsx');
 const legacy=read('app/api/admin/gift/route.js');
 const api=read('app/api/browser-admin/route.js');
 assert.match(browser,/current\.real_chance \?\? current\.chance/);
 assert.match(mobile,/giftForm\.real_chance \?\? giftForm\.chance/);
 assert.match(legacy,/numericRealChance = realChanceValue\(real_chance, numericChance\)/);
 assert.doesNotMatch(legacy,/numericRealChance = numericChance/);
 assert.doesNotMatch(legacy,/updates\.real_chance = nextChance/);
 assert.match(api,/const realChanceValue = Number\(data\.real_chance \?\?/);
 assert.match(api,/changes\.real_chance = actual/);
 assert.match(browser,/0% — yutib chiqmaydi/);
});
test('server selection excludes real chance zero and does not fall back to insecure draw',()=>{
 const open=read('app/api/open-case/route.js');
 const migration=read('supabase/migrations/20261028_case_stars_actual_odds.sql');
 assert.doesNotMatch(open,/openCaseFallback|decrementGiftStock|Math\\.random/);
 assert.match(open,/openCaseWithRpc\(supabase,/);
 assert.doesNotMatch(open,/return Response\.json\(await openCaseFallback/);
 assert.match(migration,/AND g\.real_chance > 0/);
});
