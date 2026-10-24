import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/evasion-flow.js',import.meta.url),'utf8');
const actions=source.slice(source.indexOf('  function resultActionNotice('),source.indexOf('  // ── 결과 .md 파일 다운로드'));
function setup(clipboard) {
 const notices=[],events=[],timers=[];
 const body={textContent:'제목\n  보완한 첫 문단입니다.\n\n항목\t값\n마지막 문단입니다.\n'};
 const input={value:'변환 전 원문',dispatchEvent:e=>events.push(e.type),focus(){this.focused=true;}};
 const ctx={window:{gpToast:message=>notices.push(message),lavFlowReset:()=>true,lavSetMode:mode=>{ctx.mode=mode;}},
  navigator:{clipboard},$:id=>id==='lavDoneBody'?body:id==='lavInput'?input:null,
  Event:class{constructor(type){this.type=type;}},setTimeout:fn=>timers.push(fn),lavRefineBusy:false,detectPending:false,resultPreviewSource:null};
 vm.createContext(ctx);vm.runInContext(actions,ctx);
 return {ctx,body,input,notices,events,timers};
}
test('result transfer copies all current text including tabs and paragraphs without starting a paid request',()=>{
 const h=setup();let requests=0;h.ctx.window.lavDetect=()=>requests++;
 assert.equal(h.ctx.window.lavDoneDetect(),true);
 assert.equal(h.input.value,h.body.textContent);assert.equal(h.ctx.resultPreviewSource,'변환 전 원문');
 assert.equal(h.ctx.mode,'detect');assert.equal(requests,0);assert.deepEqual(h.events,['input']);assert.equal(h.input.focused,true);
 assert.match(h.notices[0],/비용 확인/);
 h.body.textContent+='문단 보강의 최신 결과입니다.';
 h.ctx.window.lavDoneDetect();assert.equal(h.input.value,h.body.textContent);assert.equal(h.ctx.resultPreviewSource,'변환 전 원문');
});
test('busy detection, refinement, active jobs and empty results preserve the editor',()=>{
 for(const block of [h=>h.ctx.detectPending=true,h=>h.ctx.lavRefineBusy=true,h=>h.ctx.window.lavFlowReset=()=>false,h=>h.body.textContent='  ']){
  const h=setup();block(h);assert.equal(h.ctx.window.lavDoneDetect(),false);assert.equal(h.input.value,'변환 전 원문');assert.equal(h.ctx.mode,undefined);
 }
});
test('copy reports success only after clipboard write resolves and transfers the full result',async()=>{
 let resolve,written;const h=setup({writeText:text=>{written=text;return new Promise(r=>resolve=r);}});
 const btn={textContent:'복사',disabled:false};const pending=h.ctx.window.lavDoneCopy(btn);
 assert.equal(btn.disabled,true);assert.equal(btn.textContent,'복사');assert.equal(await h.ctx.window.lavDoneCopy(btn),false);
 assert.equal(written,h.body.textContent);resolve();assert.equal(await pending,true);assert.equal(btn.textContent,'복사됨');assert.equal(btn.disabled,false);
 h.timers[0]();assert.equal(btn.textContent,'복사');
});
test('clipboard rejection, unavailable API and synchronous errors show recovery without fake success',async()=>{
 for(const clipboard of [undefined,{}, {writeText:()=>Promise.reject(new Error('denied'))},{writeText:()=>{throw new Error('denied');}}]){
  const h=setup(clipboard),btn={textContent:'복사',disabled:false};assert.equal(await h.ctx.window.lavDoneCopy(btn),false);
  assert.equal(btn.textContent,'복사');assert.equal(btn.disabled,false);assert.match(h.notices[0],/다운로드/);
 }
});
test('repeated successful copies restore the original label after feedback timers',async()=>{
 const h=setup({writeText:()=>Promise.resolve()}),btn={textContent:'복사',disabled:false};
 assert.equal(await h.ctx.window.lavDoneCopy(btn),true);
 assert.equal(await h.ctx.window.lavDoneCopy(btn),true);
 for(const timer of h.timers)timer();
 assert.equal(btn.textContent,'복사');
});
