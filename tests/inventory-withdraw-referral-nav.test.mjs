import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getInventoryRows,getGiftActivity} from '../lib/inventory.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const gift={id:'gift1',type:'gift',title:'Bow Tie',sell_price:50};
const won={id:'won-1',gift_id:'gift1',case_id:'case1',sold_at:null};
const request={id:'req-1',history_id:'won-1',gift_id:'gift1',status:'pending'};

test('pending withdrawn copy leaves owned Inventory and enters pending activity',()=>{
 assert.equal(getInventoryRows([won],[gift],[],[]).length,1);
 assert.equal(getInventoryRows([won],[gift],[],[request]).length,0);
 const timeline=getGiftActivity([won],[gift],[request]);
 assert.equal(timeline.filter(x=>x.status==='pending').length,1);
 assert.equal(timeline[0].historyId,won.id);
 assert.equal(getInventoryRows([won],[gift],[],[{...request,status:'approved'}]).length,0);
 assert.equal(getInventoryRows([won],[gift],[],[{...request,status:'rejected'}]).length,1);
});
test('inventory removes redundant INVENTORY ribbon and confirms Yechish request',()=>{
 const view=read('app/webapp/WebAppClient.jsx');
 const slice=view.slice(view.indexOf('function InventoryView('),view.indexOf('function bonusTaskIcon('));
 assert.doesNotMatch(slice,/>INVENTORY</);
 assert.doesNotMatch(slice,/!requested \? 'INVENTORY'/);
 assert.match(slice,/Ishonchingiz komilmi\?/);
 assert.match(slice,/Ha, yechish/);
 assert.match(slice,/requested \? 'Pending' : 'Yechish'/);
 assert.match(slice,/onWithdraw\(dialog\.item\.id\)/);
 assert.match(slice,/onClick=\{onPending\}/);
 assert.match(slice,/Pending/);
});
test('real withdrawal API uses authenticated atomic server request',()=>{
 const route=read('app/api/withdraw/route.js');
 assert.match(route,/readTelegramRequest\(request\)/);
 assert.match(route,/request_gift_withdrawal_atomic/);
 assert.match(route,/p_history_id: historyId/);
 const admin=read('app/admin/AdminClient.jsx');
 assert.match(admin,/tab === 'withdrawals'/);
 assert.match(admin,/updateWithdrawal\(request\.id, 'approved'\)/);
 assert.match(admin,/updateWithdrawal\(request\.id, 'rejected'\)/);
});
test('Referral NEW badge stays visible permanently, including after a visit',()=>{
 const view=read('app/webapp/WebAppClient.jsx');
 assert.match(view,/showNew=\{item\.id === 'referral'\}/);
 assert.doesNotMatch(view,/markReferralSeen/);
 assert.doesNotMatch(view,/myst-referral-new-v1/);
 assert.doesNotMatch(view,/referralNew/);
 assert.match(view,/liquidNavStyles\.newBadge/);
 const nav=read('app/webapp/LiquidGlassNav.module.css');
 assert.match(nav,/\.newBadge\{/);
 assert.match(nav,/#ff4e5e/);
});
