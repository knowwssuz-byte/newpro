import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUnlimitedNonUpgradableGift,
  isVerifiedUnlimitedCatalogGift
} from '../lib/telegramRegularGift.mjs';

const unlimited = { id:'5170145012310081615', star_count:25, sticker:{file_id:'abc', is_animated:true} };
test('accepts verified unlimited gift with no upgrade fields', () => {
  assert.equal(isUnlimitedNonUpgradableGift(unlimited), true);
});
test('excludes limited gifts even when upgrade fields are absent', () => {
  assert.equal(isUnlimitedNonUpgradableGift({...unlimited,total_count:0}), false);
  assert.equal(isUnlimitedNonUpgradableGift({...unlimited,remaining_count:10}), false);
});
test('excludes gifts with paid or collectible upgrade metadata', () => {
  assert.equal(isUnlimitedNonUpgradableGift({...unlimited,upgrade_star_count:25}), false);
  assert.equal(isUnlimitedNonUpgradableGift({...unlimited,unique_gift_variant_count:10}), false);
  assert.equal(isUnlimitedNonUpgradableGift({...unlimited,has_colors:true}), false);
});
test('rejects invalid gift identifiers and prices', () => {
  assert.equal(isUnlimitedNonUpgradableGift({...unlimited,id:'fake'}), false);
  assert.equal(isUnlimitedNonUpgradableGift({...unlimited,star_count:0}), false);
});
test('never trusts legacy catalog rows with unknown type', () => {
  const item = {telegram_gift_id:unlimited.id,star_count:25,raw:{}};
  assert.equal(isVerifiedUnlimitedCatalogGift(item), false);
  item.raw={limited:false,upgradeable:false};
  assert.equal(isVerifiedUnlimitedCatalogGift(item), false);
});
test('catalog requires explicit server-side Bot API verification', () => {
  const item = {telegram_gift_id:unlimited.id,star_count:25,raw:{
    source:'bot_api_getAvailableGifts', giftKind:'unlimited_non_upgradable',
    limited:false,upgradeable:false
  }};
  assert.equal(isVerifiedUnlimitedCatalogGift(item), true);
  assert.equal(isVerifiedUnlimitedCatalogGift({...item,raw:{...item.raw,limited:true}}), false);
});
