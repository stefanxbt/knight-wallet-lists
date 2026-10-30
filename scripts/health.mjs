// Checks every outside service the wallet app depends on and prints a status file
// (status/health.json on the "status" branch), which the admin page shows.
// Run by .github/workflows/health.yml every three hours. Only public endpoints are
// called, the same ones the app calls; no keys and nothing about users.
// Usage: node scripts/health.mjs > health.json

const TIMEOUT_MS = 15_000;
// Slower than this still works, but users will notice.
const SLOW_MS = 4_000;

const rpc = (method, params = []) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
const evm = (url) => ({ url, init: rpc('eth_blockNumber'), ok: (b) => typeof b.result === 'string' && BigInt(b.result) > 0n, show: (b) => `block ${BigInt(b.result)}` });

// group, name, what the app uses it for, and how to check it.
export const SERVICES = [
  ['networks', 'Ethereum', 'Balances and sending', evm('https://ethereum-rpc.publicnode.com')],
  ['networks', 'Ethereum Sepolia (test)', 'Test sending', evm('https://ethereum-sepolia-rpc.publicnode.com')],
  ['networks', 'BNB Chain', 'Balances and sending', evm('https://bsc-rpc.publicnode.com')],
  ['networks', 'BNB Chain test', 'Test sending', evm('https://bsc-testnet-rpc.publicnode.com')],
  ['networks', 'Polygon', 'Balances and sending', evm('https://polygon-bor-rpc.publicnode.com')],
  ['networks', 'Polygon Amoy (test)', 'Test sending', evm('https://polygon-amoy-bor-rpc.publicnode.com')],
  ['networks', 'BlackFort', 'BXN balances and sending', evm('https://rpc.blackfort.network/mainnet/rpc')],
  ['networks', 'BlackFort test', 'Test sending', evm('https://rpc.blackfort.network/testnet/rpc')],
  ['networks', 'BlackFortScan', 'Backup for BXN balances', { url: 'https://blackfortscan.com/api?module=block&action=eth_block_number', ok: (b) => typeof b.result === 'string' }],
  ['networks', 'Solana', 'Balances and sending', { url: 'https://api.mainnet-beta.solana.com', init: rpc('getSlot'), ok: (b) => b.result > 0, show: (b) => `slot ${b.result}` }],
  ['networks', 'Solana devnet (test)', 'Test sending', { url: 'https://api.devnet.solana.com', init: rpc('getSlot'), ok: (b) => b.result > 0, show: (b) => `slot ${b.result}` }],
  ['networks', 'HyperEVM', 'HYPE balances and sending', evm('https://rpc.hyperliquid.xyz/evm')],
  ['networks', 'HyperEVM test', 'Test sending', evm('https://rpc.hyperliquid-testnet.xyz/evm')],
  ['networks', 'Hyperliquid', 'Trading balances', { url: 'https://api.hyperliquid.xyz/info', init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'meta' }) }, ok: (b) => Array.isArray(b.universe), show: (b) => `${b.universe.length} markets` }],
  ['networks', 'Bitcoin (mempool.space)', 'Balances and sending', { url: 'https://mempool.space/api/blocks/tip/height', ok: (b) => b > 0, show: (b) => `block ${b}` }],
  ['networks', 'Bitcoin testnet4', 'Test sending', { url: 'https://mempool.space/testnet4/api/blocks/tip/height', ok: (b) => b > 0, show: (b) => `block ${b}` }],
  ['networks', 'Tron (TronGrid)', 'TRX and USDT balances, sending', { url: 'https://api.trongrid.io/wallet/getnowblock', init: { method: 'POST' }, ok: (b) => !!b.block_header, show: (b) => `block ${b.block_header.raw_data.number}` }],
  ['networks', 'Tron Nile (test)', 'Test sending', { url: 'https://nile.trongrid.io/wallet/getnowblock', init: { method: 'POST' }, ok: (b) => !!b.block_header, show: (b) => `block ${b.block_header.raw_data.number}` }],
  ['prices', 'CoinGecko', 'Prices, charts, price alerts', { url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,bxn&vs_currencies=usd', ok: (b) => b.bitcoin?.usd > 0, show: (b) => (b.bxn?.usd ? `BTC $${b.bitcoin.usd}, BXN $${b.bxn.usd}` : `BTC $${b.bitcoin.usd}, no BXN price`), warn: (b) => !b.bxn?.usd }],
  ['prices', 'DefiLlama', 'Profit and loss history', { url: 'https://coins.llama.fi/prices/current/coingecko:bitcoin', ok: (b) => b.coins?.['coingecko:bitcoin']?.price > 0 }],
  ['prices', 'Exchange rates (open.er-api.com)', 'Showing values in EUR, AED, KES…', { url: 'https://open.er-api.com/v6/latest/USD', ok: (b) => b.result === 'success' && b.rates?.EUR > 0 }],
  ['apps', 'LI.FI', 'Swap quotes', { url: 'https://li.quest/v1/chains', ok: (b) => Array.isArray(b.chains) && b.chains.length > 0, show: (b) => `${b.chains.length} chains` }],
  ['apps', 'WalletConnect relay (Reown)', 'Connecting to dApps', { url: 'https://relay.walletconnect.org/health', text: true, ok: () => true }],
  ['knight', 'Instant alerts helper', 'Phone alerts for incoming money', { url: 'https://knight-push.stefanxbt.workers.dev', text: true, ok: (t) => t.includes('Knight push helper') }],
  ['knight', 'Live lists', 'Banners, dApps, tokens, scam list in the app', { url: 'https://raw.githubusercontent.com/stefanxbt/knight-wallet-lists/main/lists/app-config.json', ok: (b) => b.version === 1 }],
  ['knight', 'Scam website list', 'Warning before scam sites', { url: 'https://github.com/stefanxbt/knight-wallet-lists/releases/download/scam-sites/meta.json', ok: (b) => typeof b === 'object' && b !== null }],
  ['knight', 'Test app download', 'Invite links and new testers', { url: 'https://github.com/stefanxbt/non-custody-wallet/releases/tag/android-test', head: true, ok: () => true, hint: 'The app repository is private, so people outside it cannot download the test app from invite links. A public download page fixes this.' }],
];

// What each app feature needs. "all": every service must work; "any": works while at least
// one does (balances still show for the other chains if one is down).
export const FEATURES = [
  ['Balances', 'any', ['Ethereum', 'BNB Chain', 'Polygon', 'BlackFort', 'HyperEVM', 'Solana', 'Bitcoin (mempool.space)', 'Tron (TronGrid)']],
  ['Test sending', 'any', ['Ethereum Sepolia (test)', 'BNB Chain test', 'Polygon Amoy (test)', 'BlackFort test', 'HyperEVM test', 'Solana devnet (test)', 'Bitcoin testnet4', 'Tron Nile (test)']],
  ['Prices and charts', 'all', ['CoinGecko']],
  ['Profit and loss', 'all', ['DefiLlama']],
  ['Other currencies', 'all', ['Exchange rates (open.er-api.com)']],
  ['Swap quotes', 'all', ['LI.FI']],
  ['WalletConnect', 'all', ['WalletConnect relay (Reown)']],
  ['Instant alerts', 'all', ['Instant alerts helper']],
  ['Banners and lists', 'all', ['Live lists']],
  ['Scam warnings', 'all', ['Scam website list']],
  ['Hyperliquid trading', 'all', ['Hyperliquid']],
];

export function featureStatus(services) {
  const by = Object.fromEntries(services.map((s) => [s.name, s]));
  return FEATURES.map(([name, rule, needs]) => {
    const list = needs.map((n) => by[n]).filter(Boolean);
    const down = list.filter((s) => s.status === 'down').map((s) => s.name);
    const shaky = list.filter((s) => s.status === 'slow' || s.status === 'warn').map((s) => s.name);
    const status = down.length === 0 ? (shaky.length ? 'slow' : 'up')
      : rule === 'any' && down.length < list.length ? 'partial' : 'down';
    return { name, status, problems: [...down, ...shaky] };
  });
}

// Keeps the last 30 days of checks (one every three hours) for the admin charts.
export const HISTORY_LENGTH = 240;
export function addToHistory(history, report) {
  const entry = { t: report.checkedAt, s: Object.fromEntries(report.services.map((x) => [x.name, [x.status === 'ok' ? 1 : x.status === 'down' ? 0 : 0.5, x.ms]])) };
  return { version: 1, checks: [...(history?.checks ?? []), entry].slice(-HISTORY_LENGTH) };
}

async function checkOne([group, name, usedFor, c], fetchImpl) {
  const started = Date.now();
  const base = { group, name, usedFor };
  try {
    const res = await fetchImpl(c.url, { ...(c.init ?? {}), ...(c.head ? { method: 'HEAD', redirect: 'follow' } : {}), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Date.now() - started;
    if (!res.ok) return { ...base, status: 'down', ms, detail: `HTTP ${res.status}`, ...(c.hint ? { hint: c.hint } : {}) };
    const body = c.head ? null : c.text ? await res.text() : await res.json();
    if (!c.ok(body)) return { ...base, status: 'down', ms, detail: 'Unexpected answer' };
    const detail = c.show ? c.show(body) : 'Working';
    const status = c.warn?.(body) ? 'warn' : ms > SLOW_MS ? 'slow' : 'ok';
    return { ...base, status, ms, detail };
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError';
    return { ...base, status: 'down', ms: Date.now() - started, detail: timedOut ? `No answer in ${TIMEOUT_MS / 1000}s` : String(e?.message ?? e).slice(0, 120), ...(c.hint ? { hint: c.hint } : {}) };
  }
}

export async function checkAll(fetchImpl = fetch, now = new Date()) {
  const services = await Promise.all(SERVICES.map((s) => checkOne(s, fetchImpl)));
  const count = (s) => services.filter((x) => x.status === s).length;
  return { version: 1, checkedAt: now.toISOString(), summary: { ok: count('ok'), slow: count('slow'), warn: count('warn'), down: count('down') }, services, features: featureStatus(services) };
}

// Usage: node scripts/health.mjs > health.json
//        node scripts/health.mjs --history old-history.json health.json > history.json
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--history') {
    const { readFileSync, existsSync } = await import('node:fs');
    const [oldPath, reportPath] = process.argv.slice(3);
    const old = existsSync(oldPath) ? JSON.parse(readFileSync(oldPath, 'utf8')) : null;
    process.stdout.write(JSON.stringify(addToHistory(old, JSON.parse(readFileSync(reportPath, 'utf8')))) + '\n');
  } else {
    const report = await checkAll();
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
}
