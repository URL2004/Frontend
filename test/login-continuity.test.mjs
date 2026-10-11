import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const tracking = fs.readFileSync(new URL('../assets/js/head-tracking.js', import.meta.url), 'utf8');
const login = fs.readFileSync(new URL('../assets/js/login-continuity.js', import.meta.url), 'utf8');
const moduleSource = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
const tagged = 'https://gpkorea.ai.kr/?utm_source=instagram&utm_medium=social&utm_campaign=테스트채널&utm_content=v__2';
const storage = (map, blocked) => ({ getItem(k) { if (blocked) throw Error('blocked'); return map.get(k) || null; }, setItem(k,v) { if (blocked) throw Error('blocked'); map.set(k,String(v)); } });
function fixture(url = tagged, { local = new Map(), session = new Map(), blockLocal = false, blockSession = false, referrer = '' } = {}) {
 const window = { APP_CONFIG: {}, location: new URL(url) };
 window.history = { replaceState(_state,_title,next) { window.location = new URL(next,window.location); } };
 const document = { referrer, title:'test', createElement:()=>({}), head:{appendChild(){}} };
 vm.runInNewContext(tracking,{ window,document,localStorage:storage(local,blockLocal),sessionStorage:storage(session,blockSession),URL,URLSearchParams });
 return { window,local,session,api:window.gpAttribution };
}
test('storage blocked: query removal retains attribution in memory; session backup survives OAuth reload', () => {
 const f=fixture(tagged,{blockLocal:true,blockSession:true});
 const before=JSON.stringify(f.api.snapshot());
 f.window.location=new URL('https://gpkorea.ai.kr/main');
 assert.equal(JSON.stringify(f.api.snapshot()),before);
 const session=new Map();
 const landing=fixture(tagged,{blockLocal:true,session});
 const callback=fixture('https://gpkorea.ai.kr/?code=private',{blockLocal:true,session,referrer:'https://kauth.kakao.com/'});
 assert.equal(JSON.stringify(callback.api.snapshot()),JSON.stringify(landing.api.snapshot()));
});
test('fresh browser restores both original touches, removes handoff and keeps ordinary UTMs', () => {
 const f=fixture(tagged);
 const first=f.api.snapshot().first_touch;
 f.window.location=new URL(tagged.replace('v__2','v__3'));
 f.api.capture();
 f.window.location=new URL('https://gpkorea.ai.kr/main?mode=humanize&code=SECRET&state=SECRET&paymentKey=SECRET&token=SECRET#SECRET');
 const url=f.api.continuationUrl();
 assert.equal(url.includes('SECRET'),false);
 const next=fixture(url);
 assert.equal(JSON.stringify(next.api.snapshot()),JSON.stringify(f.api.snapshot()));
 assert.equal(next.api.getFirstTouch().content,first.content);
 assert.equal(next.api.getLastTouch().content,'v__3');
 assert.equal(next.window.location.hash,'');
 assert.equal(next.window.location.searchParams.get('utm_campaign'),'테스트채널');
 assert.equal(next.window.location.searchParams.get('mode'),'humanize');
});
test('a stale readable local copy cannot hide a newer session backup after a quota failure', () => {
 const session=new Map();
 const recent=fixture(tagged,{blockLocal:true,session});
 const local=new Map();
 const stale={...recent.api.getLastTouch(),campaign:'old',captured_at:new Date(Date.now()-10000).toISOString()};
 local.set('gp_attribution_last_touch',JSON.stringify(stale));
 const next=fixture('https://gpkorea.ai.kr/',{local,session});
 assert.equal(next.api.getLastTouch().campaign,'테스트채널');
});
test('a newer campaign from another tab remains visible despite the page memory fallback', () => {
 const f=fixture();
 const first=f.api.getFirstTouch();
 const old={...f.api.getLastTouch(),captured_at:new Date(Date.now()-1000).toISOString()};
 f.local.set('gp_attribution_last_touch',JSON.stringify(old));
 const other=fixture('https://gpkorea.ai.kr/?utm_source=naver&utm_campaign=other_tab',{local:f.local});
 // Deterministic tie: the local copy appears before the in-memory fallback.
 assert.equal(f.api.getLastTouch().campaign,other.api.getLastTouch().campaign);
 assert.equal(f.api.getFirstTouch().campaign,first.campaign);
});
test('www handoff uses canonical host and a receiver retains earlier first and newer last attribution', () => {
 const sender=fixture(tagged.replace('gpkorea.ai.kr','www.gpkorea.ai.kr'));
 const url=sender.api.continuationUrl();
 assert.equal(new URL(url).hostname,'gpkorea.ai.kr');
 const receiver=fixture('https://gpkorea.ai.kr/?utm_source=naver&utm_campaign=new');
 const first={...receiver.api.getFirstTouch(),captured_at:new Date(Date.now()-86400000).toISOString()};
 const last={...receiver.api.getLastTouch(),captured_at:new Date().toISOString()};
 receiver.local.set('gp_attribution_first_touch',JSON.stringify(first));
 receiver.local.set('gp_attribution_last_touch',JSON.stringify(last));
 const next=fixture(url,{local:receiver.local});
 assert.equal(next.api.getFirstTouch().captured_at,first.captured_at);
 assert.equal(next.api.getLastTouch().campaign,'new');
});
test('expired or malformed handoff is scrubbed; explicit different campaign wins', () => {
 const f=fixture();
 const url=new URL(f.api.continuationUrl());
 const payload=JSON.parse(new URLSearchParams(url.hash.slice(1)).get('gp_attribution'));
 payload.issued_at=Date.now()-600001;
 url.hash=new URLSearchParams({gp_attribution:JSON.stringify(payload)});
 assert.equal(fixture(url).window.location.hash,'');
 url.search='';
 assert.equal(fixture(url).api.getLastTouch().source,'direct');
 url.hash=new URLSearchParams({gp_attribution:'{invalid'});
 assert.equal(fixture(url).api.getLastTouch().source,'direct');
 const different=new URL(f.api.continuationUrl());
 different.searchParams.set('utm_content','different_video');
 assert.equal(fixture(different).api.getFirstTouch().content,'different_video');
});
test('handoff strips unknown data and URL secrets instead of copying arbitrary stored JSON', () => {
 const f=fixture();
 const last=JSON.parse(f.local.get('gp_attribution_last_touch'));
 f.local.set('gp_attribution_last_touch',JSON.stringify({...last,email:'SECRET',token:'SECRET',landing_url:'https://gpkorea.ai.kr/?token=SECRET#SECRET'}));
 const next=fixture('https://gpkorea.ai.kr/',{local:f.local});
 assert.equal(next.api.continuationUrl().includes('SECRET'),false);
});
function loginFixture(userAgent, attribution, clipboard) {
 const ids=['inappLoginHint','googleLoginLabel','kakaoLoginLabel','socialLoginActions','googleLoginBtn','kakaoLoginBtn','externalLoginHelp','copyLoginDraftButton','externalLoginStatus','copyExternalLoginLink','externalLoginUrl'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{id,hidden:true,style:{},dataset:{},focus(){this.focused=true;},select(){this.selected=true;}}]));
 nodes.socialLoginActions.order=['googleLoginBtn','kakaoLoginBtn'];
 nodes.socialLoginActions.insertBefore=(a,b)=>{nodes.socialLoginActions.order=[a.id,b.id];};
 const window={location:new URL(tagged+'&code=SECRET'),gpAttribution:attribution};
 const context={window,navigator:{userAgent,clipboard},document:{getElementById:id=>nodes[id]},URL,URLSearchParams};
 vm.runInNewContext(login,context);
 return {window,nodes,context,api:window.gpLoginContinuity};
}
test('Instagram shows Kakao first; iOS Google action offers instructions and a working copy fallback', async () => {
 const f=loginFixture('iPhone Instagram',fixture().api);
 assert.deepEqual(f.nodes.socialLoginActions.order,['kakaoLoginBtn','googleLoginBtn']);
 assert.equal(f.nodes.inappLoginHint.hidden,false);
 assert.match(f.nodes.googleLoginLabel.textContent,/외부 브라우저/);
 let attempts=0;
 f.window.gpAuthDiagnostics={start(){attempts++;}};
 vm.runInNewContext(moduleSource.slice(moduleSource.indexOf('window.googleLogin ='),moduleSource.indexOf('window.openExternal =')),f.context);
 await f.window.googleLogin();
 assert.equal(attempts,0);
 assert.equal(f.nodes.copyExternalLoginLink.focused,true);
 await f.api.copyLink();
 assert.equal(f.nodes.externalLoginUrl.hidden,false);
 assert.equal(f.nodes.externalLoginUrl.selected,true);
 assert.equal(fixture(f.nodes.externalLoginUrl.value).api.getLastTouch().campaign,'테스트채널');
});
test('Android intent and fallback both restore complete attribution without breaking intent syntax', () => {
 const original=fixture();
 const f=loginFixture('Android Instagram',original.api);
 f.api.openExternal();
 const intent=f.window.location.href;
 assert.equal(intent.split('#Intent;').length,2);
 const direct='https://'+intent.slice('intent://'.length).split('#Intent;')[0];
 const fallback=decodeURIComponent(intent.match(/S.browser_fallback_url=([^;]+);end$/)[1]);
 for(const url of [direct,fallback]) {
  const next=fixture(url);
  assert.equal(JSON.stringify(next.api.snapshot()),JSON.stringify(original.api.snapshot()));
  assert.equal(next.window.location.href.includes('gp_attribution'),false);
 }
});
test('desktop keeps provider order; clipboard succeeds; tracking-unavailable URLs contain only allowed fields', async () => {
 let copied='';
 const f=loginFixture('Chrome Safari',undefined,{writeText:async value=>{copied=value;}});
 assert.equal(f.api.googleExternal,false);
 assert.deepEqual(f.nodes.socialLoginActions.order,['googleLoginBtn','kakaoLoginBtn']);
 await f.api.copyLink();
 assert.equal(copied.includes('SECRET'),false);
 assert.equal(new URL(copied).searchParams.get('utm_content'),'v__2');
 assert.match(f.nodes.externalLoginStatus.textContent,/복사했어요/);
});
test('www canonical redirect preserves path and leaves query forwarding to Vercel', () => {
 const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.deepEqual(config.redirects[0],{source:'/:path*',has:[{type:'host',value:'www.gpkorea.ai.kr'}],destination:'https://gpkorea.ai.kr/:path*',permanent:true});
});
