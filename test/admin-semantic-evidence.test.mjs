import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/js/app-module.js',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function escapeHtml('),source.indexOf('window.escapeHtml ='))
  +source.slice(source.indexOf('function adminLedgerDetailPairs('),source.indexOf('function adminRenderLedgerDetail(')),context);
const render=context.adminSemanticEvidence;

test('missing and stale evidence do not become a passing semantic verdict',()=>{
  assert.match(render(undefined),/저장되지 않았습니다.*통과를 뜻하지 않습니다/);
  assert.match(render({available:false,reason:'output_changed'}),/이전 판정을 현재 결과의 근거로 사용할 수 없습니다/);
});

test('private evidence renders escaped quotes, historical stages and explicit truncation',()=>{
  const injected='<img src=x onerror="alert(1)">';
  const html=render({available:true,status:'uncertain',candidateDigest:'a'.repeat(64),version:'semantic-evidence-v1',
    decisionReason:injected,truncated:true,omittedFindings:2,omittedReviews:3,windows:[{index:0,status:'uncertain',model:injected,
      findings:[{stage:'initial',type:'distortion',origin:'introduced',source:{text:injected,truncated:true},candidate:{text:'결과'},detail:{text:'과거 판정'}}],
      reviews:[{status:injected,uncertaintyReasons:['operator_pair_mismatch'],rejectedResponse:{source:{text:injected},detail:{text:'검증 실패'}}}]}]});
  assert.doesNotMatch(html,/<img|<script/u);
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html,/판단 보류/);assert.match(html,/수리 전 지적/);assert.match(html,/앞부분 발췌/);
  assert.match(html,/현재 결과의 오류를 뜻하지 않습니다/);
  assert.match(html,/지적 2건, 검토 3건/);assert.match(html,/operator_pair_mismatch/);
});

test('empty finding list preserves incomplete status rather than inferring pass',()=>{
  const html=render({available:true,status:'incomplete',windows:[{index:1,status:'incomplete',findings:[],reviews:[]}]});
  assert.match(html,/검사 미완료/);assert.match(html,/검사 상태를 함께 확인/);assert.doesNotMatch(html,/· 통과/);
});
