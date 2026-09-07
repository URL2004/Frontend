import fs from 'node:fs/promises';
import path from 'node:path';
import { createDecipheriv, createHmac } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// The repository is public. Only the authenticated encrypted bundle belongs in
// Git; its key stays in the deployment environment. No public manifest or page
// links to the capability URL. Possession of that URL grants access.
export async function publishPrivateMedia({ root, dist, secret = process.env.MEDIA_SHARE_SECRET }) {
  secret = String(secret || '').trim();
  if (!secret) return false;
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid MEDIA_SHARE_SECRET');
  const key = Buffer.from(secret, 'hex');
  const blob = await fs.readFile(path.join(root, 'private-media.bundle'));
  if (blob.subarray(0, 4).toString() !== 'GPM1') throw new Error('Invalid media bundle');
  const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(4, 16));
  decipher.setAuthTag(blob.subarray(16, 32));
  const plaintext = Buffer.concat([decipher.update(blob.subarray(32)), decipher.final()]);
  const files = JSON.parse(gunzipSync(plaintext).toString());
  for (const file of files) {
    if (!file.path || file.path.includes('\\') || file.path.startsWith('/') || file.path.split('/').some(p => !p || p === '..' || p === '.') || file.path.includes(':')) {
      throw new Error('Invalid media file path');
    }
  }
  const id = createHmac('sha256', key).update('instagram-kit-v1').digest('hex').slice(0, 40);
  const target = path.join(dist, 'share', id);
  for (const file of files) {
    const output = path.join(target, file.path);
    await fs.mkdir(path.dirname(output), { recursive: true });
    let content = Buffer.from(file.data, 'base64');
    if (file.path.endsWith('.html')) {
      content = Buffer.from(content.toString().replace(/<head>/i, '<head><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">'));
    }
    await fs.writeFile(output, content);
  }
  return true;
}
