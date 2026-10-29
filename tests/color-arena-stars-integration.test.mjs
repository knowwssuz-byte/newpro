import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');

test('Color Arena shows only the canonical shared NewPro Stars balance',()=>{
 const page=read('app/webapp/ColorArena.jsx');
 const pvp=read('app/webapp/PvpHub.jsx');
 assert.match(page,/const STARS='★'/);
 assert.doesNotMatch(page,/VIRTUAL TISH|TISH —|setTish|className=\{styles\.wallet\}|PVP \/ OMMAVIY MAYDON/);
 assert.doesNotMatch(page,/className=\{styles\.roundTop\}|className=\{styles\.status\}/);
 assert.match(page,/balanceCallback\.current\?\.\(Number\(data\.balance\)\)/);
 assert.match(page,/Number\(stake\)>Number\(balance\|\|0\)/);
 assert.match(page,/Number\(raise\)>Number\(balance\|\|0\)/);
 assert.match(pvp,/onBalanceChange=\{onBalanceChange\} onToast=\{onToast\}/);
});
test('API uses existing users.balance, not the promotional virtual TISH wallet',()=>{
 const route=read('app/api/color-arena/route.js');
 assert.doesNotMatch(route,/color_arena_wallet_init/);
 assert.match(route,/\.from\('users'\)\.select\('balance'\)/);
 assert.match(route,/ARENA_NO_STARS/);
 assert.match(route,/\.eq\('currency','stars'\)/);
});
test('migration contains durable separate Stars ledger and atomic balance changes',()=>{
 const sql=read('supabase/migrations/20261029_color_arena_stars_balance.sql');
 assert.match(sql,/create table if not exists public\.color_arena_stars_ledger/);
 assert.match(sql,/unique\(user_id,request_id\)/);
 assert.match(sql,/on public\.color_arena_stars_ledger\(round_id\) where kind='win'/);
 assert.match(sql,/update public\.users set balance=balance-p_stake/);
 assert.match(sql,/update public\.users set balance=balance-p_amount/);
 assert.match(sql,/update public\.users set balance=balance\+v\.total_stake/);
 assert.match(sql,/update public\.users set balance=balance\+v_stake/);
 assert.match(sql,/ARENA_STARS_MIGRATION_ACTIVE_ROUND/);
 assert.match(sql,/currency\)\s*values\(/);
});
