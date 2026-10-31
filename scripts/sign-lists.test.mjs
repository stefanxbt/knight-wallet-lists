import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { publicKeyHex, signText, stampIssued, verifySigned } from './sign-lists.mjs';

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

test('stamps the settings with the time of the last real change', () => {
  const cfg = JSON.stringify({ version: 1, notices: [], switchedOff: [] });
  const first = stampIssued(cfg, null, Date.parse('2026-11-01T10:00:00Z'));
  assert.equal(JSON.parse(first).issued, '2026-11-01T10:00:00.000Z');
  // Signing again without a change keeps the time.
  assert.equal(JSON.parse(stampIssued(first, first, Date.parse('2026-11-02T10:00:00Z'))).issued, '2026-11-01T10:00:00.000Z');
  // A change moves it forward, even if the clock is behind.
  const changed = JSON.stringify({ ...JSON.parse(first), switchedOff: ['swap'] });
  assert.equal(JSON.parse(stampIssued(changed, first, Date.parse('2026-10-01T00:00:00Z'))).issued, '2026-11-01T10:00:01.000Z');
});
