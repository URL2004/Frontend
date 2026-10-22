import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../assets/js/app-module.js', import.meta.url), 'utf8');
const flow = fs.readFileSync(new URL('../assets/js/evasion-flow.js', import.meta.url), 'utf8');
function referral(response, balance = 48) {
 const storage = new Map([['pendingRef','friend01']]), messages = [];
 const user = { uid: 'synthetic-owner', getIdToken: async () => 'test' };
 const c = { window: { CU:user, UC:20, apiUrl:x=>x, gpToast:(m)=>messages.push(m) },
  localStorage: {getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}, alert:m=>messages.push(m), updateCreditUI(){},
  fetch:async()=>{if(response instanceof Error)throw response; return response;},
  getDoc:async()=>({exists:()=>true,data:()=>({credits:balance})}) };
 vm.runInNewContext(app.slice(app.indexOf('async function applyPendingReferral('),app.indexOf('async function loadUser(')),c);
 return {c,user,storage,messages,run:()=>c.applyPendingReferral(user,{}, {refCode:'myref001'})};
}
test('referral rejection is visible, transient failures retain the code, and success reads authoritative balance',async()=>{
 for(const status of [401,408,429,500]) {
  const h=referral({ok:false,status,json:async()=>({error:'잠시 후 다시 시도'})});await h.run();
  assert.equal(h.storage.get('pendingRef'),'friend01');assert.equal(h.messages.length,1);assert.match(h.messages[0],/재시도/);
 }
 const h=referral({ok:false,status:409,json:async()=>({error:'동일한 가입 환경'})});await h.run();
 assert.equal(h.storage.has('pendingRef'),false);assert.match(h.messages[0],/동일한 가입 환경/);
 for(const alreadyApplied of [true,false]) {
  const h=referral({ok:true,status:200,json:async()=>({ok:true,alreadyApplied})},73);await h.run();
  assert.equal(h.c.window.UC,73);assert.equal(h.storage.has('pendingRef'),false);
 }
});
test('lost referral response preserves retry; an account switch cannot change another account balance or pending code',async()=>{
 const failed=referral(new Error('offline'));await failed.run();assert.ok(failed.storage.has('pendingRef'));assert.equal(failed.messages.length,1);
 let release;const h=referral({ok:true,status:200,json:()=>new Promise(r=>release=r)});
 const pending=h.run();await new Promise(r=>setImmediate(r));h.c.window.CU={uid:'another'};h.c.window.UC=8;
 release({ok:true});await pending;assert.equal(h.c.window.UC,8);assert.ok(h.storage.has('pendingRef'));assert.equal(h.messages.length,0);
});
test('queue cancellation survives long waits, running state uses server allowance and leaves a reason when closed',()=>{
 const nodes={lavJobCancel:{hidden:true},lavJobCancelHint:{textContent:''}},timers=new Map();let next=0;
 const c={$:id=>nodes[id],cancelWindowTimer:null,CANCEL_WINDOW_SEC:30,
  setTimeout:(fn,delay)=>{timers.set(++next,{fn,delay});return next;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(flow.slice(flow.indexOf('  function clearCancelWindow('),flow.indexOf('  function armCancelWindow(')),c);
 c.syncCancelState({status:'queued',elapsedSec:900,canCancel:true});
 assert.equal(nodes.lavJobCancel.hidden,false);assert.equal(timers.size,0);
 c.syncCancelState({status:'running',elapsedSec:4,canCancel:true,cancelRemainingSec:41});
 assert.equal(nodes.lavJobCancel.hidden,false);assert.equal([...timers.values()][0].delay,41000);
 [...timers.values()][0].fn();assert.equal(nodes.lavJobCancel.hidden,true);assert.match(nodes.lavJobCancelHint.textContent,/중단 가능 시간이 지났/);
 c.syncCancelState({status:'running',canCancel:false,cancelReason:'TRANSFORM_COMPLETION_IN_PROGRESS'});
 assert.match(nodes.lavJobCancelHint.textContent,/결과를 저장/);
 c.syncCancelState({status:'queued',canCancel:false});assert.equal(nodes.lavJobCancel.hidden,true);
});
