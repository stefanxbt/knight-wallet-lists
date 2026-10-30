import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkAll, SERVICES } from './health.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('marks each service ok, warn or down from its answer', async () => {
  const report = await checkAll(async (url) => {
    if (url.includes('publicnode') || url.includes('blackfort.network')) return json({ result: '0x10' });
    if (url.includes('coingecko')) return json({ bitcoin: { usd: 70000 } });
    if (url.includes('li.quest')) return json({}, 503);
    if (url.includes('non-custody-wallet/releases')) return new Response('', { status: 404 });
    throw new Error('offline');
  }, new Date('2026-10-30T12:00:00Z'));

  assert.equal(report.checkedAt, '2026-10-30T12:00:00.000Z');
  assert.equal(report.services.length, SERVICES.length);
  const by = Object.fromEntries(report.services.map((s) => [s.name, s]));
  assert.equal(by.Ethereum.status, 'ok');
  assert.equal(by.Ethereum.detail, 'block 16');
  assert.equal(by.CoinGecko.status, 'warn');
  assert.match(by.CoinGecko.detail, /no BXN price/);
  assert.deepEqual([by['LI.FI'].status, by['LI.FI'].detail], ['down', 'HTTP 503']);
  assert.match(by['Test app download'].hint, /private/);
  assert.equal(by.Solana.status, 'down');
  const { ok, warn, down, slow } = report.summary;
  assert.equal(ok + warn + down + slow, SERVICES.length);
});
