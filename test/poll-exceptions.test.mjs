import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => fs.readFileSync(new URL('../assets/js/'+name,import.meta.url),'utf8');

test('three server errors pause polling with recovery while retaining the job reference',async()=>{
 const src=read('evasion-flow.js');const start=src.indexOf('  async function pollTransform('),end=src.indexOf('\n  }',start)+4;let calls=0,retry=false;
 const c={window:{apiUrl:x=>x},Date,Promise,pollGen:1,evGetIdToken:async()=> 'token',evAuthHeaders:()=>({}),setTimeout:f=>f(),fetch:async()=>{calls++;return {status:503,json:async()=>({error:'temporary'})}},stopFormalTicker(){},showPollIssue:(_id,_message,canRetry)=>{retry=canRetry},clearJobRef:()=>{throw Error('Must retain remote job')},clearActiveJobUi:()=>{throw Error('Must retain active UI')}};
 vm.createContext(c);vm.runInContext(src.slice(start,end),c);await c.pollTransform('existing',1);assert.equal(calls,3);assert.equal(retry,true);
});

test('writing lab exposes actionable and unknown states instead of losing its draft',async()=>{
 const src=read('writing-lab.js');const start=src.indexOf(' async function pollHumanize('),end=src.indexOf('async function finalCheck(',start);
 for(const status of ['awaiting_payment','awaiting_approval','unknown','auth_failure']){
  const saved=[],actions=[];const c={Date,state:{pollToken:1},authHeaders:async()=>{if(status==='auth_failure')throw Error('expired');return{}},sleep:async()=>{},api:x=>x,fetch:async()=>({status:200,ok:true,json:async()=>({status})}),saveActive:(_g,id,phase)=>saved.push({id,phase}),showHumanizeAction:(id,job)=>actions.push({id,status:job.status}),useSafeDraft:()=>{throw Error('Unconfirmed failure must retain job')}};
  vm.createContext(c);vm.runInContext(src.slice(start,end),c);await c.pollHumanize('saved-job',1,{draft:'safe'});assert.equal(saved[0].id,'saved-job');assert.equal(actions[0].status,status.startsWith('awaiting_')?status:'checking');
 }
});
