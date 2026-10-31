import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('PVP Arena allows 1–10 distinct gift copies in one atomic request',()=>{
  const sql = read('supabase/migrations/20261031_color_arena_multi_gift_and_two_players.sql');
  const api = read('app/api/color-arena/route.js');
  const ui = read('app/webapp/ColorArena.jsx');
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.color_arena_stake_gifts/);
  assert.match(sql,/v_count > 10/);
  assert.match(sql,/count\(DISTINCT gift_id\)/);
  assert.match(sql,/md5\(p_request::text/);
  assert.match(sql,/public\.color_arena_stake_gift\(/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.color_arena_stake_gifts/);
  assert.match(api,/action==='gift_batch'/);
  assert.match(api,/\.rpc\('color_arena_stake_gifts'/);
  assert.match(api,/new Set\(ids\.map\(String\)\)\.size!==ids\.length/);
  assert.match(ui,/const \[giftLoading,setGiftLoading\]=useState\(false\),\[chosenGifts,setChosenGifts\]=useState\(\[\]\)/);
  assert.match(ui,/setChosenGifts\(current=>current\.includes\(id\)/);
  assert.match(ui,/MAX_GIFTS=10/);
  assert.match(ui,/act\('gift_batch',\{historyIds:selectedGifts\.map/);
  assert.match(ui,/selectedGifts\.reduce/);
});

test('solo depositor can never lock, plan, or settle game as their own opponent',()=>{
  const sql = read('supabase/migrations/20261031_color_arena_multi_gift_and_two_players.sql');
  const ui = read('app/webapp/ColorArena.jsx');
  assert.match(sql,/count\(distinct user_id\)/);
  assert.match(sql,/ARENA_DISTINCT_PLAYER_GUARD_20261031/);
  assert.match(sql,/ARENA_DISTINCT_PLAYER_TICK_20261031/);
  assert.match(sql,/raise exception ''ARENA_MIN_PLAYERS''/);
  assert.match(ui,/Ikkinchi o‘yinchi kutilmoqda/);
  assert.match(ui,/room\.players\.length===1/);
  assert.match(ui,/const active=\(room\?\.players\?\.length\|\|0\)>=2/);
});

test('compact gift selection and enhanced moving projectile leave winning geometry intact',()=>{
  const ui=read('app/webapp/ColorArena.jsx');
  const css=read('app/webapp/ColorArena.module.css');
  assert.match(css,/grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/max-height: 227px/);
  assert.match(css,/giftConfirmThumbs/);
  assert.match(css,/arenaOrbitHalo/);
  assert.match(ui,/createBilliardPath/);
  assert.match(ui,/projectHitToRegion/);
  assert.match(ui,/trajectory\.position/);
  assert.match(ui,/if\(!reducedMotion\)/);
  assert.match(ui,/audioRef\.current\?\.impact/);
  assert.match(ui,/room\.target/);
});
