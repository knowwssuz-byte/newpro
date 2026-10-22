import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {giftPrice,normalizeUpgradeGift,upgradeChance,wheelSegments,spinIndex,landedInSafeZone} from '../lib/upgradeLab.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const gift=(id,price,type='gift',extra={})=>({id,title:'Collectible '+id,sell_price:price,type,stock:1,...extra});

test('real inventory and catalog gifts retain image and TGS animation source',()=>{
  const picture=normalizeUpgradeGift(gift('g1',18,'gift',{image_url:'https://example.com/gift.svg'}));
  const animated=normalizeUpgradeGift(gift('g2',25,'gift',{animation_url:'https://example.com/gift.tgs'}),'copy-2');
  assert.equal(picture.imageUrl,'https://example.com/gift.svg');
  assert.equal(animated.animationUrl,'https://example.com/gift.tgs');
  assert.equal(animated.id,'copy-2');
  assert.equal(animated.owned,true);
  assert.equal(giftPrice({sell_price:0,buy_price:'33'}),33);
  assert.equal(normalizeUpgradeGift(gift('balance',20,'balance')),null);
  assert.equal(normalizeUpgradeGift(gift('zero',0)),null);
});

test('wheel sectors mirror displayed odds rather than inventing separate slices',()=>{
  for(const chance of [5,20,47.6,82,85]){
    const wheel=wheelSegments(chance);
    assert.equal(wheel.length,12);
    assert.equal(wheel.filter(item=>item.result==='win').length,1);
    assert.ok(Math.abs(wheel.filter(item=>item.result==='win').reduce((sum,item)=>sum+item.weight,0)-chance)<1e-8);
    assert.ok(Math.abs(wheel.reduce((sum,item)=>sum+item.weight,0)-100)<1e-8);
    assert.equal(wheel[0].weight,chance);
    assert.equal(wheel[0].label,'SAFE ZONE');
    assert.ok(wheel.slice(1).every(item=>item.result==='retry'));

  }
  assert.equal(upgradeChance({price:20},{price:20}),0);
  assert.ok(upgradeChance({price:25},{price:75})>0);
});

test('selected reel segment always represents chosen simulation outcome',()=>{
  for(let n=0;n<10;n++){
    assert.equal(spinIndex(true,n/10),0);
    assert.ok(spinIndex(false,n/10)>=1 && spinIndex(false,n/10)<=11);
    assert.equal(landedInSafeZone(18,spinIndex(true,n/10)),true);
    assert.equal(landedInSafeZone(18,spinIndex(false,n/10)),false);
  }
});

test('production Upgrade Studio displays real photo previews and the vendored open source spin wheel',()=>{
  const page=read('app/webapp/UpgradeLab.jsx');
  const preview=read('app/webapp/UpgradeGiftThumb.jsx');
  const vendor=read('app/webapp/vendor/spin-wheel-esm.js');
  assert.match(vendor,/spin-wheel \(ESM\) v5\.0\.2/);
  assert.match(page,/spinToItem/);
  assert.match(page,/isInteractive:false/);
  assert.match(page,/wheelSegments\(chance\)/);
  assert.match(page,/UpgradeGiftThumb/);
  assert.match(page,/getGiftPreview/);
  assert.match(page,/sourceMode/);
  assert.match(page,/role="dialog"/);
  assert.match(preview,/api\/gift-animation/);
  assert.match(preview,/TGS_SUFFIX/);
  assert.doesNotMatch(page,/Crystal Drop|Royal Emblem|Eternal Prism/);
});

test('one uninterrupted SAFE ZONE accurately matches the stated angular size',()=>{
 for(const chance of [5,18.5,33.3,71.2,85]){
  const sectors=wheelSegments(chance);
  const degrees=sectors[0].weight/100*360;
  assert.ok(Math.abs(degrees-(chance*3.6))<1e-8);
  assert.equal(sectors.filter(s=>s.result==='win').length,1);
  assert.ok(sectors.slice(1).every(s=>s.result==='retry'));
 }
 assert.equal(landedInSafeZone(18.5,0),true);
 assert.equal(landedInSafeZone(18.5,1),false);
 assert.equal(landedInSafeZone(18.5,12),false);
});
