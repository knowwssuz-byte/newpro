import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('cinematic case view is code-split away from Telegram boot',()=>{
  const main=read('app/webapp/WebAppClient.jsx');
  const caseView=read('app/webapp/CaseDetailExperience.jsx');
  assert.match(main,/dynamic\(\(\) => import\('\.\/CaseDetailExperience'\)/);
  assert.doesNotMatch(main,/function InlineRaffleRoller\(/);
  assert.doesNotMatch(main,/function CaseWinResult\(/);
  assert.match(caseView,/export default function CaseDetailPage/);
  assert.match(caseView,/function InlineRaffleRoller/);
  assert.match(caseView,/function CaseArtwork/);
  assert.doesNotMatch(caseView,/body\.style\.position\s*=/);
});
test('only the authorized backend response sets winning gift and balance',()=>{
  const main=read('app/webapp/WebAppClient.jsx');
  const server=read('app/api/open-case/route.js');
  assert.match(main,/apiPost\('\/api\/open-case', \{ caseId: caseItem\.id \}\)/);
  assert.match(main,/const reel = buildOpeningReel\(displayGiftPool, result\.gift\)/);
  assert.match(main,/gift: result\.gift/);
  assert.match(main,/balanceAfter: result\.balanceAfter/);
  assert.match(server,/open_case_atomic/);
  assert.doesNotMatch(read('app/webapp/CaseDetailExperience.jsx'),/Math\.random/);
});
test('live price, actual rarity, inventory, safe skip and sound preference remain wired',()=>{
  const main=read('app/webapp/WebAppClient.jsx');
  const page=read('app/webapp/CaseDetailExperience.jsx');
  assert.match(main,/soundEnabled=\{uiSettings\.sound\}/);
  assert.match(page,/formatPrice\(caseItem\.price\)/);
  assert.match(page,/data-rarity/);
  assert.match(page,/onInventory/);
  assert.match(page,/onAgain/);
  assert.match(page,/Animatsiyani o‘tkazib yuborish/);
  assert.match(page,/useCaseSound\(soundEnabled\)/);
  assert.match(page,/onRollComplete\(inlineOpening\.spinKey\)/);
});
