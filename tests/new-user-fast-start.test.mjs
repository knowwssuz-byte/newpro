import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('bootstrap never blocks first Home render on inventory, upgrade or image decoding',()=>{
  const api=read('app/api/bootstrap/route.js');
  const app=read('app/webapp/WebAppClient.jsx');
  assert.match(api,/wantsEssential = phase !== 'extras'/);
  assert.match(api,/wantsExtra = phase !== 'essential'/);
  assert.match(api,/wantsExtra \? supabase\s*\.from\('open_history'\)/);
  assert.match(api,/wantsExtra \? supabase\.from\('upgrade_rounds'\)/);
  assert.match(app,/phase = !wasReady && !silent \? 'essential' : 'full'/);
  assert.match(app,/void loadExtras\(\)/);
  assert.doesNotMatch(app,/await prepareFirstView\(/);
  assert.match(app,/void prepareFirstView\(\)/);
});
test('the deferred inventory payload cannot erase the already-loaded player and cases',()=>{
  const app=read('app/webapp/WebAppClient.jsx');
  assert.match(app,/if \('user' in data\) setProfile/);
  assert.match(app,/if \('cases' in data\) setCases/);
  assert.match(app,/if \('history' in data\) setHistory/);
  assert.match(app,/if \(data\.phase === 'extras' \|\| data\.phase === 'full'\) setExtrasState\('ready'\)/);
  assert.match(app,/const loadExtras = useCallback/);
});
test('first-visit JavaScript excludes large games until route selection',()=>{
  const app=read('app/webapp/WebAppClient.jsx');
  assert.doesNotMatch(app,/^import (?:DiceGame|PvpHub),/m);
  assert.match(app,/dynamic\(\(\) => import\('\.\/DiceGame'\)/);
  assert.match(app,/dynamic\(\(\) => import\('\.\/PvpHub'\)/);
  assert.match(app,/import DiceLobbyCard from '\.\/DiceLobbyCard'/);
  assert.match(app,/import PvpEntryCard from '\.\/PvpEntryCard'/);
});
test('server and browser assets have safe separate cache policies and Tokyo data locality',()=>{
  const cfg=read('vercel.json');
  const next=read('next.config.mjs');
  assert.deepEqual(JSON.parse(cfg).regions,['hnd1']);
  assert.match(next,/source:'\/api\/:path\*'.*no-store/);
  assert.match(next,/source:'\/feature\/nav\/:path\*'.*max-age=3600/);
  assert.match(next,/source:'\/onboarding\/:path\*'.*max-age=604800/);
});

test('large public case and gift artwork use optimized responsive image requests',()=>{
  const app=read('app/webapp/WebAppClient.jsx');
  const detail=read('app/webapp/CaseDetailExperience.jsx');
  const cfg=read('next.config.mjs');
  assert.ok(app.includes('className={caseOpeningStyles.caseTileImage}'));
  assert.ok(app.includes('const readyArtwork = previewImageUrl(imageUrlOf(result.gift))'));
  assert.ok(app.includes('function previewImageUrl(url)'));
  assert.ok(app.includes('&w=384&q=76'));
  assert.ok(detail.includes('className={caseOpeningStyles.caseStageArt}'));
  assert.ok(cfg.includes('qualities:[72,75,76,78]'));
  assert.ok(cfg.includes("hostname:'ylcipsfuojjvsqowbpol.supabase.co'"));
});
