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

test('reward result uses isolated premium modal with accessibly labeled close and responsive motion',()=>{
 const view=read('app/webapp/CaseDetailExperience.jsx');
 const css=read('app/webapp/CaseOpening.module.css');
 assert.match(view,/className=\{caseOpeningStyles\.resultPortal\}/);
 assert.match(view,/className=\{caseOpeningStyles\.resultArtwork\}/);
 assert.match(view,/className=\{caseOpeningStyles\.resultStatus\}/);
 assert.match(view,/onClick=\{onAgain\}/);
 assert.match(view,/onClick=\{onInventory\}/);
 assert.match(view,/onClick=\{onClose\}/);
 assert.match(view,/onSell\(opening\)/);
 assert.match(view,/aria-modal="true"/);
 assert.match(view,/event\.key === 'Escape'/);
 assert.match(css,/@keyframes mystRewardEnter/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(css,/max-height: calc\(100dvh/);
 assert.doesNotMatch(view,/className="win-screen-card/);
});

test('reward modal has hidden scrollbars and compact responsive sizing without clipping actions',()=>{
 const css=read('app/webapp/CaseOpening.module.css');
 const jsx=read('app/webapp/CaseDetailExperience.jsx');
 assert.match(css,/scrollbar-width: none/);
 assert.match(css,/\.resultPanel::-webkit-scrollbar/);
 assert.match(css,/overflow-y: auto/);
 assert.match(css,/@media \(max-height: 590px\)/);
 assert.match(css,/font-family: Inter/);
 assert.match(css,/max-height: calc\(100dvh/);
 assert.match(jsx,/ref=\{modalRef\} tabIndex=\{-1\}/);
 assert.match(jsx,/modalRef\.current\?\.focus/);
 assert.doesNotMatch(jsx,/closeButtonRef\.current\?\.focus/);
});
