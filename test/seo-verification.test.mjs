import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Google과 네이버 소유확인 파일을 운영 빌드에 함께 포함한다', async () => {
  const [buildScript, googleVerification, naverVerification] = await Promise.all([
    read('scripts/build-vite-static.mjs'),
    read('google9fc9828aad4d4ecc.html'),
    read('naver28bee0639622a46f4cf5237f73b489ac.html')
  ]);

  assert.match(buildScript, /'google9fc9828aad4d4ecc\.html'/u);
  assert.match(buildScript, /'naver28bee0639622a46f4cf5237f73b489ac\.html'/u);
  assert.equal(googleVerification.trim(), 'google-site-verification: google9fc9828aad4d4ecc.html');
  assert.equal(
    naverVerification.trim(),
    'naver-site-verification: naver28bee0639622a46f4cf5237f73b489ac.html'
  );
});
