import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appMain = fs.readFileSync(new URL('../assets/js/app-main.js', import.meta.url), 'utf8');
const pageLoader = fs.readFileSync(new URL('../assets/js/page-loader.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} function must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name} function`);
}

test('setMode remains safe while app markup or legacy composer is absent', () => {
  const source = extractFunction(appMain, 'setMode');
  const windowMock = {};
  const documentMock = {
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  let hintCalls = 0;
  const setMode = new Function(
    'window',
    'document',
    'updateHint',
    `let mode = 'humanize'; ${source}; return setMode;`
  )(windowMock, documentMock, () => { hintCalls += 1; });

  assert.doesNotThrow(() => setMode('detect'));
  assert.equal(windowMock.mode, 'detect');
  assert.equal(hintCalls, 0);
});

test('app route waits for markup completion in the landing-to-app race', () => {
  assert.match(appMain, /if \(!document\.getElementById\('appScreen'\)\) return false;/u);
  assert.match(appMain, /window\.addEventListener\('gp:app-markup-ready',[\s\S]*?\{ once: true \}\)/u);
  assert.match(pageLoader, /window\.dispatchEvent\(new CustomEvent\('gp:app-markup-ready'\)\)/u);
});
