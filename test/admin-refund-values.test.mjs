import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/app-module.js',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../assets/js/refund-accounting.js',import.meta.url),'utf8');
const order=()=>({uid:'test-user',status:'refund_requested',amount:14500,paidCredits:500,totalGrantedCredits:650,
  creditGrantPolicyVersion:'credit-grant-base-v1',creditLotPolicyVersion:'credit-lot-v1',
  refundPaidCreditsRemaining:0,refundEventBonusCreditsRemaining:0,
  refundProcessing:{kind:'credit',phase:'requested_reserved',refundAmount:11600,creditsToDeduct:550,
    priorRefundedAmount:0,creditLotPolicyVersion:'credit-lot-v1',reservedPaidCredits:400,reservedBonusCredits:150}});

function environment(rows=[order()]) {
 const list={innerHTML:''};let reads=0,count;
 const ctx={window:{isAdmin:()=>true},document:{getElementById:id=>id==='adminRefundList'?list:null},
  db:{},console,SUB_TIER_LABELS:{},escapeHtml:String,jsAttr:String,
  collection:(_db,name)=>name,where:(...args)=>args,query:(name,...args)=>({name,args}),
  doc:(_db,...parts)=>parts.join('/'),
  getDocs:async q=>({docs:q.name==='orders'?rows.map((data,i)=>({id:'order-'+i,data:()=>data})):[]}),
  getDoc:async()=>{reads++;return {exists:()=>true,data:()=>({email:'synthetic@example.invalid',credits:0})};},
  adminSetRefundStat:n=>{count=n;},adminRefundQuotes:new Map()};
 vm.createContext(ctx);vm.runInContext(core,ctx);ctx.window.GPRefundAccounting=ctx.GPRefundAccounting;
 const start=source.indexOf('function adminPendingRefund('),end=source.indexOf('const adminRefundPending',start);
 vm.runInContext(source.slice(start,end),ctx);
 return {ctx,list,reads:()=>reads,count:()=>count};
}
test('actual refund list renders reserved amount and credits even when wallet and lot are zero',async()=>{
 const e=environment([order(),order()]);await e.ctx.window.loadAdminRefundList();
 assert.match(e.list.innerHTML,/11,600원/);assert.match(e.list.innerHTML,/이미 예약된 <b>550<\/b>크레딧/);
 assert.match(e.list.innerHTML,/기준 사용 <b>100<\/b>/);assert.match(e.list.innerHTML,/중복 차감하지 않습니다/);
 assert.equal(e.reads(),1);assert.equal(e.count(),2);
});
test('missing snapshots show unknown rather than current-wallet zero or a fabricated full refund',async()=>{
 const e=environment([{uid:'test-user',status:'refund_requested',amount:14500,totalGrantedCredits:650}]);
 await e.ctx.window.loadAdminRefundList();assert.match(e.list.innerHTML,/환불 예정 <b class="neg">확인 필요<\/b>/);
 assert.doesNotMatch(e.list.innerHTML,/class="neg">0원/);
});
test('settled totals use server projection zero instead of pending cancellation targets',()=>{
 const e=environment();assert.equal(e.ctx.adminSettledRefund({confirmedRefundAmount:0,refundedAmount:11600,refundAmount:11600}),0);
 assert.equal(e.ctx.adminSettledRefund({amount:14500,refundedAmount:11600,refundProcessing:{priorRefundedAmount:0}}),0);
});
test('refund request counts include processing and do not omit old requests lacking createdAt',()=>{
 const block=source.slice(source.indexOf('window.loadAdminRefundSummary'),source.indexOf('const adminRefundPending'));
 assert.doesNotMatch(block,/orderBy\('createdAt'/);assert.match(block,/'refund_processing'/);
});
test('nullable lot metadata and other-order credits do not create a wrong direct refund estimate',()=>{
 const e=environment();const start=source.indexOf("const REFUND_POLICY_VERSION = 'credit-grant-base-v1';"),end=source.indexOf('// 두 컬렉션의 결제 내역 통합 조회',start);
 vm.runInContext(source.slice(start,end),e.ctx);
 const base={amount:14500,paidCredits:500,totalGrantedCredits:650,bonusCredits:150,creditGrantPolicyVersion:'credit-grant-base-v1',creditLotPolicyVersion:'credit-lot-v1',refundPaidCreditsRemaining:null,refundEventBonusCreditsRemaining:null};
 assert.equal(e.ctx.gpCreditRefundPreview(base,550).refundAmount,11600);
 assert.equal(e.ctx.gpCreditRefundPreview({amount:10000,safeCredits:1000},900,800).refundAmount,1000);
});
