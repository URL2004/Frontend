import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../'+p,import.meta.url),'utf8');
test('장애 공지는 메인 상단에서 사과와 미확정 보상 안내를 제공한다',async()=>{
 const html=await read('pages/main.html');
 const banner=html.slice(html.indexOf('<aside class="gp-service-notice"'),html.indexOf('<section class="gp-lav-hero"'));
 assert.match(banner,/불편을 드려 죄송합니다/);
 assert.match(banner,/대상·수량·일정은 별도로 안내/);
 assert.match(banner,/aria-labelledby="gpServiceNoticeTitle"/);
 assert.match(banner,/aria-label="정상화 안내 닫기"/);
 assert.match(banner,/humanize-20261002-resolved/);
 assert.match(banner,/현재는 정상적으로 이용하실 수 있습니다/);
 assert.doesNotMatch(banner,/지급했습니다|\d+크레딧/);
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
