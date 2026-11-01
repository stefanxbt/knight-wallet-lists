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
  for (const f of ['dapps.json', 'tokens.json', 'blocklist.json', 'app-config.json']) fs.copyFileSync(path.join(real, f), path.join(dir, f));
  // Start from no banners, whatever the live list holds today.
  fs.writeFileSync(path.join(dir, 'banners.json'), JSON.stringify({ version: 1, banners: [] }));
  // No real network calls in tests.
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
});
afterEach(() => vi.unstubAllGlobals());
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

  it('reads symbol, name and decimals from the network when left empty', async () => {
    const word = (hex) => hex.padStart(64, '0');
    const abiString = (text) => '0x' + word('20') + word(text.length.toString(16)) + Buffer.from(text).toString('hex').padEnd(64, '0');
    const answers = { '0x95d89b41': abiString('PEPE'), '0x06fdde03': abiString('Pepe'), '0x313ce567': '0x' + word('12') };
    vi.stubGlobal('fetch', async (_url, init) => {
      const { params } = JSON.parse(init.body);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: answers[params[0].data] }));
    });
    const address = '0x1111111111111111111111111111111111111111';
    const r = await apply(form({ Action: 'Add a token', Network: 'Ethereum', 'Contract address': address, Symbol: '_No response_', 'Token name': '_No response_', Decimals: '6' }));
    expect(read('tokens.json').tokens.at(-1)).toEqual({ chain: 'ethereum', address, symbol: 'PEPE', name: 'Pepe', decimals: 18 });
    expect(r.summary).toMatch(/You typed 6 decimals, but the token itself says 18/);
  });

  it('asks for the details when the network can not be read', async () => {
    const r = apply(form({ Action: 'Add a token', Network: 'Solana', 'Contract address': 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', Symbol: '_No response_', 'Token name': '_No response_', Decimals: '_No response_' }));
    await expect(r).rejects.toThrow(/could not read Symbol, Token name, Decimals/);
  });

  it('adds a token and checks the address for its network', async () => {
    const base = { Action: 'Add a token', Symbol: 'msol', 'Token name': 'Marinade SOL', Decimals: '9', 'CoinGecko ID': '_No response_' };
    await expect(apply(form({ ...base, Network: 'Solana', 'Contract address': SCAM }))).rejects.toThrow(/valid solana address/);
    await apply(form({ ...base, Network: 'Solana', 'Contract address': 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So' }));
    expect(read('tokens.json').tokens.at(-1)).toEqual({ chain: 'solana', address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', symbol: 'MSOL', name: 'Marinade SOL', decimals: 9 });
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

describe('app settings', () => {
  const config = () => read('app-config.json');
  // The real list may already hold messages, so look this one up by its id.
  const message = (id) => config().notices.find((n) => n.id === id);

  it('sends a message, switches it off and deletes it', async () => {
    const r = await apply(form({
      Action: 'Send a message', 'Message title': 'Fake support', 'Message text': 'We never ask\nfor your phrase.',
      'How serious is it?': 'Critical (urgent, shown on top in red)', Link: '_No response_', 'First day': '_No response_',
      'Last day': '_No response_', 'Switch on': '- [X] Yes, show it now',
    }));
    expect(r.summary).toMatch(/Fake support \| critical \| 🟢 showing/);
    expect(message('fake-support')).toEqual({ id: 'fake-support', title: 'Fake support', text: 'We never ask for your phrase.', level: 'critical', active: true });
    await apply(form({ Action: 'Switch a message', 'Message title': 'fake support', Switch: 'Off' }));
    expect(message('fake-support').active).toBe(false);
    await apply(form({ Action: 'Switch a message', 'Message title': 'Fake support', Switch: 'Delete' }));
    expect(message('fake-support')).toBe(undefined);
  });

  it('switches features off and back on', async () => {
    await apply(form({ Action: 'Emergency switch', Feature: 'Swaps', Switch: 'Off for everyone' }));
    await apply(form({ Action: 'Emergency switch', Feature: 'Swaps', Switch: 'Off for everyone' }));
    expect(config().switchedOff).toEqual(['swap']);
    const r = await apply(form({ Action: 'Emergency switch', Feature: 'Swaps', Switch: 'Back on' }));
    expect(config().switchedOff).toEqual([]);
    expect(r.summary).toMatch(/Swaps is now \*\*on for everyone\*\*/);
  });

  it('shows a feature to testers only and hides it for everyone', async () => {
    await apply(form({ Action: 'Emergency switch', Feature: 'Hyperliquid trading', Switch: 'Testers only' }));
    expect(config().features.hyperliquid).toBe('testers');
    expect(config().switchedOff).toEqual([]);
    const r = await apply(form({ Action: 'Emergency switch', Feature: 'Friends', Switch: 'Off for everyone' }));
    expect(config().features.friends).toBe('off');
    expect(r.summary).toMatch(/Friends is now \*\*off for everyone\*\*/);
    expect(r.summary).toMatch(/Hyperliquid trading \(testers only\)/);
    // The older off list is kept for app versions from before "testers only".
    await apply(form({ Action: 'Emergency switch', Feature: 'Sending', Switch: 'Testers only' }));
    expect(config().switchedOff).toEqual(['send']);
    await apply(form({ Action: 'Emergency switch', Feature: 'Sending', Switch: 'On for everyone' }));
    expect(config().switchedOff).toEqual([]);
    expect(config().features.send).toBe('on');
    await assert.rejects(apply(form({ Action: 'Emergency switch', Feature: 'Teleport', Switch: 'Off for everyone' })), /not a feature/);
  });

  it('lists every app feature on the form and the admin page', async () => {
    const { APP_FEATURES } = await import('./schema.ts');
    const formText = fs.readFileSync(path.resolve(import.meta.dirname, '../.github/ISSUE_TEMPLATE/12-emergency-switch.yml'), 'utf8');
    const admin = fs.readFileSync(path.resolve(import.meta.dirname, '../admin/index.html'), 'utf8');
    for (const [key, f] of Object.entries(APP_FEATURES)) {
      assert.ok(formText.includes(`        - ${f.label}\n`), `form is missing ${f.label}`);
      assert.ok(admin.includes(`['${key}', '${f.label}', '${f.standard}']`), `admin page is missing ${key}`);
    }
  });

  it('switches features off by country', async () => {
    await apply(form({ Action: 'Country rule', Feature: 'Hyperliquid trading', Change: 'Switch off in these countries', Countries: 'us, gb' }));
    expect(['GB', 'US'].every((c) => config().regions.hyperliquidTrade.blocked.includes(c))).toBe(true);
    await apply(form({ Action: 'Country rule', Feature: 'Hyperliquid trading', Change: 'Switch back on in these countries', Countries: 'GB' }));
    expect(config().regions.hyperliquidTrade.blocked.includes('GB')).toBe(false);
    const r = await apply(form({ Action: 'Country rule', Feature: 'Swaps', Change: 'When the country is unknown, keep it off', Countries: '_No response_' }));
    expect(config().regions.swap.unknownOff).toBe(true);
    expect(r.summary).toMatch(/\| Swaps \| [^|]+ \| off \|/);
    await expect(apply(form({ Action: 'Country rule', Feature: 'Swaps', Change: 'Switch off in these countries', Countries: 'USA' }))).rejects.toThrow(/two-letter/);
  });

  it('adds and removes real-money testers', async () => {
    const a = '0xAbC0000000000000000000000000000000000001';
    const r = await apply(form({ Action: 'Real-money tester', Change: 'Add', 'Wallet address': a }));
    const before = (config().realMoneyTesters ?? []).filter((t) => t !== a.toLowerCase());
    expect(config().realMoneyTesters.includes(a.toLowerCase())).toBe(true);
    expect(r.summary).toMatch(/Added/);
    await apply(form({ Action: 'Real-money tester', Change: 'Remove', 'Wallet address': a }));
    expect(config().realMoneyTesters ?? []).toEqual(before);
    await expect(apply(form({ Action: 'Real-money tester', Change: 'Add', 'Wallet address': 'bc1qxyz' }))).rejects.toThrow(/0x/);
  });

  it('sets the real-money test limits', async () => {
    const r = await apply(form({ Action: 'Real-money test limits', 'Per action': '$100', 'Per day': '$500' }));
    expect(config().testLimits).toEqual({ perActionUsd: 100, perDayUsd: 500 });
    expect(r.summary).toMatch(/\$100 per action/);
    await expect(apply(form({ Action: 'Real-money test limits', 'Per action': '$250', 'Per day': '$100' }))).rejects.toThrow(/per day/);
    await expect(apply(form({ Action: 'Real-money test limits', 'Per action': '$5000', 'Per day': '$500' }))).rejects.toThrow(/Pick/);
  });

  it('sets and clears the test swap fee', async () => {
    const r = await apply(form({ Action: 'Test swap fee', Fee: '0.5%' }));
    expect(config().testSwapFee).toBe(0.005);
    expect(r.summary).toMatch(/0.5%/);
    await apply(form({ Action: 'Test swap fee', Fee: 'Off' }));
    expect(config().testSwapFee).toBe(undefined);
    await expect(apply(form({ Action: 'Test swap fee', Fee: '5%' }))).rejects.toThrow(/Pick/);
  });

  it('asks old versions to update, and stops asking', async () => {
    await apply(form({ Action: 'Ask users to update', 'Lowest version that is still fine': '1.0.1', Message: 'Security fix.' }));
    expect(config()).toMatchObject({ minVersion: '1.0.1', updateMessage: 'Security fix.' });
    await expect(apply(form({ Action: 'Ask users to update', 'Lowest version that is still fine': 'v2', Message: '' }))).rejects.toThrow(/look like 1.0.1/);
    await apply(form({ Action: 'Ask users to update', 'Lowest version that is still fine': '_No response_', Message: '_No response_' }));
    expect(config().minVersion).toBe(undefined);
  });
});
