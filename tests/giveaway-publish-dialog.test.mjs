import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {giveawayNeedsPaidApproval,giveawayPublishState} from '../lib/giveawayPublish.mjs';

const now=Date.parse('2026-11-02T12:00:00.000Z');
const draft=(overrides={})=>({
  status:'draft',mode:'equal',entry_price:0,
  ends_at:'2026-11-11T17:55:00.000Z',...overrides
});
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('free and permitted paid drafts may be announced',()=>{
  assert.equal(giveawayPublishState(draft(),{now}),'ready');
  assert.equal(giveawayPublishState(draft({entry_price:1}),{now,paidEnabled:true}),'ready');
  assert.equal(giveawayPublishState(draft({mode:'weighted',entry_price:1}),{now,paidEnabled:true}),'ready');
});

test('paid or weighted drafts stay blocked without approval',()=>{
  assert.equal(giveawayNeedsPaidApproval(draft({entry_price:1})),true);
  assert.equal(giveawayNeedsPaidApproval(draft({mode:'weighted'})),true);
  assert.equal(giveawayPublishState(draft({entry_price:1}),{now}),'paid_blocked');
  assert.equal(giveawayPublishState(draft({mode:'weighted'}),{now}),'paid_blocked');
});

test('expired or non-draft giveaways are never publishable',()=>{
  assert.equal(giveawayPublishState(draft({status:'live'}),{now}),'not_draft');
  assert.equal(giveawayPublishState(null,{now}),'not_draft');
  assert.equal(giveawayPublishState(draft({ends_at:'2026-11-01T12:00:00Z'}),{now}),'expired');
  assert.equal(giveawayPublishState(draft({ends_at:'bad-date'}),{now}),'expired');
});

test('admin publish opens a custom dialog, and server guards explicit free conversion',()=>{
  const frontend=read('app/admin/GiveawayAdmin.jsx');
  const backend=read('app/api/browser-admin/route.js');
  assert.match(frontend,/setPublishTarget\(g\)/);
  assert.match(frontend,/role="dialog" aria-modal="true"/);
  assert.match(frontend,/giveaway_publish_free/);
  assert.doesNotMatch(frontend,/disabled=\{busy\|\|\(\(g.entry_price/);
  assert.match(backend,/giveaway_publish_free/);
  assert.match(backend,/\.eq\('status','draft'\)/);
  assert.match(backend,/giveaway_entries/);
  assert.match(backend,/convertToFree\?\{mode:'equal',entry_price:0\}/);
});
