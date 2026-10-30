// Reads a token's symbol, name and decimals straight from its network, so the
// "Add a token" form only needs the network and the contract address.
// Uses free public endpoints; anything it can't read comes back undefined.

const EVM_RPC = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  bsc: 'https://bsc-rpc.publicnode.com',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  blackfort: 'https://rpc.blackfort.network/mainnet/rpc',
};
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const TRON_API = 'https://api.trongrid.io';

const SELECTORS = { name: '0x06fdde03', symbol: '0x95d89b41', decimals: '0x313ce567' };

// ABI-encoded string, or the old bytes32 style some tokens (like MKR) use.
export function decodeAbiString(hex) {
  const data = hex.replace(/^0x/, '');
  if (data.length < 64) return undefined;
  const bytes = (h) => Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/, '').trim();
  if (data.length >= 128 && BigInt(`0x${data.slice(0, 64)}`) === 32n) {
    const length = Number(BigInt(`0x${data.slice(64, 128)}`));
    if (length > 0 && length <= 100) return bytes(data.slice(128, 128 + length * 2)) || undefined;
  }
  return bytes(data.slice(0, 64)) || undefined;
}

function decodeUint(hex) {
  const data = hex?.replace(/^0x/, '');
  if (!data) return undefined;
  const n = Number(BigInt(`0x${data.slice(0, 64)}`));
  return Number.isInteger(n) && n >= 0 && n <= 36 ? n : undefined;
}

async function post(fetchImpl, url, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

async function evm(fetchImpl, chain, address) {
  const call = async (selector) => {
    const r = await post(fetchImpl, EVM_RPC[chain], { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: address, data: selector }, 'latest'] });
    return typeof r.result === 'string' && r.result !== '0x' ? r.result : undefined;
  };
  const [name, symbol, decimals] = await Promise.all([call(SELECTORS.name), call(SELECTORS.symbol), call(SELECTORS.decimals)]);
  return {
    name: name && decodeAbiString(name),
    symbol: symbol && decodeAbiString(symbol),
    decimals: decimals && decodeUint(decimals),
  };
}

async function tron(fetchImpl, address) {
  const call = async (fn) => {
    const r = await post(fetchImpl, `${TRON_API}/wallet/triggerconstantcontract`, {
      owner_address: address, contract_address: address, function_selector: fn, visible: true,
    });
    return r.constant_result?.[0];
  };
  const [name, symbol, decimals] = await Promise.all([call('name()'), call('symbol()'), call('decimals()')]);
  return {
    name: name && decodeAbiString(name),
    symbol: symbol && decodeAbiString(symbol),
    decimals: decimals && decodeUint(decimals),
  };
}

// Solana keeps names in a separate metadata account, so only decimals are read here.
async function solana(fetchImpl, address) {
  const r = await post(fetchImpl, SOLANA_RPC, { jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [address, { encoding: 'jsonParsed' }] });
  const info = r.result?.value?.data?.parsed;
  return { decimals: info?.type === 'mint' ? info.info.decimals : undefined };
}

export async function readTokenInfo(chain, address, fetchImpl = fetch) {
  try {
    if (chain === 'solana') return await solana(fetchImpl, address);
    if (chain === 'tron') return await tron(fetchImpl, address);
    if (EVM_RPC[chain]) return await evm(fetchImpl, chain, address);
  } catch {
    // fall through: the form's own values are used
  }
  return {};
}
