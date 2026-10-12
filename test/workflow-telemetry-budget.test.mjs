import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../assets/js/api.js',import.meta.url),'utf8');
const script=source.slice(source.indexOf('  var workflowRetryAt ='),source.lastIndexOf('})();'));
test('event rate limits and duplicate failures do not create an error-report storm',async()=>{
  let calls=0,time=1000000,status=429;const sent=[];
  const c={Date:class extends Date {static now(){return time;}},window:{apiUrl:x=>x,gpFetch:async(url,opts)=>{
    calls++;sent.push(JSON.parse(opts.body));return {status,headers:{get:()=> '120'}};
  }}};vm.createContext(c);vm.runInContext(script,c);
  const event={feature:'notification',code:'NOTIFICATION_PERSIST_FAILED',stage:'persist',text:'private text'};
  c.window.gpReportWorkflowIssue(event);c.window.gpReportWorkflowIssue(event);
  await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal('text' in sent[0],false);
  time+=61000;c.window.gpReportWorkflowIssue({...event,code:'PDF_IMPORTED'});assert.equal(calls,1);
  time+=60000;status=200;c.window.gpReportWorkflowIssue(event);await new Promise(r=>setImmediate(r));assert.equal(calls,2);
});
