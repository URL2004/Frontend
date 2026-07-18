import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { publicRuntimeValue } from '../scripts/runtime-config-values.mjs';

const configSource = await readFile(new URL('../assets/js/config.js', import.meta.url), 'utf8');

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
  assert.equal(window.APP_CONFIG.MAINTENANCE_PREVIEW_KEY, '');
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
