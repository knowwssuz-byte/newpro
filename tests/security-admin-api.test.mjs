import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { HttpError, assertSameOrigin, readJson, readForm, securityError } from '../lib/security/http.mjs';

async function moduleWith(path,deps,exports) {
  const text=(await readFile(new URL('../'+path,import.meta.url),'utf8')).replace(/^import[^;]+;\n/gm,'').replace(/^export /gm,'');
  return new Function(...Object.keys(deps),text+'\nreturn {'+exports.join(',')+'};')(...Object.values(deps));
}
test('admin login, persistent throttling, cookies, CSRF, logout and old-key rejection',async()=>{
  const sessions=new Map(),rates=new Map();let unavailable=false;
  const db={
    async rpc(name,{p_key,p_limit}) {
      if(unavailable)return {error:{code:'unavailable'}};
      const hits=(rates.get(p_key)||0)+1;rates.set(p_key,hits);
      return {data:{allowed:hits<=p_limit,retry_after:900},error:null};
    },
    from(){let hash,expiry;return {
      select(){return this},eq(k,v){hash=v;return this},gt(k,v){expiry=v;return this},
      maybeSingle(){const row=sessions.get(hash);return {data:row&&row.expires_at>expiry?row:null,error:null}},
      insert(row){sessions.set(row.token_hash,row);return {error:null}},
      delete(){return {eq(k,v){sessions.delete(v);return {error:null}}}},
    }},
  };
  const previous={key:process.env.ADMIN_PANEL_KEY,node:process.env.NODE_ENV,vercel:process.env.VERCEL};
  Object.assign(process.env,{ADMIN_PANEL_KEY:'isolated-password',NODE_ENV:'production',VERCEL:'1'});
  try {
    const rate=await moduleWith('lib/security/rateLimit.js',{crypto,isIP,getSupabaseAdmin:()=>db,HttpError,assertSameOrigin},['guardRequest','enforceRate','clientIp']);
    const session=await moduleWith('lib/security/adminSession.js',{crypto,getSupabaseAdmin:()=>db,HttpError,assertSameOrigin},['ADMIN_COOKIE','cookieToken','createSession','revokeSession','setSessionCookie','validAdminKey','validSession','assertAdminSession']);
    const NextResponse={json(value,init){const response=Response.json(value,init);response.cookieValues=[];response.cookies={set(...args){response.cookieValues.push(args)}};return response;}};
    const api=await moduleWith('app/api/admin/session/route.js',{NextResponse,...rate,...session,HttpError,readJson,securityError},['GET','POST']);
    const req=(body,{ip='192.0.2.1',cookie='',origin='https://newpro.test'}={})=>new Request('https://newpro.test/api/admin/session',{method:'POST',headers:{origin,'x-forwarded-for':ip,'content-type':'application/json',cookie},body:JSON.stringify(body)});
    assert.equal((await api.POST(req({action:'login',key:'isolated-password'},{origin:'https://attacker.test'}))).status,403);
    for(let i=0;i<10;i++)assert.equal((await api.POST(req({action:'login',key:'bad'}))).status,401);
    const blocked=await api.POST(req({action:'login',key:'isolated-password'}));assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'900');
    const login=await api.POST(req({action:'login',key:'isolated-password'},{ip:'192.0.2.2'}));assert.equal(login.status,200);
    const [name,value,options]=login.cookieValues[0];assert.equal(name,'__Host-newpro_admin');assert.equal(options.httpOnly,true);assert.equal(options.secure,true);assert.equal(options.sameSite,'strict');
    assert.doesNotMatch(await login.text(),/isolated-password|token|key/);
    const cookie=name+'='+value;
    const status=await api.GET(new Request('https://newpro.test/api/admin/session',{headers:{cookie,'x-forwarded-for':'192.0.2.2'}}));assert.equal((await status.json()).authenticated,true);
    const source=await readFile(new URL('../app/api/browser-admin/route.js',import.meta.url),'utf8');
    const body=source.slice(source.indexOf('export const runtime')).replace(/^export /gm,'');
    const admin=new Function('crypto','NextResponse','guardRequest','assertAdminSession','getSupabaseAdmin','HttpError','readJson','readForm','securityError',body+'\nreturn POST;')(crypto,NextResponse,rate.guardRequest,session.assertAdminSession,()=>db,HttpError,readJson,readForm,securityError);
    const oldKey=req({action:'bootstrap'},{ip:'192.0.2.2'});oldKey.headers.set('authorization','Bearer isolated-password');
    assert.equal((await admin(oldKey)).status,401);
    assert.equal((await api.POST(req({action:'logout'},{ip:'192.0.2.2',cookie}))).status,200);
    assert.equal(await session.validSession(value),false);
    unavailable=true;
    assert.equal((await api.POST(req({action:'login',key:'isolated-password'},{ip:'192.0.2.3'}))).status,503);
  } finally {
    for(const [key,value] of Object.entries({ADMIN_PANEL_KEY:previous.key,NODE_ENV:previous.node,VERCEL:previous.vercel}))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
