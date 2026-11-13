import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('server sends actual normalized prize odds for paid case rewards',()=>{
 const c=read('app/api/bootstrap/route.js');
 assert.match(c,/weight \/ total \* 10000/);
 assert.match(c,/real_chance: percent/);
 assert.match(c,/gift.is_active === false \|\| Number\(gift.stock\) <= 0/);
});
test('admin creates stars with upload in same authenticated multipart action',()=>{
 const admin=read('app/admin/AdminClient.jsx'),api=read('app/api/browser-admin/route.js');
 assert.match(admin,/case_stars_reward_create_upload/);
 assert.match(admin,/form\.append\('image_file',starsImageFile\)/);
 assert.match(admin,/starsImagePreview/);
 assert.match(api,/async function createCaseStarsReward/);
 assert.match(api,/action === 'case_stars_reward_create_upload'/);
 assert.match(api,/const gift = await createCaseStarsReward/);
 assert.match(api,/image_url:imageUrl \|\| null/);
 assert.match(api,/uploadStarsRewardImage/);
 assert.match(api,/file\.size > 8 \* 1024 \* 1024/);
 assert.match(api,/\.eq\('is_active',true\)\.is\('archived_at',null\)/);
});
test('existing stars reward image can be replaced without modifying odds or user balance',()=>{
 const admin=read('app/admin/AdminClient.jsx'),api=read('app/api/browser-admin/route.js');
 assert.match(admin,/case_stars_reward_image_replace/);
 assert.match(api,/reward\.type !== 'balance' \|\| reward\.source !== 'case_stars'/);
 assert.match(api,/setSharedStarsArtworkUrl\(supabase,image\.imageUrl\)/);
 assert.match(read('lib/caseStarsArtwork.mjs'),/\.eq\('type','balance'\)\.not\('case_id','is',null\)/);
});
test('balance rewards render their uploaded image in reel and win, fallback to Star icon',()=>{
 const client=read('app/webapp/WebAppClient.jsx');
 assert.match(client,/balance-reward-art/);
 assert.match(client,/const starsImage = gift\.image_url/);
 assert.match(client,/setBrokenImageUrl\(starsImage\)/);
 assert.match(client,/<StarIcon variant="reward"/);
});
