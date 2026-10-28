import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {caseImageValues,caseImageStyle} from '../lib/caseImageLayout.mjs';
const read = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Default image placement does not change old cases',()=>{
 assert.deepEqual(caseImageValues({}),{scale:1,x:0,y:0});
 assert.deepEqual(caseImageStyle({}),{'--case-image-scale':'1','--case-image-x':'0%','--case-image-y':'0%'});
});
test('Saved scale and offsets apply on home and detail pages',()=>{
 assert.deepEqual(caseImageValues({image_scale:'1.75',image_offset_x:-25,image_offset_y:10}),{scale:1.75,x:-25,y:10});
 for(const path of ['app/webapp/WebAppClient.jsx','app/webapp/CaseDetailExperience.jsx'])
   assert.match(read(path),/caseImageStyle\(caseItem\)/);
 assert.match(read('app/webapp/CaseOpening.module.css'),/translate:var\(--case-image-x/);
});
test('Admin has live sliders, reset and a Save action, with server-side validation',()=>{
 const admin=read('app/admin/AdminClient.jsx');
 for(const part of ['CaseArtworkEditor','type="range"','Standart holat','Rasm joylashuvini sozlash','case_image_layout_update'])
   assert.ok(admin.includes(part),part);
 const route=read('app/api/browser-admin/route.js');
 assert.ok(route.includes("action === 'case_image_layout_update'"));
 assert.match(route,/Number\.isSafeInteger\(x\)/);
 assert.match(route,/Number\.isSafeInteger\(y\)/);
});
