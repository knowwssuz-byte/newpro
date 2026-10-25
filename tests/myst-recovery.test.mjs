import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('last known-good build does not contain Case Opening 4.0 imports',()=>{
  const client=read('app/webapp/WebAppClient.jsx');
  assert.doesNotMatch(client,/caseReelMotion|CaseCinematicStage|playCaseCue/);
  assert.match(client,/CASE_ROLL_DURATION_MS = 4600/);
});
test('Telegram helper exceptions do not abort authenticated bootstrap',()=>{
  const client=read('app/webapp/WebAppClient.jsx');
  assert.match(client,/for \(const prepareHost of/);
  assert.match(client,/try \{ prepareHost\(\); \} catch/);
  assert.match(client,/attempts < 120/);
  assert.match(client,/setInitData\(app\.initData\)/);
});
test('broken cached responses are normalized instead of crashing React',()=>{
  const client=read('app/webapp/WebAppClient.jsx');
  assert.match(client,/Array\.isArray\(data\.cases\)/);
  assert.match(client,/Array\.isArray\(data\.gifts\)/);
  assert.match(client,/Array\.isArray\(data\.history\)/);
  assert.doesNotMatch(client,/readBootstrapCache|writeBootstrapCache|gift_myst_bootstrap_v3_/);
});
test('app render failure offers manual non-destructive reload',()=>{
  const ui=read('app/webapp/error.jsx');
  assert.match(ui,/function WebAppError/);
  assert.match(ui,/Qayta urinish/);
  assert.match(ui,/Yangidan yuklash/);
  assert.match(ui,/window\.location\.replace/);
  assert.doesNotMatch(ui,/localStorage\.clear|sessionStorage\.clear/);
});
