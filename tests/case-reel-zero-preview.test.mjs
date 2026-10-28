import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPresentationReel,buildIdlePreviewStrip} from '../lib/caseReelPresentation.mjs';
const possible={id:'p',stock:10,is_active:true,real_chance:12};
const possible2={id:'p2',stock:3,is_active:true,real_chance:30};
const zero={id:'z',stock:5,is_active:true,real_chance:0};
const zero2={id:'z2',stock:3,is_active:true,real_chance:0};
const hidden={id:'h',stock:8,is_active:false,real_chance:0};
const empty={id:'e',stock:0,is_active:true,real_chance:0};
test('0% gifts appear more often visually while server controls the winner',()=>{
 const reel=buildPresentationReel([possible,possible2,zero,zero2,hidden,empty],possible,()=>.35);
 assert.equal(reel.length,57);
 assert.strictEqual(reel[48],possible);
 assert.deepEqual(reel.map((g,i)=>['z','z2'].includes(g.id)?i:-1).filter(i=>i>=0),[0,5,10,15,20,25,30,35,40,45,53,56]);
 assert.ok(reel.every(g=>g.id!=='h'&&g.id!=='e'));
});
test('zero can never overwrite the authoritative server winner',()=>{
 const reel=buildPresentationReel([zero,possible],possible,()=>.2);
 assert.strictEqual(reel[48],possible);
 assert.equal(reel.filter(g=>g.id==='z').length,12);
});
test('idle preview shows 0% three times per 11 cards',()=>{
 const idle=buildIdlePreviewStrip([possible,zero,zero2,hidden,empty]);
 assert.equal(idle.length,11);
 assert.equal(idle.filter(g=>['z','z2'].includes(g.id)).length,3);
 assert.deepEqual(buildIdlePreviewStrip([]),[]);
});
test('server is still the only authority',()=>{
 const main=readFileSync(new URL('../app/webapp/WebAppClient.jsx',import.meta.url),'utf8');
 const detail=readFileSync(new URL('../app/webapp/CaseDetailExperience.jsx',import.meta.url),'utf8');
 assert.match(main,/gift: result\.gift/);
 assert.match(main,/buildOpeningReel\(displayGiftPool, result\.gift\)/);
 assert.doesNotMatch(detail,/Math\.random/);
 assert.doesNotMatch(detail,/<CaseArtwork/);
 assert.doesNotMatch(detail,/0% giftlar faqat ko‘rinadi/);
 assert.doesNotMatch(detail,/className=\{caseOpeningStyles\.previewOnly\}/);
 assert.doesNotMatch(detail,/0% · PREVIEW/);
 assert.doesNotMatch(detail,/Yutish foizlari pastda/);
 assert.doesNotMatch(detail,/detailPrizePreviewBadge/);
 assert.match(detail,/Yutish ehtimollarini ko‘rish/);
 assert.match(detail,/<strong>\{visibleChance\(gift\)\}%<\/strong>/);
 assert.match(detail,/<details className=\{caseOpeningStyles\.detailOdds\}>/);
});
