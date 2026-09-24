import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = {};
vm.runInNewContext(fs.readFileSync(new URL('../assets/js/pdf-text-layout.js', import.meta.url), 'utf8'), context);
const extract = items => context.GPPdfTextLayout.extractPage({ items });
const item = (str, x, y, width = str.length * 10, extra = {}) => ({ str, width, transform: [10, 0, 0, 10, x, y], dir: 'ltr', ...extra });

test('positioned glyph fragments join without invented word spaces', () => {
 assert.equal(extract([item('기', 10, 100), item('록', 20, 100), item('한다.', 30, 100)]).text, '기록한다.');
});
test('existing space items do not produce triple spaces', () => {
 assert.equal(extract([item('자료', 10, 100), item(' ', 30, 100, 4), item('확인', 34, 100)]).text, '자료 확인');
});
test('spaces inside glyph runs are normalized without discarding explicit word boundaries', () => {
 assert.equal(extract([item('자료   ', 10, 100, 50), item('확인', 60, 100)]).text, '자료 확인');
});
test('physical rows and larger paragraph gaps survive scrambled PDF object order', () => {
 assert.equal(extract([item('셋째 문단', 10, 60), item('둘째 행', 10, 88), item('첫째 행', 10, 100)]).text,
  '첫째 행\n둘째 행\n\n셋째 문단');
});
test('repeated table columns become tabs and never a continuous prose paragraph', () => {
 const result = extract([item('근거', 200, 100), item('설명 B', 200, 88), item('계획', 10, 100), item('행동 A', 10, 88)]);
 assert.equal(result.text, '계획\t근거\n행동 A\t설명 B');
 assert.equal(result.columnRowCount, 2);
 assert.ok(result.reviewCodes.includes('pdf_columns_review'));
});
test('single large gap stays separated but does not establish a confirmed table band', () => {
 const result = extract([item('제목', 10, 100), item('부제', 200, 100), item('본문이다.', 10, 80)]);
 assert.equal(result.columnRowCount, 0);
 assert.ok(result.text.startsWith('제목\t부제'));
 assert.ok(result.reviewCodes.includes('pdf_reading_order_review'));
});
test('wrapped table cells keep empty left and right columns without merging their contents', () => {
 const result = extract([item('행동', 10, 100),item('근거',200,100),item('확인한다.',10,88),item('비교한다.',200,88),
  item('오른쪽만 이어진다.',200,76),item('왼쪽만 이어진다.',10,64),item('3. 다음 절',10,52)]);
 assert.equal(result.text, '행동\t근거\n확인한다.\t비교한다.\n\t오른쪽만 이어진다.\n왼쪽만 이어진다.\t\n3. 다음 절');
 assert.equal(result.columnRowCount, 4);
});
test('numbers, quotation marks and signs survive extraction', () => {
 assert.equal(extract([item('“12.5 mg” / +2 / NRS', 10, 100)]).text, '“12.5 mg” / +2 / NRS');
});
test('spaces inside literal source strings are not globally rewritten', () => {
 assert.equal(extract([item('“표현   그대로”', 10, 100)]).text, '“표현   그대로”');
});
test('unsupported rotation/direction preserves item order and hasEOL, with review', () => {
 for (const extra of [{ dir: 'rtl' }, { transform: [0, 10, -10, 0, 10, 100] }]) {
  const result = extract([item('첫행', 10, 100, 20, { ...extra, hasEOL: true }), item('다음행', 10, 88)]);
  assert.equal(result.text, '첫행\n다음행');
  assert.ok(result.reviewCodes.includes('pdf_reading_order_review'));
 }
});
test('missing geometry follows explicit line endings rather than flattening a page', () => {
 assert.equal(extract([{ str: '첫 행', hasEOL: true }, { str: '둘째 행', hasEOL: true }]).text, '첫 행\n둘째 행');
});
test('marked content items and empty pages are safe', () => {
 assert.equal(extract([{ type: 'beginMarkedContent', id: 'p' }, { str: '', hasEOL: true }]).text, '');
});
test('pathological page payloads are rejected before coordinate processing', () => {
 assert.throws(() => extract(Array(50001).fill({str:''})), /너무 많아요/u);
 assert.throws(() => extract([item('가'.repeat(30001),10,100)]), /30,000/u);
 assert.throws(() => extract(Array.from({length:67},(_,i)=>item('가',i*100,100))), /열 구성이 너무 복잡/u);
});
test('separate pages are never stitched into invented words', () => {
 const left = extract([item('정보를 확', 10, 100)]).text;
 const right = extract([item('2. 다음 절', 10, 100), item('인한다.', 10, 88)]).text;
 assert.equal([left, right].join('\n\n'), '정보를 확\n\n2. 다음 절\n인한다.');
});
test('boot loads geometry extraction before PDF upload handler and surfaces review before transformation', () => {
 const boot = fs.readFileSync(new URL('../assets/js/app-boot.js', import.meta.url), 'utf8');
 const main = fs.readFileSync(new URL('../assets/js/app-main.js', import.meta.url), 'utf8');
 assert.ok(boot.indexOf("loadScript('/assets/js/pdf-text-layout.js')") < boot.indexOf("loadScript('/assets/js/app-main.js')"));
 assert.match(main, /GPPdfTextLayout\.extractPage\(content\)/);
 assert.doesNotMatch(main, /content\.items\.map\(it => it\.str\)\.join\(' '\)/);
 assert.match(main, /변환 전에 입력창에서 표의 좌우 내용/);
});

test('production PDF upload wrapper uses geometry, returns diagnostics and destroys its PDF resource', async () => {
 const main = fs.readFileSync(new URL('../assets/js/app-main.js', import.meta.url), 'utf8');
 const code = main.slice(main.indexOf('let pdfJsPromise = null;'), main.indexOf('\nfunction handlePDF(input)'));
 let destroyed = false;
 const pages = [
  [item('행동',10,100),item('근거',200,100),item('기록한다.',10,88),item('비교한다.',200,88)],
  [item('다음 페이지이다.',10,100)]
 ];
 const runtime = {window:{GPPdfTextLayout:context.GPPdfTextLayout},Date,setTimeout,clearTimeout,
  mockPdf: {getDocument(options) {
   assert.equal(options.isEvalSupported,false);
   assert.equal(options.enableScripting,false);
   return {promise:Promise.resolve({numPages:2,getPage:async n=>({getTextContent:async()=>({items:pages[n-1]})}),destroy:async()=>{destroyed=true;}})};
  }}};
 vm.runInNewContext(code+'\npdfJsPromise = Promise.resolve(mockPdf);',runtime);
 const diagnostics = {};
 const text = await runtime.extractPdfText({arrayBuffer:async()=>new ArrayBuffer(0)},diagnostics);
 assert.equal(text,'행동\t근거\n기록한다.\t비교한다.\n\n다음 페이지이다.');
 assert.ok(diagnostics.reviewCodes.includes('pdf_columns_review'));
 assert.ok(destroyed);
});
