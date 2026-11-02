import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('featured giveaway selection is admin-only and exposed on public feed',()=>{
 const admin=read('app/admin/GiveawayAdmin.jsx');
 const api=read('app/api/browser-admin/route.js');
 const publicApi=read('app/api/giveaway/route.js');
 assert.match(admin,/giveaway_feature/);
 assert.match(admin,/Asosiy qilish/);
 assert.match(api,/assertAdmin\(request, body\)/);
 assert.match(api,/newpro_giveaway_set_featured/);
 assert.match(api,/isFeatured:featuredIds\.has/);
 assert.match(publicApi,/isFeatured:featuredIds\.has/);
});

test('giveaway UX is focused on featured and remaining events',()=>{
 const jsx=read('app/webapp/GiveawayHub.jsx');
 const css=read('app/webapp/GiveawayHub.module.css');
 assert.match(jsx,/>Asosiy<\/h2>/);
 assert.match(jsx,/>Qolganlar<\/h2>/);
 assert.match(jsx,/active\.slice\(1\)/);
 assert.match(jsx,/Number\(Boolean\(b\.isFeatured\)\)/);
 assert.match(jsx,/className=\{styles\.prizeRail\}/);
 assert.match(css,/@keyframes giftFloat/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(jsx,/TWO FAIR MODES|COMMUNITY REWARDS|window\.confirm/);
});

test('Stars confirmation is an in-app dialog, not a native browser modal',()=>{
 const src=read('app/webapp/GiveawayHub.jsx');
 assert.match(src,/role="dialog" aria-modal="true"/);
 assert.match(src,/setPending\(\{item,stars\}\)/);
 assert.match(src,/performJoin\(pending\.item,pending\.stars\)/);
 assert.match(src,/requestUuid\(\)/);
 assert.match(src,/retry\.current/);
 assert.doesNotMatch(src,/window\.confirm/);
});

test('leaderboard returns all participants in safe pages with per-user weight percentage',()=>{
 const ui=read('app/webapp/GiveawayHub.jsx');
 const api=read('app/api/giveaway/route.js');
 const schema=read('supabase/migrations/20261102_giveaway_featured_and_odds.sql');
 assert.match(ui,/Yutish ehtimollari/);
 assert.match(ui,/Yana qatnashchilarni ko‘rish/);
 assert.match(ui,/chanceText\(person\.chance\)/);
 assert.match(api,/action==='leaderboard'/);
 assert.match(api,/chance:totalWeight>0/);
 assert.match(api,/nextOffset/);
 assert.match(schema,/security invoker/);
 assert.match(schema,/revoke all on function public\.newpro_giveaway_leaderboard/);
});
