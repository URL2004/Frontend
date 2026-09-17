import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/app-module.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function renderCreatedCoupons('),source.indexOf('window.adminCreateCoupons ='));
function setup(fail=false){
 const copied=[],downloads=[];
 const element=tag=>({tag,children:[],attrs:{},disabled:false,append(...nodes){this.children.push(...nodes)},appendChild(node){this.children.push(node)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attrs[k]=v},focus(){this.focused=true},select(){this.selected=true},remove(){},click(){downloads.push(this.download)}});
 const result=element('div');
 const context={document:{createElement:element,body:element('body')},adminWriteClipboardText:async text=>{if(fail)throw Error('denied');copied.push(text)},Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:fn=>fn()};
 vm.runInNewContext(helper,context);context.renderCreatedCoupons(result,{credits:20,batchId:'test',codes:[{display:'TEST-AAAA-2222'},{display:'TEST-BBBB-3333'}]});
 return{result,copied,downloads};
}
test('coupon tools copy all and individual codes without metadata',async()=>{
 const h=setup();const [summary,tools,status,,list]=h.result.children;
 assert.match(summary.textContent,/2개/);await tools.children[0].onclick();
 assert.equal(h.copied[0],'TEST-AAAA-2222\nTEST-BBBB-3333');
 await list.children[1].children[1].onclick();assert.equal(h.copied[1],'TEST-BBBB-3333');
 assert.equal(status.attrs['aria-live'],'polite');assert.equal(list.children[1].children[1].disabled,false);
 tools.children[1].onclick();tools.children[2].onclick();assert.deepEqual(h.downloads,['coupons-test.txt','coupons-test.csv']);
});
test('coupon tools expose selected manual copy fallback on clipboard denial',async()=>{
 const h=setup(true);const [,tools,status,fallback]=h.result.children;
 await tools.children[0].onclick();assert.equal(fallback.hidden,false);assert.equal(fallback.selected,true);
 assert.equal(fallback.value,'TEST-AAAA-2222\nTEST-BBBB-3333');assert.match(status.textContent,/직접 복사/);
 assert.equal(tools.children[0].disabled,false);
});
