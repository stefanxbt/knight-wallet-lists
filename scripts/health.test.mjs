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

test('feature status: "any" features are partial while some chains work', async () => {
  const { featureStatus, FEATURES, SERVICES: all } = await import('./health.mjs');
  const services = all.map(([group, name]) => ({ group, name, status: name === 'Solana' ? 'down' : name === 'CoinGecko' ? 'slow' : name === 'LI.FI' ? 'down' : 'ok' }));
  const by = Object.fromEntries(featureStatus(services).map((f) => [f.name, f]));
  assert.equal(by.Balances.status, 'partial');
  assert.deepEqual(by.Balances.problems, ['Solana']);
  assert.equal(by['Prices and charts'].status, 'slow');
  assert.equal(by['Swap quotes'].status, 'down');
  assert.equal(by.WalletConnect.status, 'up');
  // Every feature only names services that are really checked.
  const names = new Set(all.map((s) => s[1]));
  for (const [, , needs] of FEATURES) for (const n of needs) assert.ok(names.has(n), n);
});

test('history keeps the last 30 days', async () => {
  const { addToHistory, HISTORY_LENGTH } = await import('./health.mjs');
  let h = null;
  for (let i = 0; i < HISTORY_LENGTH + 5; i++) h = addToHistory(h, { checkedAt: `t${i}`, services: [{ name: 'A', status: i % 2 ? 'down' : 'ok', ms: i }] });
  assert.equal(h.checks.length, HISTORY_LENGTH);
  assert.equal(h.checks.at(-1).t, `t${HISTORY_LENGTH + 4}`);
  assert.deepEqual(h.checks.at(-1).s.A, [1, HISTORY_LENGTH + 4]);
});
