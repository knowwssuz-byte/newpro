import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Expired one-player public rounds atomically return Stars and unlock escrowed gifts',()=>{
 const sql=read('supabase/migrations/20261029_color_arena_single_player_auto_refund.sql');
 assert.match(sql,/if v_count < 2 then/);
 assert.match(sql,/v_stars:=v_bet\.stake-v_gift_value/);
 assert.match(sql,/update public\.users set balance=balance\+v_stars/);
 assert.match(sql,/color_arena_gift_stakes set status='refunded'/);
 assert.match(sql,/delete from public\.color_arena_bets where round_id=v\.round_id/);
 assert.match(sql,/update public\.color_arena_rooms set status='WAITING'/);
 assert.match(sql,/round_id=gen_random_uuid\(\)/);
 assert.match(sql,/return 'WAITING'/);
 assert.doesNotMatch(sql,/raise exception 'ARENA_MIN_PLAYERS'/);
});

test('Gift picker exposes owned Telegram collectible media and excludes active withdrawals only',()=>{
 const api=read('app/api/color-arena/route.js');
 assert.match(api,/image_url,animation_url,library_gift_id/);
 assert.match(api,/from\('gift_library'\)/);
 assert.match(api,/lib\?\.png_url/);
 assert.match(api,/lib\?\.webp_url/);
 assert.match(api,/\.in\('status',\['pending','approved'\]\)/);
 assert.match(api,/return \{historyId:r\.id,title:gift\.title/);
});

test('Real collectible artwork decodes Telegram TGS rather than showing an emoji',()=>{
 const art=read('app/webapp/ArenaGiftArtwork.jsx');
 const ui=read('app/webapp/ColorArena.jsx');
 const css=read('app/webapp/ColorArena.module.css');
 assert.match(art,/cachedAnimation\(animationUrl\)/);
 assert.match(art,/import\('lottie-web'\)/);
 assert.match(art,/\/api\/gift-animation\?url=/);
 assert.match(art,/instance\.goToAndStop\(0,true\)/);
 assert.match(art,/instance\.loop=true;instance\.play\(\)/);
 assert.match(art,/onLoad=\{\(\)=>setLoaded\(true\)\}/);
 assert.match(ui,/<ArenaGiftArtwork gift=\{g\} selected=/);
 assert.match(ui,/className=\{styles\.giftChoice\}/);
 assert.match(css,/\.giftGallery/);
 assert.match(css,/\.giftChoice\[aria-pressed="true"\]/);
 assert.doesNotMatch(ui,/🎁/);
});

test('Gift stake requires separate explicit confirmation and winner ownership is server-side',()=>{
 const ui=read('app/webapp/ColorArena.jsx');
 const escrow=read('supabase/migrations/20261029_color_arena_gift_escrow_fee.sql');
 assert.match(ui,/aria-label="Gift stavkasini tasdiqlash"/);
 assert.match(ui,/createPortal/);
 assert.match(ui,/act\('gift_batch',\{historyIds:selectedGifts\.map\(g=>g\.historyId\)\}\)/);
 assert.match(ui,/setConfirmGift\(false\);void act\('gift_batch'/);
 assert.match(escrow,/update public\.open_history h set user_id=v_winner/);
 assert.match(escrow,/status='settled'/);
 assert.match(escrow,/unique\(owner_id,request_id\)/);
});
