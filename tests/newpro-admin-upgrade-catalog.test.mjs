import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('admin image selection and independent upgrade stock',()=>{
 assert.match(read('app/admin/AdminClient.jsx'),/admin-gift-choice/);
 assert.match(read('app/admin/AdminClient.jsx'),/upgrade_stock_set/);
 assert.match(read('app/api/browser-admin/route.js'),/case_archive_all/);
 assert.match(read('app/api/bootstrap/route.js'),/upgradeCatalog/);
 assert.match(read('app/webapp/UpgradeLab.jsx'),/!item.available/);
});

test('catalog buttons override the old purple-cyan form button rule and show real TGS previews',()=>{
 const css=read('app/admin/admin-catalog.css');
 const admin=read('app/admin/AdminClient.jsx');
 assert.ok(css.includes('.browser-admin-form .admin-gift-selector-grid > button.admin-gift-choice'));
 assert.match(css,/min-height:180px !important/);
 assert.match(css,/flex:0 0 110px !important/);
 assert.match(admin,/function GiftStaticPreview/);
 assert.match(admin,/IntersectionObserver/);
 assert.match(admin,/<UpgradeGiftThumb item={gift}/);
});
