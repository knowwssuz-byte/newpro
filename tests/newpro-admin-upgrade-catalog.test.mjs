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
