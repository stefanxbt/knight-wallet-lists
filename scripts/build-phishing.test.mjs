import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildLists, cleanDomain, domainHash, HASH_BYTES } from './build-phishing.mjs';

const many = (prefix) => Array.from({ length: 1000 }, (_, i) => `${prefix}${i}.com`);

test('cleans domains', () => {
  assert.equal(cleanDomain(' Evil.COM. '), 'evil.com');
  assert.equal(cleanDomain('*.evil.com'), 'evil.com');
  assert.equal(cleanDomain('not a domain'), null);
  assert.equal(cleanDomain(42), null);
});

test('packs both lists as sorted, unique hashes and drops allowed sites', () => {
  const metamask = { blacklist: [...many('mm'), 'shared.com', 'uniswap.org'], whitelist: ['uniswap.org'], fuzzylist: ['metamask.io'], tolerance: 2 };
  const scamsniffer = [...many('ss'), 'shared.com'];
  const { bin, extra } = buildLists(metamask, scamsniffer);
  assert.equal(extra.count, 2001);
  assert.equal(bin.length, 2001 * HASH_BYTES);
  for (let i = HASH_BYTES; i < bin.length; i += HASH_BYTES) assert.ok(Buffer.compare(bin.subarray(i - HASH_BYTES, i), bin.subarray(i, i + HASH_BYTES)) < 0);
  const has = (d) => {
    const h = domainHash(d);
    for (let i = 0; i < bin.length; i += HASH_BYTES) if (bin.subarray(i, i + HASH_BYTES).equals(h)) return true;
    return false;
  };
  assert.ok(has('ss5.com') && has('shared.com'));
  assert.ok(!has('uniswap.org'));
  assert.deepEqual([extra.fuzzylist, extra.tolerance], [['metamask.io'], 2]);
});

test('refuses lists that look broken', () => {
  assert.throws(() => buildLists({ blacklist: [] }, many('x')), /MetaMask/);
  assert.throws(() => buildLists({ blacklist: many('x') }, {}), /ScamSniffer/);
});
