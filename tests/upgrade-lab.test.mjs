import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 giftPrice,normalizeUpgradeGift,upgradeChance,wheelSegments,spinIndex,landedInSafeZone,
 planUpgradeSpin,didWheelLandInSafeZone,normalizeWheelDegrees,
} from '../lib/upgradeLab.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const gift=(id,price,type='gift',extra={})=>({id,title:'Collectible '+id,sell_price:price,type,stock:1,...extra});

test('keep real inventory and catalog previews',()=>{
 const picture=normalizeUpgradeGift(gift('g1',18,'gift',{image_url:'https://example.com/gift.svg'}));
 const animated=normalizeUpgradeGift(gift('g2',25,'gift',{animation_url:'https://example.com/gift.tgs'}),'copy-2');
 assert.equal(picture.imageUrl,'https://example.com/gift.svg');
 assert.equal(animated.animationUrl,'https://example.com/gift.tgs');
 assert.equal(animated.id,'copy-2');assert.equal(animated.owned,true);
 assert.equal(giftPrice({sell_price:0,buy_price:'33'}),33);
 assert.equal(normalizeUpgradeGift(gift('balance',20,'balance')),null);
});
test('legacy compatibility and displayed percentage',()=>{
 for(const chance of [5,18.5,47.6,85]){
  const sectors=wheelSegments(chance);
  assert.equal(sectors.length,12);
  assert.ok(Math.abs(sectors[0].weight-chance)<1e-8);
  assert.ok(Math.abs(sectors.reduce((a,s)=>a+s.weight,0)-100)<1e-7);
 }
 assert.equal(spinIndex(true,.72),0);
 assert.equal(landedInSafeZone(18.5,0),true);
 assert.equal(upgradeChance({price:20},{price:20}),0);
});
test('circle landing hit-test at pointer checks true angular arc boundaries',()=>{
 assert.equal(normalizeWheelDegrees(-1),359);
 for(const chance of [5,18.5,33.3,47.6,85]){
  const arc=chance*3.6;
  assert.equal(didWheelLandInSafeZone(chance,180-(arc/2),180),true);
  assert.equal(didWheelLandInSafeZone(chance,180-(arc+1),180),false);
  assert.equal(didWheelLandInSafeZone(chance,180+1,180),false);
 }
});
test('every generated winning and losing stop matches the physical indicator',()=>{
 for(const chance of [5,7.1,18.5,33.3,47.6,71.2,85]){
  for(const previousRotation of [0,42.7,1880.9,15123.12]){
   for(const win of [true,false]){
    for(let j=0;j<=100;j++){
     const plan=planUpgradeSpin({chance,previousRotation,win,randomValue:j/100});
     assert.equal(didWheelLandInSafeZone(chance,plan.endRotation,180),win);
     assert.ok(plan.endRotation>previousRotation+5*360);
    }
   }
  }
 }
});
test('UI matches reference composition and contains no prize wedges or dummy art',()=>{
 const page=read('app/webapp/UpgradeLab.jsx');
 const css=read('app/webapp/UpgradeLab.module.css');
 assert.match(page,/className={styles.wheelSection}/);
 assert.match(page,/className={styles.cards}/);
 assert.match(page,/className={styles.improve}/);
 assert.match(page,/planUpgradeSpin/);
 assert.match(page,/didWheelLandInSafeZone/);
 assert.match(page,/UpgradeGiftThumb/);
 assert.match(page,/vendor\/confetti-esm\.js/);
 assert.match(page,/role="dialog"/);
 assert.match(css,/conic-gradient/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(page,/royal-(star|crown|gem|boost|gift)\.svg|spinToItem/);
});
