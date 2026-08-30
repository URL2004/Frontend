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

test('direct admin route keeps a loading state until Firebase auth is resolved', () => {
  const sources = [
    extractFunction(appMain, 'setAdminAuthHydrationPending'),
    extractFunction(appMain, 'requireResolvedAdminAuth'),
    extractFunction(appMain, 'openAdminPage')
  ].join('\n');
  const attributes = new Map();
  const overlay = {
    hidden: true,
    setAttribute(name, value) { attributes.set(`overlay:${name}`, value); }
  };
  const appScreen = {
    inert: false,
    setAttribute(name, value) { attributes.set(`app:${name}`, value); },
    removeAttribute(name) { attributes.delete(`app:${name}`); }
  };
  const title = { textContent: '' };
  const message = { textContent: '' };
  const nodes = { authTransition: overlay, appScreen, authTransitionTitle: title, authTransitionMessage: message };
  const bodyClasses = new Set();
  const documentMock = {
    body: {
      classList: {
        add(value) { bodyClasses.add(value); },
        remove(value) { bodyClasses.delete(value); }
      }
    },
    getElementById(id) { return nodes[id] || null; }
  };
  const screens = [];
  const tabs = [];
  let adminLoads = 0;
  const windowMock = {
    CU: null,
    gpAuthResolved: false,
    loadAdminPage() { adminLoads += 1; },
    isAdmin() { return true; }
  };
  const openAdminPage = new Function(
    'window',
    'document',
    'showScreen',
    'switchTab',
    'setTimeout',
    'alert',
    `${sources}; return openAdminPage;`
  )(
    windowMock,
    documentMock,
    name => screens.push(name),
    name => tabs.push(name),
    callback => callback(),
    () => {}
  );

  openAdminPage();
  assert.deepEqual(screens, ['app']);
  assert.deepEqual(tabs, []);
  assert.equal(overlay.hidden, false);
  assert.equal(attributes.get('overlay:aria-hidden'), 'false');
  assert.equal(attributes.get('app:aria-busy'), 'true');
  assert.equal(appScreen.inert, true);
  assert.equal(title.textContent, '로그인 상태 확인 중');
  assert.match(message.textContent, /관리자 화면/u);
  assert.equal(bodyClasses.has('gp-auth-transitioning'), true);

  windowMock.gpAuthResolved = true;
  openAdminPage();
  assert.deepEqual(screens, ['app', 'login']);
  assert.equal(overlay.hidden, true);
  assert.equal(attributes.get('overlay:aria-hidden'), 'true');
  assert.equal(attributes.has('app:aria-busy'), false);
  assert.equal(appScreen.inert, false);
  assert.equal(bodyClasses.has('gp-auth-transitioning'), false);
  assert.equal(adminLoads, 0);

  windowMock.gpAuthResolved = false;
  windowMock.GP_REQUESTED_APP_SCREEN = 'login';
  openAdminPage();
  assert.deepEqual(screens, ['app', 'login', 'login']);
  assert.equal(overlay.hidden, true);

  windowMock.CU = { uid: 'admin' };
  openAdminPage();
  assert.deepEqual(tabs, ['admin']);
  assert.equal(adminLoads, 1);
});
