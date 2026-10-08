import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../'+p,import.meta.url),'utf8');
test('종료된 보상 안내는 메인화면에 노출하지 않는다',async()=>{
 const html=await read('pages/main.html');
 assert.doesNotMatch(html,/id="gpServiceNotice"|humanize-20261002-compensated|휴머나이징 정상화 및 보상 안내/);
});
test('공지는 닫기·탭 전환·상태 변경을 분리하고 저장소 실패에도 동작한다',async()=>{
 const source=await read('assets/js/main-designs.js');
 const logic=source.slice(source.indexOf('  var lavTab = null;'),source.indexOf('  function detectTab()'));
 const notice={dataset:{noticeVersion:'incident-A'},hidden:false};
 const saved=new Map();
 const ctx={window:{},document:{getElementById:()=>notice},sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}};
 vm.createContext(ctx);vm.runInContext(logic,ctx);
 vm.runInContext("lavTab='main';syncServiceNotice()",ctx);assert.equal(notice.hidden,false);
 ctx.window.gpDismissServiceNotice();assert.equal(notice.hidden,true);
 vm.runInContext('syncServiceNotice()',ctx);assert.equal(notice.hidden,true);
 notice.dataset.noticeVersion='incident-B';vm.runInContext('syncServiceNotice()',ctx);assert.equal(notice.hidden,false);
 vm.runInContext("lavTab='history';syncServiceNotice()",ctx);assert.equal(notice.hidden,true);
 ctx.sessionStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 vm.runInContext("lavTab='main';syncServiceNotice()",ctx);ctx.window.gpDismissServiceNotice();
 vm.runInContext('syncServiceNotice()',ctx);assert.equal(notice.hidden,true);
});
test('모바일 공지는 입력을 덮지 않으며 hidden 가드를 유지한다',async()=>{
 const css=await read('assets/css/redesign.css');
 assert.match(css,/\.gp-service-notice\[hidden\]\{display:none!important;\}/);
 assert.match(css,/@media\(max-width:960px\)\{\s*\.gp-service-notice\{position:relative;top:auto/);
});
