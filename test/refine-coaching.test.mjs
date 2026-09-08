import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/evasion-flow.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('  var lavRefineJobId ='), source.indexOf('  async function lavRefineSubmit('));
const submitter = source.slice(source.indexOf('  async function lavRefineSubmit('), source.indexOf('  function pollRefine('));
function setup() {
  const nodes = new Map(); let active;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.hidden = false; this.className = ''; this.value = ''; this._text = ''; }
    set id(value) { this._id = value; nodes.set(value, this); } get id() { return this._id; }
    set textContent(value) { this._text = value; this.children = []; } get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set innerHTML(value) { assert.equal(value, ''); this._text = ''; this.children = []; }
    appendChild(child) { this.children.push(child); }
    setAttribute(k, v) { this.attrs[k] = v; } removeAttribute(k) { delete this.attrs[k]; }
    focus() { active = this; } scrollIntoView() {}
    classList = { add: name => { this.className += ' ' + name; }, remove() {}, toggle() {} };
    querySelector(selector) { return this.all().find(e => selector[0] === '.' ? e.className.split(' ').includes(selector.slice(1)) : e.tag === selector) || null; }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
  }
  for (const id of ['lavDoneBody', 'lavDoneRefine', 'lavDoneRefineList', 'lavDoneRefineOk']) { const e = new Element('div'); e.id = id; }
  const lead = new Element('p'); lead.className = 'lav-refine-lead'; nodes.get('lavDoneRefine').appendChild(lead);
  const ctx = { document: { createElement: tag => new Element(tag), createTextNode: text => { const e = new Element('#text'); e.textContent = text; return e; }, querySelector: () => null },
    window: {}, $: id => nodes.get(id), setTimeout: () => {}, evGetIdToken: async () => 'synthetic-token',
    evAuthHeaders: () => ({}), fetch: async () => { throw new Error('unexpected network'); } };
  vm.createContext(ctx); vm.runInContext(renderer + submitter, ctx); ctx.lavRefineJobId = 'job-a';
  const target = { index: 1, snippet: '<script>synthetic</script>', credit: 10, coaching: { version: 1, title: '관찰한 결과를 알려주세요', question: '어떤 변화를 확인했나요?', placeholder: '기억나는 변화를 적어주세요.' } };
  const state = { result: { outputText: '제목\n\n관찰한 결과를 적은 합성 문단입니다.\n\n', refineTargets: [target], refine: { freeLeft: 2 } } };
  const render = () => { ctx.renderDoneBody(state.result.outputText, state.result.refineTargets); ctx.renderRefineTargets(state); };
  return { ctx, nodes, state, render, active: () => active };
}

test('contextual question is labelled, safely rendered, and does not alter copied text', () => {
  const h = setup(); h.render();
  const list = h.nodes.get('lavDoneRefineList'), input = list.querySelector('textarea');
  assert.equal(list.querySelector('label').htmlFor, input.id);
  assert.equal(list.querySelector('label').textContent, '어떤 변화를 확인했나요?');
  assert.equal(list.querySelector('button').textContent, '“<script>synthetic</script>”');
  assert.equal(h.nodes.get('lavDoneBody').textContent, h.state.result.outputText);
  assert.match(input.attrs['aria-describedby'], /lavRefineHint/);
});

test('skip and undo retain the draft and full result without network or billing', () => {
  const h = setup(); h.render(); const list = h.nodes.get('lavDoneRefineList');
  const input = list.querySelector('textarea'); input.value = '표시가 달라졌다'; input.oninput();
  list.querySelector('.lav-refine-skip').onclick();
  assert.equal(list.querySelector('textarea'), null);
  assert.equal(h.nodes.get('lavDoneBody').textContent, h.state.result.outputText);
  assert.equal(h.nodes.get('lavDoneRefineOk').hidden, false);
  list.querySelector('button').onclick();
  assert.equal(list.querySelector('textarea').value, '표시가 달라졌다');
  assert.equal(h.active(), list.querySelector('textarea'));
  h.ctx.lavRefineJobId = 'job-b'; h.render();
  assert.equal(list.querySelector('textarea').value, '');
});

test('empty or legacy targets do not create irrelevant questions or quality claims', () => {
  const h = setup();
  for (const targets of [undefined, [], [{ index: 0, kind: 'abstract_risk', snippet: '이론' }]]) {
    h.state.result.refineTargets = targets; h.render();
    assert.equal(h.nodes.get('lavDoneRefine').hidden, true);
    assert.equal(h.nodes.get('lavDoneBody').all().some(n => n.className.includes('is-refine-target')), false);
  }
});

test('invalid memo stays local and focuses the field; API failure restores all controls and draft', async () => {
  const h = setup(); h.render(); const list = h.nodes.get('lavDoneRefineList');
  const input = list.querySelector('textarea'), submit = list.querySelector('.lav-refine-btn'), skip = list.querySelector('.lav-refine-skip');
  await submit.onclick(); assert.equal(input.attrs['aria-invalid'], 'true'); assert.equal(h.active(), input);
  input.value = '입력선을 확인했다'; input.oninput();
  h.ctx.window.apiUrl = p => p;
  h.ctx.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).memo, input.value);
    assert.equal(skip.disabled, true);
    return { ok: false, status: 503, json: async () => ({ error: '잠시 후 다시 시도해 주세요.' }) };
  };
  await h.ctx.lavRefineSubmit(1, 10, 2, input, submit, list.querySelector('.lav-refine-status'), skip);
  assert.equal(input.value, '입력선을 확인했다'); assert.equal(input.disabled, false); assert.equal(skip.disabled, false);
  assert.equal(h.ctx.lavRefineBusy, false);
});
