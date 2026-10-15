import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = file => fs.readFileSync(new URL('../assets/js/' + file, import.meta.url), 'utf8');
const main = read('app-main.js'), flow = read('evasion-flow.js'), feedback = read('ui-feedback.js');
const part = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end));
function startRuntime(recover = async () => false) {
 const messages=[], states=[], nodes={lavJobTitle:{textContent:''},lavStepSlot:{textContent:'',children:[],appendChild(x){this.children.push(x);}}};
 const storage=new Map();
 const c={pollGen:7,activeCancel:()=>{},stopFormalTicker(){},clearCancelWindow(){},setActiveJobUi:(id,status)=>states.push(status),clearActiveJobUi:()=>states.push('idle'),show:s=>states.push(s),alert:x=>messages.push(x),$:id=>nodes[id],document:{createElement:()=>({})},localStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{gpSessionSecurity:{tag:x=>({...x,ownerUid:'A'})},switchTab:s=>states.push(s)},recoverActiveTransformJob:recover,Date};
 vm.runInNewContext(part(flow,'  async function handleTransformStartError(','  // 폴링: 6초 간격'),c);
 return {c,messages,states,nodes,storage};
}
test('unknown transform admission recovers an active job without resubmission or no-charge assertion',async()=>{
 let reads=0;const h=startRuntime(async()=>{reads++;return true;});
 await h.c.handleTransformStartError(Object.assign(new Error('timeout'),{code:'REQUEST_TIMEOUT'}),'select',7);
 assert.equal(reads,1);assert.equal(h.states.includes('select'),false);assert.equal(h.states.includes('checking'),true);assert.equal(h.messages.length,0);
});
test('no active match still retains uncertainty, recovery actions and account-owned marker',async()=>{
 const h=startRuntime();await h.c.handleTransformStartError(new TypeError('fetch failed'),'select',7);
 assert.match(h.nodes.lavStepSlot.textContent,/이미 완료됐을 수/);assert.doesNotMatch(h.nodes.lavStepSlot.textContent,/차감되지|미차감/);
 assert.equal(h.nodes.lavStepSlot.children.length,3);assert.equal(JSON.parse(h.storage.get('lavStartPending')).ownerUid,'A');assert.equal(h.states.includes('select'),false);
});
test('late unknown-start recovery cannot overwrite a newer screen generation',async()=>{
 let release;const h=startRuntime(()=>new Promise(r=>release=r));const p=h.c.handleTransformStartError(new Error('network'),'select',7);
 h.c.pollGen++;release(false);await p;assert.equal(h.nodes.lavStepSlot.children.length,0);
});
test('no-charge statement is restricted to explicit server confirmation',async()=>{
 for(const charged of [undefined,0]){const h=startRuntime();await h.c.handleTransformStartError({httpStatus:400,message:'입력 확인',charged},'select',7);assert.equal(/차감되지/.test(h.messages[0]),charged===0);}
});
test('legacy transform stops polling and hands awaiting_payment to the shared recovery UI',async()=>{
 let polls=0;const remembered=[],resumed=[];
 const c={Date,setTimeout:fn=>{fn();return 1;},document:{getElementById:()=>null},window:{gpRememberTransformJob:(...x)=>remembered.push(x),gpResumeTransformState:(...x)=>resumed.push(x)},publicTransformMode:()=> 'polish',transformMinLength:()=>50,transformFetchJson:async(_a,url)=>url==='/transform'?{jobId:'job-A'}:(polls++,{status:'awaiting_payment',needed:20})};
 vm.runInNewContext(part(main,'async function callTransformJob(payload)','function combineChunkResults('),c);
 await assert.rejects(c.callTransformJob({authUser:{getIdToken(){}},text:'가'.repeat(100)}),e=>e.code==='TRANSFORM_PAYMENT_REQUIRED'&&e.jobId==='job-A');
 assert.equal(polls,1);assert.equal(resumed.length,1);assert.equal(resumed[0][1].status,'awaiting_payment');assert.ok(remembered.some(x=>x[1]==='awaiting_payment'));
});
function analyzeRuntime(fetch) {
 let ids=0;const c={window:{CU:{uid:'A'},apiUrl:x=>x,gpFetch:fetch},genReqId:()=>`req-${++ids}`,AbortController,globalThis:{},setTimeout:(fn,ms)=>{if(ms<10000)queueMicrotask(fn);return 1;},clearTimeout(){}};
 vm.runInNewContext(part(main,'async function callAnalyzeApi(payload, opts)','// 휴머나이징은 /transform job 하나로 통일한다.'),c);return c;
}
test('coupon automatic retries keep one nonempty idempotency key',async()=>{
 const requests=[];const c=analyzeRuntime(async(_u,o)=>{requests.push(JSON.parse(o.body));if(requests.length===1)throw new Error('lost response');return {status:200,json:async()=>({ok:true,result:{}})};});
 await c.callAnalyzeApi({mode:'detect',text:'synthetic text',billingMode:'coupon'});
 assert.equal(requests.length,2);assert.ok(requests[0].requestId);assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(c.window.gpLegacyDetectPending,null);
});
test('unknown detect outcome reuses its key for same input but never for another account',async()=>{
 const ids=[];const c=analyzeRuntime(async(_u,o)=>{ids.push(JSON.parse(o.body).requestId);throw new Error('lost');});
 const payload={mode:'detect',text:'same input',billingMode:'coupon'};
 await assert.rejects(c.callAnalyzeApi({...payload,requestId:'first'},{maxRetries:0}));
 await assert.rejects(c.callAnalyzeApi({...payload,requestId:'new'},{maxRetries:0}));
 c.window.CU={uid:'B'};await assert.rejects(c.callAnalyzeApi({...payload,requestId:'other'},{maxRetries:0}));
 assert.deepEqual(ids,['first','first','other']);
});
test('processing response keeps the same detect request for a later retry',async()=>{
 const ids=[];const c=analyzeRuntime(async(_u,o)=>{ids.push(JSON.parse(o.body).requestId);return ids.length===1?{status:202,json:async()=>({ok:false,error:'처리 중',code:'DETECT_REQUEST_PROCESSING',retryable:true})}:{status:200,json:async()=>({ok:true,result:{}})};});
 const payload={mode:'detect',text:'processing text',billingMode:'coupon'};
 await assert.rejects(c.callAnalyzeApi(payload,{maxRetries:0}),e=>e.status===202);
 await c.callAnalyzeApi(payload,{maxRetries:0});assert.equal(ids[0],ids[1]);assert.equal(c.window.gpLegacyDetectPending,null);
});
function toastRuntime(storage=new Map()) {
 let time=1000;const toasts=[];const c={window:{CU:{uid:'A'}},notificationOwner:'A',jobToastState:{owner:'',since:0,seen:{}},normalizeNotification:x=>x,now:()=>time,toast:(...x)=>toasts.push(x),Promise,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(part(feedback,'  function jobTransitionOwner()','  window.gpSetRemoteNotifications ='),c);
 return {c,toasts,advance:t=>time=t};
}
test('completion toasts skip initial history and show a new server transition only once',async()=>{
 const h=toastRuntime();const event=(id,createdAt)=>({id,clientId:id,type:'job_done',createdAt,read:false,message:'완료'});
 await h.c.notifyServerJobTransitions([event('job_event_old_1',999)]);assert.equal(h.toasts.length,0);
 h.advance(1100);const fresh=event('job_event_new_1',1100);await h.c.notifyServerJobTransitions([fresh]);await h.c.notifyServerJobTransitions([fresh]);assert.equal(h.toasts.length,1);
 await h.c.notifyServerJobTransitions([event('job_event_history_1',500)]);assert.equal(h.toasts.length,1);
 h.c.window.CU={uid:'B'};await h.c.notifyServerJobTransitions([fresh]);assert.equal(h.toasts.length,1);
});
test('two tabs do not re-toast an already claimed durable completion',async()=>{
 const store=new Map(),a=toastRuntime(store),b=toastRuntime(store);await a.c.notifyServerJobTransitions([]);await b.c.notifyServerJobTransitions([]);
 const event={id:'job_event_j_1',type:'job_done',createdAt:1100,read:false,message:'완료'};
 await a.c.notifyServerJobTransitions([event]);await b.c.notifyServerJobTransitions([event]);assert.equal(a.toasts.length+b.toasts.length,1);
});
test('verifier outage shows its actual cause and retries the original humanized text',async()=>{
 const source=read('writing-lab.js'),calls=[],results=[],buttons=[];
 const c={state:{pollToken:4,verificationToken:'proof',edited:false},window:{CU:{uid:'A'}},document:{createElement:()=>({})},el:()=>({appendChild:b=>buttons.push(b)}),setProgress(){},setStatus(){},setGenerationBusy(){},authHeaders:async()=>({}),finishResult:(text,report,options)=>results.push({text,report,options}),useSafeDraft(){},request:async(_url,opts)=>{calls.push(JSON.parse(opts.body));return calls.length===1?{release:{pass:true},text:'safe draft',delivery:{source:'verified_generation_fallback',fallbackReason:'verification_unavailable'}}:{release:{pass:true},text:'humanized',delivery:{source:'humanized'}};}};
 vm.runInNewContext(part(source,'async function finalCheck(',' function useSafeDraft('),c);
 await c.finalCheck('humanized',{draft:'safe draft'},4);
 assert.match(results[0].options.message,/검증 서비스/);assert.doesNotMatch(results[0].options.message,/기준을 벗어나/);assert.equal(buttons.length,1);
 await buttons[0].onclick();assert.equal(calls.length,2);assert.equal(calls[1].text,'humanized');assert.equal(calls[1].verificationToken,'proof');
});
test('verification retry never overwrites a user edit or a different signed-in account',async()=>{
 const source=read('writing-lab.js');let calls=0,button;
 const c={state:{pollToken:2,verificationToken:'proof',edited:true},window:{CU:{uid:'A'}},document:{createElement:()=>({})},el:()=>({appendChild:b=>button=b}),setStatus(){},setGenerationBusy(){},finalCheck:async()=>calls++};
 vm.runInNewContext(part(source,' function offerFinalCheckRetry(',' function useSafeDraft('),c);
 c.offerFinalCheckRetry('humanized',{},2);await button.onclick();assert.equal(calls,0);
 c.state.edited=false;c.window.CU={uid:'B'};await button.onclick();assert.equal(calls,0);
});

test('edits or account changes during final verification cannot publish a late response',async()=>{
 for(const change of ['edit','account']){
  let resolve,started;const startedPromise=new Promise(r=>started=r);const editor={value:'visible draft'},published=[];
  const c={state:{pollToken:2,verificationToken:'proof',edited:false},window:{CU:{uid:'A'}},el:()=>editor,setProgress(){},setStatus(){},setGenerationBusy(){},authHeaders:async()=>({}),finishResult:(...x)=>published.push(x),useSafeDraft:(...x)=>published.push(x),request:()=>{started();return new Promise(r=>resolve=r);}};
  vm.runInNewContext(part(read('writing-lab.js'),'async function finalCheck(',' function useSafeDraft('),c);
  const pending=c.finalCheck('humanized',{},2);await startedPromise;
  if(change==='edit'){editor.value='user revision';c.state.edited=true;}else c.window.CU={uid:'B'};
  resolve({release:{pass:true},text:'late result',delivery:{source:'humanized'}});await pending;
  assert.equal(published.length,0);if(change==='edit')assert.equal(editor.value,'user revision');
 }
});

test('account switch during transform recovery discards the old owner response',async()=>{
 let resolve,started,reads=0;const startedPromise=new Promise(r=>started=r),resumed=[];
 const c={pollGen:3,window:{CU:{uid:'A'},apiUrl:x=>x},evGetIdToken:async()=> 'A-token',evAuthHeaders:x=>({Authorization:x}),fetch:()=>{reads++;started();return new Promise(r=>resolve=r);},resumeTransformState:(...x)=>resumed.push(x)};
 vm.runInNewContext(part(flow,'  async function recoverActiveTransformJob(','  function renderPaymentRequired('),c);
 const pending=c.recoverActiveTransformJob(3);await startedPromise;assert.equal(reads,1);c.window.CU={uid:'B'};
 resolve({ok:true,json:async()=>({ok:true,job:{id:'A-private-job',status:'done'}})});
 assert.equal(await pending,false);assert.equal(resumed.length,0);
});

test('legacy detect and transform responses are fenced after account invalidation',async()=>{
 let resolve,started;let startedPromise=new Promise(r=>started=r);
 const detect=analyzeRuntime(()=>{started();return new Promise(r=>resolve=r);});
 const pending=detect.callAnalyzeApi({mode:'detect',text:'private source',billingMode:'coupon'},{maxRetries:0});await startedPromise;
 detect.window.gpSessionEpoch=1;resolve({status:200,json:async()=>({ok:true,result:{detail:'private result'}})});
 await assert.rejects(pending,e=>e.code==='ACCOUNT_CHANGED');
 const resumed=[],remembered=[];startedPromise=new Promise(r=>started=r);
 const c={Date,setTimeout:fn=>{fn();return 1;},document:{getElementById:()=>null},window:{CU:{uid:'A'},gpRememberTransformJob:(...x)=>remembered.push(x),gpResumeTransformState:(...x)=>resumed.push(x)},publicTransformMode:()=> 'polish',transformMinLength:()=>50,transformFetchJson:async(_a,url)=>url==='/transform'?{jobId:'job-A'}:(started(),new Promise(r=>resolve=r))};
 vm.runInNewContext(part(main,'async function callTransformJob(payload)','function combineChunkResults('),c);
 const transform=c.callTransformJob({authUser:{uid:'A',getIdToken(){}},text:'가'.repeat(100)});await startedPromise;c.window.CU={uid:'B'};
 resolve({status:'awaiting_payment',needed:20});await assert.rejects(transform,e=>e.code==='ACCOUNT_CHANGED');
 assert.equal(resumed.length,0);assert.equal(remembered.length,1);
});

test('writing recovery resumes only the stored request after a server resumable signal',async()=>{
 const calls=[];const c={Date,encodeURIComponent,state:{pollToken:2},sleep:async()=>{},authHeaders:async()=>({}),setStatus(){},readPending:()=>({requestId:'saved-job',form:{genre:'general',answers:{fact:'saved fact'}},assessmentToken:'saved-assessment',shortMode:true}),request:async(path,opts)=>{calls.push({path,opts});return calls.length===1?{status:'PROCESSING',resumable:true}:{draft:'exact staged draft'};}};
 vm.runInNewContext(part(read('writing-lab.js'),' async function pollWritingGeneration(','async function startHumanize('),c);
 const result=await c.pollWritingGeneration('saved-job',2);assert.equal(result.draft,'exact staged draft');assert.equal(calls.length,2);
 const posted=JSON.parse(calls[1].opts.body);assert.equal(posted.requestId,'saved-job');assert.equal(posted.assessmentToken,'saved-assessment');assert.equal(posted.answers.fact,'saved fact');
});

test('writing request guards preserve the owner of headers across account changes',async()=>{
 let resolve;const c={window:{CU:{uid:'A',getIdToken:async()=> 'A-token'}},headerOwners:new WeakMap(),api:x=>x,fetch:()=>new Promise(r=>resolve=r)};
 vm.runInNewContext(part(read('writing-lab.js'),' async function authHeaders(',' function emitClientEvent('),c);
 const headers=await c.authHeaders(false);const pending=c.request('/private',{headers});c.window.CU={uid:'B'};
 resolve({ok:true,json:async()=>({ok:true,candidates:['A-private-text']})});await assert.rejects(pending,e=>e.code==='ACCOUNT_CHANGED');
 await assert.rejects(c.request('/private',{headers}),e=>e.code==='ACCOUNT_CHANGED');
});
