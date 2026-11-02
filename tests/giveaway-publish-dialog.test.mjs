import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {giveawayPublishState} from '../lib/giveawayPublish.mjs';

const now=Date.parse('2026-11-02T12:00:00.000Z');
const draft=(overrides={})=>({
  status:'draft',mode:'equal',entry_price:0,
  ends_at:'2026-11-11T17:55:00.000Z',...overrides
});
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('admin may publish free, paid and Stars-weighted drafts without feature flags',()=>{
  assert.equal(giveawayPublishState(draft(),{now}),'ready');
  assert.equal(giveawayPublishState(draft({entry_price:1}),{now}),'ready');
  assert.equal(giveawayPublishState(draft({mode:'weighted',entry_price:1}),{now}),'ready');
  assert.equal(giveawayPublishState(draft({mode:'weighted',entry_price:100}),{now}),'ready');
});

test('publishing still respects completed state and expired dates',()=>{
  assert.equal(giveawayPublishState(draft({status:'live'}),{now}),'not_draft');
  assert.equal(giveawayPublishState(null,{now}),'not_draft');
  assert.equal(giveawayPublishState(draft({ends_at:'2026-11-01T12:00:00Z'}),{now}),'expired');
  assert.equal(giveawayPublishState(draft({ends_at:'bad-date'}),{now}),'expired');
});

test('admin publish confirmation preserves configured entry price and mode',()=>{
  const ui=read('app/admin/GiveawayAdmin.jsx');
  const api=read('app/api/browser-admin/route.js');
  assert.match(ui,/setPublishTarget\(g\)/);
  assert.match(ui,/role="dialog" aria-modal="true"/);
  assert.match(ui,/call\('giveaway_publish',\{id:target.id\}\)/);
  assert.doesNotMatch(ui,/paidEnabled|inventoryConfirmed|giveaway_publish_free|paid_blocked/);
  assert.doesNotMatch(api,/GIVEAWAY_PAID_ENABLED|inventoryConfirmed|giveaway_publish_free/);
  assert.match(api,/\.eq\('status','draft'\)/);
  assert.match(api,/update\(\{\s*status:'live',updated_at:now.toISOString\(\)\s*\}\)/);
});

test('user-side joining is available in both free and paid modes and remains atomic',()=>{
  const frontend=read('app/webapp/GiveawayHub.jsx');
  const endpoint=read('app/api/giveaway/route.js');
  assert.doesNotMatch(frontend,/paidEnabled|!permitted|Pullik giveaway qatnashuvi/);
  assert.doesNotMatch(endpoint,/GIVEAWAY_PAID_ENABLED/);
  assert.match(frontend,/stars>0&&!window.confirm/);
  assert.match(endpoint,/newpro_giveaway_join/);
  assert.match(endpoint,/!Number.isSafeInteger\(stars\)/);
});
