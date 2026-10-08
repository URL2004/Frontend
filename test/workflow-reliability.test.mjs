import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => fs.readFileSync(new URL('../assets/js/'+name,import.meta.url),'utf8');
const main=read('app-main.js');
const pdfSource=main.slice(main.indexOf('let pdfJsPromise = null;'),main.indexOf('window.gpCancelPdfImport = clearPDF;')+'window.gpCancelPdfImport = clearPDF;'.length);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function pdfRuntime(options={}) {
 const editor={id:'lavInput',value:'기존 본문',disabled:false};
 const nodes={lavInput:editor,lavRunButton:{disabled:false},pdfImportStatus:{textContent:'',hidden:true},pdfImportCancel:{hidden:true},pdfInput:{value:'chosen'}};
 const observations=[]; let confirmCalls=0,destroyed=0;
 const pages=options.pages || ['한글 본문 '.repeat(30)];
 const pdf={numPages:pages.length,getPage:async i=>({getTextContent:()=>options.pagePending?new Promise(()=>{}):Promise.resolve({items:pages[i-1]?[{str:pages[i-1],transform:[1,0,0,1,10,10],width:10,height:10}]:[]})}),destroy:()=>{destroyed++;return options.destroyPending?new Promise(()=>{}):Promise.resolve();}};
 const lib={getDocument:()=>({promise:options.invalid?Promise.reject(Object.assign(new Error('Invalid PDF structure'),{name:'InvalidPDFException'})):Promise.resolve(pdf),destroy:async()=>{destroyed++}})};
 const c={window:{gpConfirm:async()=>{confirmCalls++;return !!options.acceptPartial},lavSyncCount(){},gpReportWorkflowIssue:x=>observations.push(x)},document:{getElementById:id=>nodes[id]||null,createElement:()=>({}),head:{appendChild(){}}},Date,Promise,Set,AbortController,console,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,20)),clearTimeout,updateCount(){},lib};
 vm.createContext(c);vm.runInContext(read('pdf-text-layout.js'),c);c.window.GPPdfTextLayout=c.GPPdfTextLayout;vm.runInContext(pdfSource,c);
 if(!options.loaderPending)vm.runInContext('pdfJsPromise=Promise.resolve(lib)',c);
 const file={name:'test.pdf',size:1000,type:'application/pdf',arrayBuffer:()=>options.filePending?new Promise(()=>{}):Promise.resolve(new ArrayBuffer(0))};
 return {c,editor,nodes,file,observations,get confirms(){return confirmCalls},get destroyed(){return destroyed}};
}
test('24 pages import and exactly 30,000 characters remain allowed',async()=>{
 for(const pages of [Array(24).fill('가'.repeat(1000)),['가'.repeat(30000)]]){
  const h=pdfRuntime({pages});await h.c.extractAndFillFromPdf(h.file);assert.equal(h.editor.value,pages.join('\n\n'));assert.equal(h.editor.disabled,false);assert.equal(h.destroyed,1);
 }
});
test('oversize text, page count, scanned PDF and parser failure preserve the draft',async()=>{
 for(const options of [{pages:['가'.repeat(30001)]},{pages:Array(101).fill('가')},{pages:Array(24).fill('')},{invalid:true}]){
  const h=pdfRuntime(options);await h.c.extractAndFillFromPdf(h.file);assert.equal(h.editor.value,'기존 본문');assert.equal(h.editor.disabled,false);assert.match(h.nodes.pdfImportStatus.textContent,/기존 입력은 유지/);assert.equal(h.nodes.pdfImportStatus.hidden,false);
 }
});
test('loader, file read and page read have a bounded deadline and cleanup cannot hang the UI',async()=>{
 for(const options of [{loaderPending:true},{filePending:true},{pagePending:true},{pages:Array(101).fill('가'),destroyPending:true}]){
  const h=pdfRuntime(options);await h.c.extractAndFillFromPdf(h.file);assert.equal(h.editor.disabled,false);assert.equal(h.editor.value,'기존 본문');assert.equal(h.nodes.lavRunButton.disabled,false);assert.ok(h.observations.some(x=>x.code!=='PDF_IMPORTED'));
 }
});
test('mixed text/image PDF requires consent before replacing existing input',async()=>{
 for(const accepted of [false,true]){
  const h=pdfRuntime({pages:[...Array(23).fill(''),'가'.repeat(200)],acceptPartial:accepted});await h.c.extractAndFillFromPdf(h.file);
  assert.equal(h.confirms,1);assert.equal(h.editor.value,accepted?'가'.repeat(200):'기존 본문');assert.equal(h.editor.disabled,false);
 }
});
test('late failure from an old import cannot erase a newer successful import',async()=>{
 const h=pdfRuntime();vm.runInContext('extractPdfText=async(file,d)=>{d.emptyPages=[];d.reviewCodes=[];return file.pending}',h.c);
 const old=deferred();const first=h.c.extractAndFillFromPdf({pending:old.promise});await h.c.extractAndFillFromPdf({pending:Promise.resolve('새로운 본문 '.repeat(30))});old.reject(new Error('late'));await first;assert.match(h.editor.value,/새로운 본문/);assert.equal(h.editor.disabled,false);
});
test('cancel frees input immediately and an old reply cannot overwrite it',async()=>{
 const h=pdfRuntime({filePending:true});const pending=h.c.extractAndFillFromPdf(h.file);assert.equal(h.nodes.lavRunButton.disabled,true);h.c.window.gpCancelPdfImport();await pending;assert.equal(h.editor.disabled,false);assert.equal(h.editor.value,'기존 본문');assert.equal(h.c.window.gpPdfBusy,false);
});
test('file preflight preserves input and reports only bounded metadata',()=>{
 for(const props of [{size:0},{size:11*1024*1024},{name:'file.txt',type:'text/plain'}]){
  const h=pdfRuntime();h.c.handlePDF({files:[{...h.file,...props}],value:'chosen'});assert.equal(h.editor.value,'기존 본문');assert.equal(h.editor.disabled,false);assert.equal(h.observations.length,1);assert.equal('name' in h.observations[0],false);assert.equal('message' in h.observations[0],false);
 }
});
test('transport bounds stalled fetch and stalled response body without claiming remote failure',async()=>{
 const src=read('api.js').slice(read('api.js').indexOf('// A transport deadline'));
 for(const fetch of [()=>new Promise(()=>{}),async()=>({arrayBuffer:()=>new Promise(()=>{})})]){
  const c={window:{fetch},AbortController,Response,setTimeout,clearTimeout,Promise};vm.runInNewContext(src,c);await assert.rejects(c.window.gpFetch('/transform/123',{timeoutMs:5}),e=>e.code==='REQUEST_TIMEOUT'&&!/차감하지/.test(e.message));
 }
 const c={window:{fetch:async()=>new Response(JSON.stringify({ok:true}),{status:200})},AbortController,Response,setTimeout,clearTimeout,Promise};vm.runInNewContext(src,c);assert.deepEqual(await (await c.window.gpFetch('/ok')).json(),{ok:true});
});
test('negative completion messages are never classified as success',()=>{
 const src=read('ui-feedback.js');const c={};vm.runInNewContext(src.slice(src.indexOf('  function inferType('),src.indexOf('  function ensureShell(')),c);
 assert.equal(c.inferType('로그인을 완료하지 못했어요.'),'error');assert.equal(c.inferType('작업을 완료했어요.'),'success');
});
test('pending notifications retry idempotently and account changes isolate local state',async()=>{
 const src=read('ui-feedback.js');const storage=new Map();let calls=0,allow=false;
 const c={window:{addEventListener(){},persistUserNotification:async()=>{calls++;return allow}},document:{},notificationOwner:'',localKey:'',notificationMemory:[],notificationStorageUnavailable:false,notificationSyncing:false,notificationRetryTimer:null,floatQueue:[],floatShownIds:{},floatOwner:'',remoteItems:[],localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},clearTimeout,setTimeout:()=>1,$:()=>null,ensureShell(){},renderNotifications(){},normalizeNotification:x=>x,id:()=>String(Math.random()),now:Date.now,toast(){}};
 vm.createContext(c);vm.runInContext(src.slice(src.indexOf('  function getLocalItems()'),src.indexOf('  function normalizeNotification(')),c);
 vm.runInContext(src.slice(src.indexOf('  window.gpSetNotificationOwner ='),src.indexOf('  window.gpSetRemoteNotifications =')),c);c.window.gpNotificationConnection=()=>{};
 c.window.gpSetNotificationOwner('A');c.window.gpNotify({clientId:'job_failed_1',type:'job_failed',message:'문제 확인'});await new Promise(r=>setImmediate(r));assert.equal(c.getLocalItems()[0].syncState,'pending');allow=true;await c.window.gpFlushNotifications();assert.equal(c.getLocalItems()[0].syncState,'synced');assert.equal(calls,2);
 c.window.gpSetNotificationOwner('B');assert.equal(c.getLocalItems().length,0);c.window.gpSetNotificationOwner('');assert.equal(c.getLocalItems().length,0);c.window.gpSetNotificationOwner('A');assert.equal(c.getLocalItems().length,1);
});
