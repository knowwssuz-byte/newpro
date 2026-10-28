import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('PvP notices are sent only on finishing move and site toast is deduplicated',()=>{
assert.match(read('app/api/pvp-xo/route.js'),/action==='move'&&match\?\.status==='finished'/);
assert.match(read('lib/telegramBot.js'),/sendPvpOutcomeNotices/);
assert.match(read('app/webapp/PvpHub.jsx'),/notifiedMatches\.current\.has\(match\.id\)/);
});
