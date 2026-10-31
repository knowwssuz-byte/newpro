import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Production dependencies are pinned to resolved lockfile versions',()=>{
 const packageJson=JSON.parse(read('package.json'));
 const lock=JSON.parse(read('package-lock.json'));
 for(const section of ['dependencies','devDependencies']){
  for(const [name,version] of Object.entries(packageJson[section])){
   assert.equal(lock.packages[''][section][name],version);
   assert.equal(lock.packages['node_modules/'+name].version,version);
   assert.match(version,/^\d+\.\d+\.\d+/);
  }
 }
});
test('Case opening is atomic: no legacy partial-write path remains',()=>{
 const route=read('app/api/open-case/route.js');
 assert.match(route,/supabase\.rpc\('open_case_atomic'/);
 assert.match(route,/OPEN_CASE_RPC_MISSING/);
 assert.doesNotMatch(route,/openCaseFallback|decrementGiftStock|Math\.random/);
});
test('Color Arena opens directly and exposes secondary PvP modes',()=>{
 const hub=read('app/webapp/PvpHub.jsx');
 const color=read('app/webapp/ColorArena.jsx');
 assert.match(hub,/onOpenModes=\{\(\)=>setSelected\('list'\)\}/);
 assert.match(color,/onClick=\{onOpenModes\}/);
 assert.match(hub,/setSelected\('xo'\)/);
});
test('Production browser admin pre-checks a credential before parsing payload',()=>{
 const route=read('app/api/browser-admin/route.js');
 const entry=route.slice(route.indexOf('export async function POST(request)'));
 assert.ok(entry.indexOf('assertAdmin(request, {adminKey:\'\'})')<entry.indexOf('request.formData()'));
 assert.ok(entry.indexOf('assertAdmin(request, {adminKey:\'\'})')<entry.indexOf('request.json()'));
});
test('Visual smoke runs on PR and main pushes',()=>{
 const workflow=read('.github/workflows/myst-visual-smoke.yml');
 assert.match(workflow,/on:\s+push:/);
 assert.match(workflow,/pull_request:/);
});

test('admin gift removal preserves historical upgrade foreign keys',()=>{
 const admin=read('app/api/browser-admin/route.js');
 const start=admin.indexOf("if (action === 'gift_delete')");
 const end=admin.indexOf("if (action === 'user_add_balance')",start);
 assert.ok(start>=0&&end>start);
 const block=admin.slice(start,end);
 assert.match(block,/\.update\(\{is_active:false\}\)/);
 assert.doesNotMatch(block,/\.delete\(\)/);
});
