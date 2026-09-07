import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createCipheriv, createHmac } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { publishPrivateMedia } from '../scripts/private-media.mjs';

test('private media stays absent without the key and rejects invalid keys', async () => {
  assert.equal(await publishPrivateMedia({ root: '.', dist: '.', secret: '' }), false);
  await assert.rejects(publishPrivateMedia({ root: '.', dist: '.', secret: 'invalid' }), /Invalid MEDIA_SHARE_SECRET/);
});

test('authenticated bundle is published only under the capability path, with private HTML metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'private-media-'));
  const dist = path.join(root, 'dist');
  const key = randomBytes(32);
  const secret = key.toString('hex');
  async function bundle(files) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(files))), cipher.final()]);
    await fs.writeFile(path.join(root, 'private-media.bundle'), Buffer.concat([Buffer.from('GPM1'), iv, cipher.getAuthTag(), body]));
  }
  try {
    await bundle([{ path: 'index.html', data: Buffer.from('<html><head></head><body>Media</body></html>').toString('base64') }]);
    await assert.rejects(publishPrivateMedia({ root, dist, secret: randomBytes(32).toString('hex') }));
    assert.equal(await publishPrivateMedia({ root, dist, secret }), true);
    const id = createHmac('sha256', key).update('instagram-kit-v1').digest('hex').slice(0, 40);
    assert.deepEqual(await fs.readdir(dist), ['share']);
    assert.deepEqual(await fs.readdir(path.join(dist, 'share')), [id]);
    const html = await fs.readFile(path.join(dist, 'share', id, 'index.html'), 'utf8');
    assert.match(html, /noindex,nofollow,noarchive/);
    assert.match(html, /no-referrer/);
    await bundle([{ path: '../escape.txt', data: '' }]);
    await assert.rejects(publishPrivateMedia({ root, dist, secret }), /Invalid media file path/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
