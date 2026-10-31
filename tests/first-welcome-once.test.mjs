import test from 'node:test';
import assert from 'node:assert/strict';
import { claimFirstWelcome } from '../lib/firstWelcome.mjs';

function fakeSupabase() {
  let stamp = null;
  let updateCount = 0;
  const db = {
    from(table) {
      assert.equal(table, 'users');
      return {
        update(value) {
          assert.ok(!Number.isNaN(Date.parse(value.first_welcome_shown_at)));
          return {
            eq(column, id) {
              assert.equal(column, 'id');
              assert.equal(id, 12345);
              return {
                is(field, empty) {
                  assert.equal(field, 'first_welcome_shown_at');
                  assert.equal(empty, null);
                  return {
                    async select(fieldName) {
                      assert.equal(fieldName, 'id');
                      updateCount++;
                      if (stamp != null) return {data:[],error:null};
                      stamp = value.first_welcome_shown_at;
                      return {data:[{id:12345}],error:null};
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    stats() { return {stamp, updateCount}; },
  };
  return db;
}

test('first Telegram entry is claimed once; subsequent entries and other devices do not reopen it',async()=>{
  const supabase = fakeSupabase();
  const newUser = {id:12345,first_welcome_shown_at:null};
  assert.equal(await claimFirstWelcome(supabase,newUser),true);
  assert.equal(await claimFirstWelcome(supabase,newUser),false);
  assert.equal(await claimFirstWelcome(supabase,{id:12345,first_welcome_shown_at:supabase.stats().stamp}),false);
  assert.equal(supabase.stats().updateCount,2);
});

test('legacy accounts and unknown identifiers never claim welcome',async()=>{
  const supabase = fakeSupabase();
  assert.equal(await claimFirstWelcome(supabase,{id:12345,first_welcome_shown_at:'2026-10-20T10:00:00Z'}),false);
  assert.equal(await claimFirstWelcome(supabase,{id:'invalid',first_welcome_shown_at:null}),false);
  assert.equal(supabase.stats().updateCount,0);
});

test('database errors fail closed rather than showing Welcome repeatedly',async()=>{
  const db={from:()=>({update:()=>({eq:()=>({is:()=>({
    select:async()=>({data:null,error:new Error('database unavailable')})
  })})})})};
  await assert.rejects(claimFirstWelcome(db,{id:12345,first_welcome_shown_at:null}),/database unavailable/);
});
