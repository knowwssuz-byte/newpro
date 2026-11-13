import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { verifyTelegramInitData } from '../lib/verifyTelegram.js';
import { HttpError, assertSameOrigin, readJson, readLimitedBytes, readForm } from '../lib/security/http.mjs';
import { allowedAnimationUrl, decodeAnimation, validateImage, validateVideo } from '../lib/security/assets.mjs';
import { contentSecurityPolicy } from '../lib/security/csp.mjs';

const token = 'test-bot-token';
const signed = (values = {}) => {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now()/1000)), user: JSON.stringify({id:123,first_name:'QA'}), ...values });
  const data = [...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  params.set('hash',crypto.createHmac('sha256',crypto.createHmac('sha256','WebAppData').update(token).digest()).update(data).digest('hex'));
  return params.toString();
};
test('Telegram verification rejects tampering, duplicates, invalid users, expired and future sessions',()=>{
  assert.equal(verifyTelegramInitData(signed(),token).ok,true);
  for(const data of [signed()+'&user=%7B%22id%22%3A999%7D',signed().replace('auth_date=','auth_date=1'),
    signed({user:'null'}),signed({user:'{"id":-1}'}),signed({user:'{"id":"123"}'}),
    signed({auth_date:'1'}),signed({auth_date:String(Math.floor(Date.now()/1000)+120)})]) {
    assert.equal(verifyTelegramInitData(data,token).ok,false);
  }
  assert.equal(verifyTelegramInitData(signed({auth_date:'1'}),token,0).ok,false);
});
test('CSRF rejects foreign, sibling, null and missing origins for cookie mutations',()=>{
  const req=(headers)=>new Request('https://newpro.test/api/admin/session',{headers});
  assert.doesNotThrow(()=>assertSameOrigin(req({origin:'https://newpro.test'}),true));
  for(const headers of [{},{origin:'null'},{origin:'https://evil.test'},{origin:'https://sub.newpro.test'},{'sec-fetch-site':'same-site'}])
    assert.throws(()=>assertSameOrigin(req(headers),true),e=>e.status===403);
});
test('body limits reject chunked, forged length, malformed JSON and non-object JSON',async()=>{
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(20));c.close();}});
  await assert.rejects(readLimitedBytes(new Request('http://local',{method:'POST',body:stream,duplex:'half'}),10),e=>e.status===413);
  await assert.rejects(readLimitedBytes(new Response('ok',{headers:{'content-length':'9000'}}),10),e=>e.status===413);
  for(const body of ['[]','null','{bad']) await assert.rejects(readJson(new Request('http://local',{method:'POST',headers:{'content-type':'application/json'},body})),e=>e.status===400);
  await assert.rejects(readJson(new Request('http://local',{method:'POST',body:'{}'})),e=>e.status===415);
  const form=new FormData();form.set('hello','world');
  assert.equal((await readForm(new Request('http://local',{method:'POST',body:form}))).get('hello'),'world');
});
test('asset proxy rejects SSRF URLs and bounded gzip decompression rejects bombs',()=>{
  const base='https://example.supabase.co';
  assert.ok(allowedAnimationUrl(base+'/storage/v1/object/public/gift-assets/gift.tgs',base));
  for(const url of ['http://127.0.0.1/a',base+':444/storage/v1/object/public/gift-assets/a','https://evil.test/storage/v1/object/public/gift-assets/a',base+'/storage/v1/object/public/private/a',base+'/storage/v1/object/public/gift-assets/../../private/a',base+'/storage/v1/object/public/gift-assets/a?redirect=evil']) assert.equal(allowedAnimationUrl(url,base),null);
  assert.deepEqual(decodeAnimation(gzipSync(Buffer.from('{"layers":[]}'))),{layers:[]});
  assert.throws(()=>decodeAnimation(gzipSync(Buffer.alloc(20000)),1024),e=>e.status===422);
});
test('uploads validate content, rasterize SVG and reject active or external SVG content',async()=>{
  const png=await sharp({create:{width:20,height:20,channels:4,background:'#123456'}}).png().toBuffer();
  assert.equal((await validateImage(png)).contentType,'image/png');
  await assert.rejects(validateImage(Buffer.from('<html>fake PNG</html>')),e=>e.status===400);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>';
  assert.equal((await validateImage(Buffer.from(svg),{allowSvg:true})).ext,'png');
  for(const inside of ['<script>alert(1)</script>','<image href="file:///etc/passwd"/>','<image href="https://evil.test/a"/>','<rect onload="alert(1)"/>'])
    await assert.rejects(validateImage(Buffer.from(svg.replace('</svg>',inside+'</svg>')),{allowSvg:true}),e=>e.status===400);
  assert.throws(()=>validateVideo(png,'video/mp4'),e=>e.status===400);
});
test('production CSP allows nonce scripts but rejects inline attributes and eval',()=>{
  const csp=contentSecurityPolicy('testnonce',{admin:true});
  const scripts=csp.split('; ').find(s=>s.startsWith('script-src '));
  assert.match(scripts,/'nonce-testnonce'/);
  assert.doesNotMatch(scripts,/unsafe-inline|unsafe-eval/);
  assert.match(csp,/script-src-attr 'none'/);assert.match(csp,/frame-ancestors 'none'/);
});

