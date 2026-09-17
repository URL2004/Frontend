import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/app-module.js',import.meta.url),'utf8');
const start=source.indexOf('window.adminCreateCoupons =');
const handler=source.slice(start,source.indexOf('\n};',start)+3);

async function submit(credits,count) {
  const nodes={couponCredits:{value:credits},couponCount:{value:count},couponExpires:{value:''},couponCreateMsg:{style:{}},couponCreateResult:{},adminCouponCreateButton:{disabled:false}};
  let body;
  const context={window:{CU:{getIdToken:async()=> 'mock'},isAdmin:()=>true},document:{getElementById:id=>nodes[id]},COUPON_API:'https://example.invalid',bearerJsonHeaders:()=>({}),adminSetBusy:()=>{},fetch:async(url,opts)=>{body=JSON.parse(opts.body);return{ok:false,json:async()=>({error:'test response'})};}};
  vm.runInNewContext(handler,context); await context.window.adminCreateCoupons(); return {body,message:nodes.couponCreateMsg.textContent};
}
test('coupon form rejects truncated inputs and limits before network requests',async()=>{
  for(const value of ['1.9','2abc','1e2','0x10','','0','-1','9007199254740992']) {
    assert.equal((await submit(value,'2')).body,undefined);
    assert.equal((await submit('20',value)).body,undefined);
  }
  assert.equal((await submit('10001','1')).body,undefined);
  assert.equal((await submit('1','401')).body,undefined);
});
test('coupon form sends exact valid integer values',async()=>{
  assert.deepEqual((await submit(' 20 ','2')).body,{credits:20,count:2});
  assert.deepEqual((await submit('10000','400')).body,{credits:10000,count:400});
});
