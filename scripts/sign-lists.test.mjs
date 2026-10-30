import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { publicKeyHex, signText, verifySigned } from './sign-lists.mjs';

const seed = crypto.randomBytes(32).toString('hex');

test('a signed list checks out, a changed one does not', () => {
  const pub = publicKeyHex(seed);
  assert.match(pub, /^[0-9a-f]{64}$/);
  const env = signText(seed, 'banners.json', '{"version":1}\n');
  assert.ok(verifySigned(pub, env));
  assert.ok(!verifySigned(pub, { ...env, data: '{"version":2}\n' }));
  assert.ok(!verifySigned(pub, { ...env, file: 'blocklist.json' }));
  assert.ok(!verifySigned(publicKeyHex(crypto.randomBytes(32).toString('hex')), env));
});

test('rejects a malformed key', () => {
  assert.throws(() => signText('abc', 'x', 'y'), /64 hex/);
});
