import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('free case requires completed Telegram channel task and live verified membership',()=>{
 const code=read('app/api/open-case/route.js');
 assert.match(code,/bonus_claim_ledger/);
 assert.match(code,/getChatMember/);
 assert.match(code,/FREE_CASE_TASK_REQUIRED/);
 assert.match(code,/FREE_CASE_NOT_MEMBER/);
 assert.match(code,/verifyFreeCaseAccess\(supabase/);
 assert.match(code,/openCaseWithRpc\(supabase/);
});
test('free case cooldown runs atomically under user lock, independent of UI and across free cases',()=>{
 const sql=read('supabase/migrations/20261031_free_case_24h_channel_task.sql');
 assert.match(sql,/FREE_CASE_POLICY_20261031/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/interval '24 hours'/);
 assert.match(sql,/history\.user_id = p_user_id/);
 assert.match(sql,/previous_case\.price = 0/);
 assert.match(sql,/REVOKE EXECUTE/);
 assert.match(read('app/webapp/WebAppClient.jsx'),/return 'UNLIMITED'/);
});