import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/evasion-flow.js',import.meta.url),'utf8');
function harness(){
 const nodes={},context={Number,Math,$:id=>nodes[id]||=( {} ),syncCancelState(){},stopFormalTicker(){},setActiveJobUi(){},setJobSteps(){}};
 vm.runInNewContext(source.slice(source.indexOf('  function lavQueueWaitText('),source.indexOf('  // 보고서에서 넘어온 글이면')),context);
 return {nodes,render:context.renderQueuedState};
}
test('recovery explains original mode, automatic resume and billing without fictitious queue ETA',()=>{
 const h=harness();h.render('fixture',{status:'queued',queueWaitReason:'provider_recovery',queueWaitSec:900,queueEtaSec:15,deducted:false});
 assert.match(h.nodes.lavJobTitle.textContent,/현재 요청 처리가 지연/);
 assert.doesNotMatch(h.nodes.lavJobTitle.textContent,/이용자가 많/);
 assert.match(h.nodes.lavStepSlot.textContent,/선택한 모드/);
 assert.match(h.nodes.lavStepSlot.textContent,/자동/);
 assert.match(h.nodes.lavStepSlot.textContent,/차감되지/);
 assert.doesNotMatch(h.nodes.lavStepSlot.textContent,/곧 시작|예상/);
 h.render('fixture',{queueWaitReason:'provider_recovery',deducted:true});
 assert.doesNotMatch(h.nodes.lavStepSlot.textContent,/차감되지/);
});
test('capacity backlog alone uses the busy-service notice',()=>{
 const h=harness();h.render('fixture',{queueWaitReason:'capacity',queueSize:3,queuePosition:2,queueEtaSec:80});
 assert.equal(h.nodes.lavJobTitle.textContent,'현재 이용자가 많아 처리가 지연되고 있습니다');
 h.render('fixture',{queueWaitReason:'connection_retry',queueSize:3,queueEtaSec:null});
 assert.doesNotMatch(h.nodes.lavJobTitle.textContent,/이용자가 많/);
});
