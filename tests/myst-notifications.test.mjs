import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const r=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Telegram sends significant wins but not tiny stars, without credit coupling',()=>{
let text=r('lib/telegramBot.js');assert.match(text,/sendCaseRewardNotice/);assert.match(text,/amount>=50/);
let api=r('app/api/open-case/route.js');assert.match(api,/openCaseWithRpc/);assert.match(api,/try \{await sendCaseRewardNotice/);
});
test('site notifications have independent dismissal and meaningful state',()=>{
const web=r('app/webapp/WebAppClient.jsx');assert.match(web,/myst-toast-copy/);assert.match(web,/3300/);
assert.match(web,/userXp: result\.userXp/);assert.match(r('app/globals.css'),/data-tone="error"/);
});
