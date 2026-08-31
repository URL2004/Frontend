import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { publicRuntimeValue } from '../scripts/runtime-config-values.mjs';

const configSource = await readFile(new URL('../assets/js/config.js', import.meta.url), 'utf8');
const maintenanceSource = await readFile(new URL('../assets/js/maintenance.js', import.meta.url), 'utf8');
const buildSource = await readFile(new URL('../scripts/build-vite-static.mjs', import.meta.url), 'utf8');
const envExampleSource = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const vercelIgnoreSource = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('Vercel OIDC 마스킹 값은 공개 런타임 설정에서 무시한다', () => {
  assert.equal(publicRuntimeValue('[SENSITIVE]'), '');
  assert.equal(publicRuntimeValue(' [REDACTED] '), '');
  assert.equal(publicRuntimeValue('[SENSITIVE]', 'fallback'), 'fallback');
  assert.equal(publicRuntimeValue('https://example.com'), 'https://example.com');
});

test('운영 호스트는 마스킹된 런타임 값 대신 안전한 운영 기본값을 사용한다', () => {
  const window = {
    location: { hostname: 'gpkorea.ai.kr', origin: 'https://gpkorea.ai.kr' },
    APP_RUNTIME_CONFIG: {
      APP_ENV: '[SENSITIVE]',
      SITE_URL: '[SENSITIVE]',
      API_BASE: '[SENSITIVE]',
      TOSS_CLIENT_KEY: '[SENSITIVE]',
      KAKAO_JS_KEY: '[SENSITIVE]',
      KAKAO_REST_KEY: '[SENSITIVE]',
      MAINTENANCE_MODE: '[SENSITIVE]',
      MAINTENANCE_PREVIEW_KEY: '[SENSITIVE]',
      MAINTENANCE_MESSAGE: '[SENSITIVE]'
    }
  };
  vm.runInNewContext(configSource, { window });
  assert.equal(window.APP_CONFIG.APP_ENV, 'production');
  assert.equal(window.APP_CONFIG.SITE_URL, 'https://gpkorea.ai.kr');
  assert.equal(window.APP_CONFIG.API_BASE, 'https://ai-backend-3xtk.onrender.com');
  assert.match(window.APP_CONFIG.TOSS_CLIENT_KEY, /^live_/u);
  assert.equal(window.APP_CONFIG.MAINTENANCE_MODE, false);
  assert.equal(Object.hasOwn(window.APP_CONFIG, 'MAINTENANCE_PREVIEW_KEY'), false);
  assert.equal(window.APP_CONFIG.MAINTENANCE_MESSAGE, '');
  assert.equal(window.APP_CONFIG.FIREBASE.projectId, 'url88-d1d27');
});

test('정상 런타임 값은 변경하지 않는다', () => {
  const window = {
    location: { hostname: 'preview.example', origin: 'https://preview.example' },
    APP_RUNTIME_CONFIG: {
      APP_ENV: 'staging',
      SITE_URL: 'https://staging.example',
      API_BASE: 'https://api.staging.example',
      MAINTENANCE_MODE: 'true'
    }
  };
  vm.runInNewContext(configSource, { window });
  assert.equal(window.APP_CONFIG.APP_ENV, 'staging');
  assert.equal(window.APP_CONFIG.SITE_URL, 'https://staging.example');
  assert.equal(window.APP_CONFIG.API_BASE, 'https://api.staging.example');
  assert.equal(window.APP_CONFIG.MAINTENANCE_MODE, true);
});

test('점검 미리보기 키는 공개 런타임 설정으로 직렬화하지 않고 설정 시 빌드를 즉시 거부한다', () => {
  assert.doesNotMatch(buildSource, /MAINTENANCE_PREVIEW_KEY:\s*\$\{/u);
  assert.doesNotMatch(configSource, /MAINTENANCE_PREVIEW_KEY:/u);
  assert.doesNotMatch(envExampleSource, /^VITE_MAINTENANCE_PREVIEW_KEY=/mu);
  assert.doesNotMatch(vercelIgnoreSource, /^\.env\.example$/mu, 'Vercel 빌드 테스트에 공개 환경변수 예시가 필요하다');

  const result = spawnSync(process.execPath, ['scripts/build-vite-static.mjs'], {
    cwd: projectRoot,
    env: { ...process.env, VITE_MAINTENANCE_PREVIEW_KEY: 'must-not-be-public' },
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /VITE_MAINTENANCE_PREVIEW_KEY must be unset/u);
});

test('점검 모드는 공개 키 우회 없이 동작하고 레거시 키와 URL 파라미터를 정리한다', () => {
  const removed = [];
  const replaced = [];
  const window = {
    APP_CONFIG: { MAINTENANCE_MODE: true },
    location: {
      search: '?preview_key=legacy-secret&from=notice',
      href: 'https://gpkorea.ai.kr/?preview_key=legacy-secret&from=notice'
    },
    history: { replaceState(_state, _title, next) { replaced.push(next); } }
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    documentElement: { classList: { add() {} } },
    body: { classList: { add() {} } }
  };
  const localStorage = { removeItem(key) { removed.push(key); } };

  vm.runInNewContext(maintenanceSource, { window, document, localStorage, URL, URLSearchParams });
  assert.equal(window.GP_MAINTENANCE_BYPASSED, false);
  assert.equal(window.GP_MAINTENANCE_BLOCKED, true);
  assert.deepEqual(removed, ['gp_maintenance_preview_key']);
  assert.deepEqual(replaced, ['/?from=notice']);
  assert.doesNotMatch(maintenanceSource, /config\.MAINTENANCE_PREVIEW_KEY|getStoredKey|setStoredKey/u);
});
