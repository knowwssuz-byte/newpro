import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const r=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Telegram session is never printed and is gitignored with private file mode',()=>{
const s=r('scripts/get-telegram-session.js');
assert.doesNotMatch(s,/console\.log\(`TG_STRING_SESSION=\$\{saved\}/);
assert.match(s,/mode:0o600/);
assert.match(r('.gitignore'),/telegram\.session\.txt/);
});
