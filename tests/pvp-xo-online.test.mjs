import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('PvP X/O route authenticates user and has server-only wallet operations',()=>{
 const route=read('app/api/pvp-xo/route.js');
 assert.match(route,/readTelegramRequest\(request\)/);
 assert.match(route,/ensureUser\(auth\.telegramUser\)/);
 assert.match(route,/\.rpc\('pvp_xo_command'/);
 assert.match(route,/STAKES=new Set\(\[5,10,25,50\]\)/);
 assert.match(route,/your_mark:String\(match\.x_id\)===userId\?'X'/);
 assert.doesNotMatch(route,/users\.update/);
});
test('PvP has bot and online match and authoritative board moves',()=>{
 const s=read('app/webapp/PvpHub.jsx');
 assert.match(s,/STAKES=\[5,10,25,50\]/);
 assert.match(s,/setMode\('bot'\)/);
 assert.match(s,/setMode\('online'\)/);
 assert.match(s,/action:'state'/);
 assert.match(s,/act\('move',\{matchId:match\.id,cell:i\}\)/);
 assert.match(s,/const yourMark=match\?\.your_mark/);
 assert.match(s,/onBalanceRef\.current/);
 assert.match(s,/role="dialog" aria-modal="true"/);
 assert.match(s,/localStorage\.setItem\(SAVE_KEY,data\.match\.id\)/);
});
test('PvP navigation wires API and balance without local-money modification',()=>{
 const app=read('app/webapp/WebAppClient.jsx');
 assert.match(app,/tab === 'pvp' \? <PvpHub/);
 assert.match(app,/balance=\{profile\?\.balance\}/);
 assert.match(app,/onBalanceChange=\{\(nextBalance\)=>setProfile/);
});