test('admin session tokens are opaque, rotate with key and revoke server-side',async()=>{
  const rows=new Map();
  const db={from(){let hash,expiry;return {
    select(){return this},eq(k,v){hash=v;return this},gt(k,v){expiry=v;return this},
    maybeSingle(){const row=rows.get(hash);return {data:row&&row.expires_at>expiry?row:null,error:null}},
    insert(row){rows.set(row.token_hash,row);return {error:null}},
    delete(){return {eq(k,v){rows.delete(v);return {error:null}}}},
  }}};
  const source=(await readFile(new URL('../lib/security/adminSession.js',import.meta.url),'utf8'))
    .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const api=new Function('crypto','getSupabaseAdmin','HttpError','assertSameOrigin',source+'\nreturn {createSession,validSession,revokeSession,sessionHash,validAdminKey,setSessionCookie,assertAdminSession};')(crypto,()=>db,HttpError,assertSameOrigin);
  const previous=process.env.ADMIN_PANEL_KEY;process.env.ADMIN_PANEL_KEY='isolated-security-test';
  try {
    assert.equal(api.validAdminKey('wrong'),false);assert.equal(api.validAdminKey('isolated-security-test'),true);
    const session=await api.createSession();assert.match(session,/^[a-f0-9]{64}$/);assert.equal(rows.has(session),false);
    assert.equal(await api.validSession(session),true);assert.equal(await api.validSession('forged'),false);
    process.env.ADMIN_PANEL_KEY='rotated-key';assert.equal(await api.validSession(session),false);
    process.env.ADMIN_PANEL_KEY='isolated-security-test';
    await api.revokeSession(session);assert.equal(await api.validSession(session),false);
    const expired=await api.createSession();rows.get(api.sessionHash(expired)).expires_at='2000-01-01T00:00:00Z';assert.equal(await api.validSession(expired),false);
    const cookies=[];api.setSessionCookie({cookies:{set(...args){cookies.push(args)}}},'token');
    assert.equal(cookies[0][2].httpOnly,true);assert.equal(cookies[0][2].sameSite,'strict');assert.equal(cookies[0][2].path,'/');
  } finally {if(previous===undefined)delete process.env.ADMIN_PANEL_KEY;else process.env.ADMIN_PANEL_KEY=previous;}
});

test('hardened dependency blocks prototype poisoning while retaining TON option merging',async()=>{
  const {default:merge}=await import('../vendor/deepmerge/index.cjs');
  const malicious=JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"bad":true}},"safe":{"prototype":{"x":1},"color":"purple"}}');
  for(const value of [merge({},malicious),merge(malicious,{}),merge(Object.create(null),malicious),merge({a:malicious},{})]) {
    assert.equal(value.polluted,undefined);assert.equal(value.bad,undefined);assert.equal({}.polluted,undefined);
    assert.equal(Object.hasOwn(value,'__proto__'),false);
  }
  const result=merge({colors:{accent:'purple',text:'white'},wallets:['one']},{colors:{accent:'blue'},wallets:['two']},{arrayMerge:(_,source)=>source});
  assert.deepEqual(result,{colors:{accent:'blue',text:'white'},wallets:['two']});
});
