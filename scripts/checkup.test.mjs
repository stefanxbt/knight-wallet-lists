import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkup-'));
process.env.LISTS_DIR = dir;
const { checkup } = await import('./checkup.mjs');

const write = (f, data) => fs.writeFileSync(path.join(dir, f), JSON.stringify(data));
const dapp = (id, url) => ({ id, name: id, url, description: 'x', category: 'other', chains: ['ethereum'] });

describe('checkup', () => {
  it('reports scam links, broken links, ended banners and waiting requests', async () => {
    write('dapps.json', { version: 1, dapps: [dapp('good', 'https://good.com'), dapp('gone', 'https://gone.com'), dapp('evil', 'https://app.evil.com')] });
    write('banners.json', { version: 1, banners: [
      { id: 'old', title: 'Old promo', text: 'x', link: 'https://good.com', placement: 'home', active: true, end: '2026-10-01' },
      { id: 'soon', title: 'Soon over', text: 'x', link: 'https://good.com', placement: 'home', active: true, end: '2026-11-03' },
    ] });
    write('app-config.json', { version: 1, notices: [], switchedOff: ['swap'] });
    const fetchImpl = async (url) => {
      if (url.includes('MetaMask')) return new Response(JSON.stringify({ blacklist: ['evil.com'] }));
      if (url.includes('gone.com')) return new Response('', { status: 404 });
      return new Response('ok');
    };
    const { report, needsAction } = await checkup({ fetchImpl, now: new Date('2026-10-30T12:00:00Z'), openIssues: [{ number: 7, title: 'Block a scam', author: 'someone' }] });
    assert.equal(needsAction, true);
    assert.match(report, /🔴 Do now\n\n- dApp \*\*evil\*\* links to https:\/\/app.evil.com/);
    assert.match(report, /dApp \*\*gone\*\*: https:\/\/gone.com answers 404/);
    assert.match(report, /Banner \*\*Old promo\*\* ended on 2026-10-01 but is still switched on/);
    assert.match(report, /Banner \*\*Soon over\*\* ends on 2026-11-03/);
    assert.match(report, /Request #7 "Block a scam" from @someone is waiting/);
    assert.match(report, /Still switched off for everyone: swap/);
  });

  it('says so when everything is fine', async () => {
    write('dapps.json', { version: 1, dapps: [dapp('good', 'https://good.com')] });
    write('banners.json', { version: 1, banners: [{ id: 'b', title: 'B', text: 'x', link: 'https://good.com', placement: 'home', active: true }] });
    write('app-config.json', { version: 1, notices: [], switchedOff: [] });
    const fetchImpl = async (url) => (url.includes('MetaMask') ? new Response(JSON.stringify({ blacklist: [] })) : new Response('', { status: 403 }));
    const { report, needsAction } = await checkup({ fetchImpl });
    assert.equal(needsAction, false);
    assert.match(report, /✅ Everything looks fine/);
  });
});
