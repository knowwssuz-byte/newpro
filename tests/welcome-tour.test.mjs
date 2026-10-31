import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../'+p, import.meta.url),'utf8');

test('welcome has three local WebP illustrations and concise Uzbek copy',()=>{
  const component=read('app/webapp/WelcomeTour.jsx');
  for (const name of ['gift', 'case', 'inventory']){
    const path='public/onboarding/welcome-'+name+'-v2.webp';
    const illustration=readFileSync(new URL('../'+path, import.meta.url));
    assert.equal(illustration.toString('ascii', 0, 4), 'RIFF');
    assert.equal(illustration.toString('ascii', 8, 12), 'WEBP');
    assert.match(component, new RegExp('onboarding/welcome-'+name+'-v2\\.webp'));
  }
  assert.match(component, /Keyingisi/);
  assert.match(component, /Boshlash/);
  assert.match(component, /O‘tkazish/);
  assert.match(component, /aria-label="Tanishtiruvni o‘tkazib yuborish"/);
  assert.doesNotMatch(component, /badgeIcon|heroCaption|slide\.points|GIFT COLLECTION/);
  assert.match(component, /alt=\{slide\.alt\}/);
  assert.match(component, /onTouchEnd=\{onSwipeEnd\}/);
  assert.match(component, /disabled=\{index === 0\}/);
});

test('welcome appears only when initial server bootstrap grants a one-time claim',()=>{
  const app=read('app/webapp/WebAppClient.jsx');
  const boot=read('app/api/bootstrap/route.js');
  const migration=read('supabase/migrations/20261031_first_welcome_once.sql');
  assert.match(app,/tourOpenedRef\.current = true/);
  assert.match(app,/setShowWelcomeTour\(data\.showWelcomeTour\)/);
  assert.match(app,/typeof data\.showWelcomeTour === 'boolean'/);
  assert.doesNotMatch(app,/setShowWelcomeTour\(true\)/);
  assert.doesNotMatch(app,/gift_myst_welcome_/);
  assert.match(boot,/claimFirstWelcome\(supabase, dbUser\)/);
  assert.match(boot,/showWelcomeTour,/);
  assert.match(migration,/first_welcome_shown_at/);
  assert.match(migration,/COALESCE\(first_welcome_shown_at, created_at\)/);
  assert.match(read('app/webapp/WelcomeTour.module.css'), /min-height: 100dvh/);
  assert.match(app, /if \(showWelcomeTour\) return <WelcomeTour/);
  assert.doesNotMatch(app, /\{showWelcomeTour \? <WelcomeTour/);
  assert.match(read('app/webapp/WelcomeTour.jsx'), /data-myst-intro="true"/);
  assert.doesNotMatch(read('app/webapp/WelcomeTour.jsx'), /aria-modal|role="dialog"|styles\.overlay/);
});

test('welcome is readable on short screens and respects reduced motion', () => {
  const view = read('app/webapp/WelcomeTour.jsx');
  const css = read('app/webapp/WelcomeTour.module.css');
  assert.match(view, /styles\.titleAccent/);
  assert.match(view, /styles\.titleMain/);
  assert.match(css, /background-clip:text/);
  assert.match(css, /max-height: 740px/);
  assert.match(css, /max-width: 355px/);
  assert.match(css, /font-family: Inter/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /min-height: 44px/);
  const first = read('public/onboarding/welcome-1.svg');
  assert.match(first, /fill="url\(#gold\)"/);
});
