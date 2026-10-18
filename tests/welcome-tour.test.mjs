import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../'+p, import.meta.url),'utf8');

test('welcome includes three local original illustration assets',()=>{
  const component=read('app/webapp/WelcomeTour.jsx');
  for (let i=1;i<=3;i++){
    const path='public/onboarding/welcome-'+i+'.svg';
    const illustration=read(path);
    assert.match(illustration, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(illustration, /<\/svg>$/);
    assert.match(component, new RegExp('onboarding/welcome-'+i+'\\.svg'));
  }
  assert.match(component, /Keyingisi/);
  assert.match(component, /Boshlash/);
  assert.match(component, /aria-label="Tanishtiruvni o‘tkazib yuborish"/);
  assert.match(component, /Skip/);
});

test('welcome shows for every fresh app entry without persisted dismissal',()=>{
  const app=read('app/webapp/WebAppClient.jsx');
  assert.match(app,/tourOpenedRef\.current = true/);
  assert.match(app,/setShowWelcomeTour\(true\)/);
  assert.doesNotMatch(app,/gift_myst_welcome_/);
  assert.doesNotMatch(app,/WELCOME_VERSION/);
  assert.match(read('app/webapp/WelcomeTour.module.css'), /max-height:calc\(100dvh/);
});

test('premium typography retains readable HTML headings and safe responsive layout', () => {
  const view = read('app/webapp/WelcomeTour.jsx');
  const css = read('app/webapp/WelcomeTour.module.css');
  assert.match(view, /styles\.titleAccent/);
  assert.match(view, /styles\.titleMain/);
  assert.match(css, /background-clip:text/);
  assert.match(css, /@media\(max-height:740px\)/);
  assert.match(css, /@media\(max-width:355px\)/);
  assert.match(css, /font-family:Inter/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  const first = read('public/onboarding/welcome-1.svg');
  assert.match(first, /fill="url\(#gold\)"/);
});
