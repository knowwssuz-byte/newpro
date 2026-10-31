import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('free case accepts legacy completed task records as well as modern ledger claims',()=>{
  const route=read('app/api/open-case/route.js');
  const sql=read('supabase/migrations/20261031_free_case_legacy_completed_task.sql');
  assert.match(route,/bonus_claim_ledger/);
  assert.match(route,/bonus_progress_/);
  assert.match(route,/bonus_claim_/);
  assert.match(route,/row\.value\?\.status === 'completed'/);
  assert.match(route,/const completedTasks = tasks\.filter\(task => completed\.has\(task\.id\)\)/);
  assert.match(sql,/FREE_CASE_LEGACY_TASK_COMPAT_20261031/);
  assert.match(sql,/progress\.value->>'status' = 'completed'/);
  assert.match(sql,/public\.bonus_claim_ledger/);
  assert.match(sql,/public\.open_case_atomic/);
});
test('legacy fix preserves membership verification, rolling cooldown and service-role-only RPC',()=>{
  const route=read('app/api/open-case/route.js');
  const sql=read('supabase/migrations/20261031_free_case_legacy_completed_task.sql');
  assert.match(route,/telegramApi\('getChatMember'/);
  assert.match(route,/FREE_CASE_NOT_MEMBER/);
  assert.match(route,/openCaseWithRpc\(supabase/);
  assert.match(sql,/FREE_CASE_COOLDOWN_24H/);
  assert.match(sql,/REVOKE EXECUTE ON FUNCTION/);
  assert.doesNotMatch(sql,/UPDATE public\.users SET balance/);
});