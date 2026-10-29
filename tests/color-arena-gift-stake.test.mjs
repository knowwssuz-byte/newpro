import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('owned gifts are locked on stake, valued by server, and transferred atomically',()=>{
 const sql=read('supabase/migrations/20261029_color_arena_gift_escrow_fee.sql');
 assert.match(sql,/create table if not exists public\.color_arena_gift_stakes/);
 assert.match(sql,/unique\(owner_id,request_id\)/);
 assert.match(sql,/status='locked'/);
 assert.match(sql,/p_history uuid,p_request uuid/);
 assert.match(sql,/where id=p_history and user_id=p_user for update/);
 assert.match(sql,/where history_id=p_history\)/);
 assert.match(sql,/update public\.open_history h set user_id=v_winner/);
 assert.match(sql,/update public\.color_arena_gift_stakes set status='settled'/);
 assert.match(sql,/update public\.color_arena_gift_stakes set status='refunded'/);
 assert.match(sql,/arena_guard_owned_gift/);
 assert.match(sql,/arena_guard_gift_withdraw/);
});
test('fee is configurable, bounded and visible, and never mints gift value as Stars',()=>{
 const sql=read('supabase/migrations/20261029_color_arena_gift_escrow_fee.sql');
 const ui=read('app/webapp/ColorArena.jsx');
 const api=read('app/api/color-arena/route.js');
 assert.match(sql,/fee_bps integer not null default 500 check\(fee_bps between 0 and 1000\)/);
 assert.match(sql,/v_stars_pot:=v\.total_stake-v_gift_value/);
 assert.match(sql,/v_platform_fee:=floor\(v_stars_pot\*v\.fee_bps\/10000\.0\)/);
 assert.match(sql,/gross_stars=fee_stars\+net_stars/);
 assert.match(ui,/Platforma ulushi:/);
 assert.match(ui,/room\.prizeStars/);
 assert.match(api,/prizeStars:starsPot-feeStars/);
 assert.match(api,/action==='gift'/);
 assert.match(api,/\.rpc\('color_arena_stake_gift'/);
});
test('returning to Inventory replays GIF/WebP/TGS, never flashes generic icon',()=>{
 const app=read('app/webapp/WebAppClient.jsx');
 assert.match(app,/inventoryReplay/);
 assert.match(app,/replayToken=\{replayToken\}/);
 assert.match(app,/img\.removeAttribute\('src'\)/);
 assert.match(app,/animationReady/);
 assert.doesNotMatch(app,/<span className="gift-pending-poster"><AppIcon name="gift"/);
 assert.doesNotMatch(app,/<span className="tgs-pending-fallback"><AppIcon name="gift"/);
});
test('escrowed gift is hidden in Inventory and refreshes after staking',()=>{
 const app=read('app/webapp/WebAppClient.jsx');
 const boot=read('app/api/bootstrap/route.js');
 assert.match(boot,/escrowedGiftIds/);
 assert.match(app,/myst:inventory-change/);
 assert.match(app,/escrowedGiftIds\.includes\(r\.item\.id\)/);
});
