import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { after as afterAll, afterEach, beforeEach, describe, it } from 'node:test';

// Small stand-ins for the few test helpers used below, so this runs on plain
// Node (`node --test`) with nothing to install.
const expect = (actual) => ({
  toEqual: (expected) => assert.deepStrictEqual(actual, expected),
  toBe: (expected) => assert.strictEqual(actual, expected),
  toMatch: (re) => assert.match(actual, re),
  toMatchObject: (expected) => Object.entries(expected).forEach(([k, v]) => assert.deepStrictEqual(actual[k], v)),
  rejects: { toThrow: (re) => assert.rejects(actual, re) },
});
const realFetch = globalThis.fetch;
const vi = {
  fn: (impl) => {
    const mock = { calls: [] };
    return Object.assign((...args) => (mock.calls.push(args), impl(...args)), { mock });
  },
  stubGlobal: (name, value) => (globalThis[name] = value),
  unstubAllGlobals: () => (globalThis.fetch = realFetch),
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lists-'));
process.env.LISTS_DIR = dir;
const { apply, parseForm } = await import('./apply-request.mjs');

const real = path.resolve(import.meta.dirname, '../lists');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

beforeEach(() => {
  for (const f of ['dapps.json', 'tokens.json', 'blocklist.json', 'banners.json']) fs.copyFileSync(path.join(real, f), path.join(dir, f));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// The same text GitHub puts in an issue made from a form.
const form = (fields) => Object.entries(fields).map(([k, v]) => `### ${k}\n\n${v}`).join('\n\n');
const SCAM = '0x1111111111111111111111111111111111111111';

describe('parseForm', async () => {
  it('reads sections and treats "_No response_" as empty', async () => {
    expect(parseForm('### A\r\n\r\none\r\n\r\n### B\n\n_No response_')).toEqual({ A: 'one', B: '' });
  });
});

describe('apply', async () => {
  it('adds and removes a dApp', async () => {
    await apply(form({
      Action: 'Add a dApp', 'dApp name': 'Curve', 'Website address': 'https://Curve.finance/', 'Short description': 'Stablecoin swaps.',
      Category: 'Exchange', Networks: '- [X] Ethereum\n- [ ] Tron\n- [x] Polygon', 'Show at the top': '- [ ] Yes, show it in the featured row',
    }));
    const added = read('dapps.json').dapps.at(-1);
    expect(added).toEqual({ id: 'curve', name: 'Curve', url: 'https://curve.finance', description: 'Stablecoin swaps.', category: 'exchange', chains: ['ethereum', 'polygon'] });
    await apply(form({ Action: 'Remove a dApp', 'dApp name or website': 'curve.finance' }));
    expect(read('dapps.json').dapps.some((d) => d.id === 'curve')).toBe(false);
  });

  it('refuses unsafe or duplicate dApps', async () => {
    const base = { Action: 'Add a dApp', 'dApp name': 'X', 'Short description': 'x', Category: 'Other', Networks: '- [X] Ethereum' };
    await expect(apply(form({ ...base, 'Website address': 'http://x.com' }))).rejects.toThrow(/https/);
    await expect(apply(form({ ...base, 'Website address': 'https://app.uniswap.org/swap' }))).rejects.toThrow(/already/);
  });

  it('blocking a token also takes it off the token list, and unblocking works', async () => {
    const usdt = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    const r = await apply(form({ Action: 'Block a scam', 'What is it?': 'Token', Network: 'Ethereum', 'Contract address or website': usdt, 'Why is it a scam?': 'test' }));
    expect(r.summary).toMatch(/taken off the token list/);
    expect(read('tokens.json').tokens.some((t) => t.address === usdt)).toBe(false);
    expect(read('blocklist.json').tokens[0]).toMatchObject({ chain: 'ethereum', address: usdt, reason: 'test' });
    await expect(apply(form({ Action: 'Add a token', Network: 'Ethereum', 'Contract address': usdt, Symbol: 'usdt', 'Token name': 'T', Decimals: '6' }))).rejects.toThrow(/blocklist/);
    await apply(form({ Action: 'Unblock something', 'What is it?': 'Token', Network: 'Ethereum', 'Contract address or website': usdt.toLowerCase() }));
    expect(read('blocklist.json').tokens).toEqual([]);
  });

  it('blocks NFTs and websites', async () => {
    await apply(form({ Action: 'Block a scam', 'What is it?': 'NFT collection', Network: 'Polygon', 'Contract address or website': SCAM, 'Why is it a scam?': 'Fake airdrop' }));
    await apply(form({ Action: 'Block a scam', 'What is it?': 'Website', Network: 'Tron', 'Contract address or website': 'https://Claim-USDT.com/now', 'Why is it a scam?': 'Drainer' }));
    const list = read('blocklist.json');
    expect(list.nfts[0]).toMatchObject({ chain: 'polygon', contract: SCAM });
    expect(list.domains[0]).toMatchObject({ domain: 'claim-usdt.com', reason: 'Drainer' });
    await expect(apply(form({ Action: 'Block a scam', 'What is it?': 'Website', Network: 'Tron', 'Contract address or website': 'claim-usdt.com', 'Why is it a scam?': 'x' }))).rejects.toThrow(/already/);
  });

  it('adds a token and checks the address for its network', async () => {
    const base = { Action: 'Add a token', Symbol: 'jup', 'Token name': 'Jupiter', Decimals: '6', 'CoinGecko ID': '_No response_' };
    await expect(apply(form({ ...base, Network: 'Solana', 'Contract address': SCAM }))).rejects.toThrow(/valid solana address/);
    await apply(form({ ...base, Network: 'Solana', 'Contract address': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' }));
    expect(read('tokens.json').tokens.at(-1)).toEqual({ chain: 'solana', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', name: 'Jupiter', decimals: 6 });
  });

  it('ignores issues that are not list forms', async () => {
    await expect(apply('### Action\n\nDelete everything')).rejects.toThrow(/not a list change form/);
  });
});

describe('banners', () => {
  afterEach(() => vi.unstubAllGlobals());
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const add = (extra = {}) => form({
    Action: 'Add a banner', 'Banner title': 'Bitget 50% off', 'Banner text': 'Trade with lower fees.', Link: 'https://www.bitget.com/',
    'Where should it show?': 'Home screen', 'First day': '2026-11-01', 'Last day': '_No response_', Image: '_No response_',
    'Switch on': '- [X] Yes, switch it on now', ...extra,
  });

  it('adds a banner, switches it off and on, and removes it', async () => {
    const r = await apply(add());
    expect(r.summary).toMatch(/on, but outside its dates|showing/);
    expect(read('banners.json').banners[0]).toEqual({
      id: 'bitget-50-off', title: 'Bitget 50% off', text: 'Trade with lower fees.', link: 'https://www.bitget.com',
      placement: 'home', active: true, start: '2026-11-01',
    });
    await apply(form({ Action: 'Switch a banner on or off', 'Banner title': 'bitget 50% OFF', Switch: 'Off' }));
    expect(read('banners.json').banners[0].active).toBe(false);
    await apply(form({ Action: 'Remove a banner', 'Banner title': 'Bitget 50% off' }));
    expect(read('banners.json').banners).toEqual([]);
  });

  it('copies a dropped image into the repo', async () => {
    const fetchMock = vi.fn(async () => new Response(PNG));
    vi.stubGlobal('fetch', fetchMock);
    await apply(add({ Image: '<img width="600" alt="x" src="https://github.com/user-attachments/assets/0f1e2d3c-aaaa-bbbb-cccc-123456789abc" />' }));
    expect(fetchMock.mock.calls[0][0]).toBe('https://github.com/user-attachments/assets/0f1e2d3c-aaaa-bbbb-cccc-123456789abc');
    expect(read('banners.json').banners[0].image).toBe('bitget-50-off.png');
    expect(fs.existsSync(path.join(dir, 'banners', 'bitget-50-off.png'))).toBe(true);
    await apply(form({ Action: 'Remove a banner', 'Banner title': 'Bitget 50% off' }));
    expect(fs.existsSync(path.join(dir, 'banners', 'bitget-50-off.png'))).toBe(false);
  });

  it('refuses images from other sites, non-images, bad dates and scam links', async () => {
    await expect(apply(add({ Image: 'https://evil.example/x.png' }))).rejects.toThrow(/could not find the picture/);
    vi.stubGlobal('fetch', async () => new Response('<html>'));
    await expect(apply(add({ Image: 'https://github.com/user-attachments/assets/0f1e2d3c' }))).rejects.toThrow(/PNG, JPG or WebP/);
    await expect(apply(add({ 'Last day': '2026-10-01' }))).rejects.toThrow(/ends before it starts/);
    await expect(apply(add({ 'First day': 'next week' }))).rejects.toThrow(/date like/);
    await apply(form({ Action: 'Block a scam', 'What is it?': 'Website', Network: 'Tron', 'Contract address or website': 'bitget.com', 'Why is it a scam?': 'test' }));
    await expect(apply(add())).rejects.toThrow(/blocklist/);
    expect(read('banners.json').banners).toEqual([]);
  });
});
