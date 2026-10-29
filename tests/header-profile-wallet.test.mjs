import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('top bar profile directly opens Settings without redundant gear button',()=>{
  const page=read('app/webapp/WebAppClient.jsx');
  const start=page.indexOf('function GlobalBalanceBar(');
  const end=page.indexOf('function NavButton(',start);
  assert.ok(start>=0&&end>start);
  const bar=page.slice(start,end);
  assert.match(bar,/className="myst-profile-settings-trigger"/);
  assert.match(bar,/onClick=\{onSettings\}/);
  assert.match(bar,/aria-label="Profil va sozlamalarni ochish"/);
  assert.match(bar,/LevelRing xp=\{profile\?\.level_xp \|\| 0\} compact/);
  assert.doesNotMatch(bar,/settingsStyles\.gear/);
  assert.doesNotMatch(page,/import settingsStyles from/);
});

test('glossy Stars pill and plus both keep the existing deposit handler',()=>{
  const page=read('app/webapp/WebAppClient.jsx');
  const bar=page.slice(page.indexOf('function GlobalBalanceBar('),page.indexOf('function NavButton('));
  assert.match(bar,/className="myst-stars-wallet"/);
  assert.match(bar,/className="myst-stars-wallet-add"/);
  assert.match(bar,/aria-label="Stars balansini to‘ldirish"/);
  assert.match(bar,/className="deposit-button"/);
  assert.match(bar,/formatPrice\(profile\?\.balance\)/);
  assert.ok((bar.match(/onClick=\{onDeposit\}/g)||[]).length===2);
  const css=read('app/globals.css').split('MYST HEADER / V7')[1]||'';
  assert.match(css,/\.myst-stars-wallet-amount/);
  assert.match(css,/\.myst-stars-wallet-add/);
  assert.match(css,/@media \(max-width: 390px\)/);
  assert.match(css,/@media \(max-width: 340px\)/);
});
