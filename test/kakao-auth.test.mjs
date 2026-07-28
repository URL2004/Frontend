import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'assets', 'js', 'app-module.js'), 'utf8');
const configSource = fs.readFileSync(path.join(here, '..', 'assets', 'js', 'config.js'), 'utf8');

test('Kakao login uses backend-issued Firebase custom tokens', () => {
  assert.match(source, /signInWithCustomToken\(auth,\s*data\.customToken\)/);
  assert.match(source, /async function signInWithKakaoAccessToken\(accessToken\)/);
  assert.equal((source.match(/signInWithKakaoAccessToken\(/g) || []).length, 2);
});

test('Kakao login never creates or signs in with deterministic passwords', () => {
  assert.doesNotMatch(source, /createUserWithEmailAndPassword/);
  assert.doesNotMatch(source, /signInWithEmailAndPassword/);
  assert.doesNotMatch(source, /['"`]kakao_['"`]\s*\+/);
  assert.doesNotMatch(source, /_pw!|_!@#/);
});

test('Kakao profile lookup is performed by the backend only', () => {
  assert.doesNotMatch(source, /Kakao\.API\.request\(\{\s*url:\s*['"]\/v2\/user\/me['"]/);
  assert.match(source, /window\.apiUrl\(['"]\/kakao-login-v2['"]\)/);
});

test('orphaned authorization-code callback is not accepted without state validation', () => {
  assert.doesNotMatch(source, /kauth\.kakao\.com\/oauth\/token|handleKakaoCallback/);
  assert.doesNotMatch(configSource, /KAKAO_REST_KEY/);
});
