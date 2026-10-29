// Shape and checks for the public lists in /lists.
// This is a copy of src/lists/schema.ts in the app repo; keep the two the same.
// The app repo re-checks every list with its own copy when it syncs them.
// It has no imports so it runs under plain Node (scripts/apply-request.mjs).
// Keep it to type-erasable TypeScript: no enums, no namespaces.

export const LIST_CHAINS = ['bitcoin', 'ethereum', 'bsc', 'polygon', 'blackfort', 'solana', 'tron'] as const;
export type ListChain = (typeof LIST_CHAINS)[number];

// Chains that have tokens and NFTs at a contract address.
export const TOKEN_CHAINS = ['ethereum', 'bsc', 'polygon', 'blackfort', 'solana', 'tron'] as const;
export type TokenChain = (typeof TOKEN_CHAINS)[number];

export const DAPP_CATEGORIES = ['exchange', 'lending', 'staking', 'nft', 'other'] as const;
export type DappCategory = (typeof DAPP_CATEGORIES)[number];

export type Dapp = {
  id: string;
  name: string;
  url: string;
  description: string;
  category: DappCategory;
  chains: ListChain[];
  featured?: boolean;
};

export type ListedToken = {
  chain: TokenChain;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceId?: string;
};

export type BlockedToken = { chain: TokenChain; address: string; reason: string; added: string };
export type BlockedNft = { chain: TokenChain; contract: string; reason: string; added: string };
export type BlockedDomain = { domain: string; reason: string; added: string };

export type DappList = { version: 1; dapps: Dapp[] };
export type TokenList = { version: 1; tokens: ListedToken[] };
export type Blocklist = { version: 1; tokens: BlockedToken[]; nfts: BlockedNft[]; domains: BlockedDomain[] };

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isTokenChain(chain: unknown): chain is TokenChain {
  return (TOKEN_CHAINS as readonly unknown[]).includes(chain);
}

export function isValidAddress(chain: TokenChain, address: string): boolean {
  if (chain === 'solana') return SOLANA_ADDRESS.test(address);
  if (chain === 'tron') return TRON_ADDRESS.test(address);
  return EVM_ADDRESS.test(address);
}

// EVM addresses are case-insensitive; Solana and Tron addresses are not.
export function addressKey(chain: TokenChain, address: string): string {
  const trimmed = address.trim();
  return chain === 'solana' || chain === 'tron' ? `${chain}:${trimmed}` : `${chain}:${trimmed.toLowerCase()}`;
}

// Turns "https://www.Example.com/path?x" or "example.com" into "www.example.com".
// Returns null when it is not a plain domain name.
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split(/[/?#]/)[0];
  host = host.replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return DOMAIN.test(host) ? host : null;
}

// dApps must be plain https sites on a real domain name.
export function normalizeDappUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;
  const host = normalizeDomain(trimmed);
  if (!host) return null;
  const rest = trimmed.replace(/^https:\/\/[^/?#]+/i, '');
  return `https://${host}${rest === '/' ? '' : rest}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

class ListError extends Error {}

function fail(message: string): never {
  throw new ListError(message);
}

function text(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} is missing`);
  if (value.length > max) fail(`${field} is longer than ${max} characters`);
  return value;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(`${field} must be a list`);
  return value;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function version(root: Record<string, unknown>) {
  if (root.version !== 1) fail('version must be 1');
}

function tokenChain(value: unknown, field: string): TokenChain {
  if (!isTokenChain(value)) fail(`${field} must be one of ${TOKEN_CHAINS.join(', ')}`);
  return value;
}

function address(chain: TokenChain, value: unknown, field: string): string {
  const s = text(value, field, 64);
  if (!isValidAddress(chain, s)) fail(`${field} "${s}" is not a valid ${chain} address`);
  return s;
}

function date(value: unknown, field: string): string {
  const s = text(value, field, 10);
  if (!DATE.test(s)) fail(`${field} must look like 2026-10-29`);
  return s;
}

function unique<T>(items: T[], key: (item: T) => string, what: string) {
  const seen = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) fail(`${what} ${k} is listed twice`);
    seen.add(k);
  }
}

export function parseDappList(input: unknown): DappList {
  const root = object(input, 'dApp list');
  version(root);
  const dapps = array(root.dapps, 'dapps').map((raw, i): Dapp => {
    const d = object(raw, `dapps[${i}]`);
    const at = `dapps[${i}]`;
    const id = text(d.id, `${at}.id`, 40);
    if (slugify(id) !== id) fail(`${at}.id "${id}" may only use a-z, 0-9 and -`);
    const url = text(d.url, `${at}.url`, 300);
    if (normalizeDappUrl(url) !== url) fail(`${at}.url "${url}" must be a lowercase https address`);
    const category = d.category as DappCategory;
    if (!DAPP_CATEGORIES.includes(category)) fail(`${at}.category must be one of ${DAPP_CATEGORIES.join(', ')}`);
    const chains = array(d.chains, `${at}.chains`) as ListChain[];
    if (chains.length === 0 || chains.some((c) => !LIST_CHAINS.includes(c))) {
      fail(`${at}.chains must list some of ${LIST_CHAINS.join(', ')}`);
    }
    if (d.featured !== undefined && typeof d.featured !== 'boolean') fail(`${at}.featured must be true or false`);
    return {
      id,
      name: text(d.name, `${at}.name`, 60),
      url,
      description: text(d.description, `${at}.description`, 200),
      category,
      chains,
      ...(d.featured ? { featured: true } : {}),
    };
  });
  unique(dapps, (d) => d.id, 'dApp');
  unique(dapps, (d) => d.url, 'dApp address');
  return { version: 1, dapps };
}

export function parseTokenList(input: unknown): TokenList {
  const root = object(input, 'token list');
  version(root);
  const tokens = array(root.tokens, 'tokens').map((raw, i): ListedToken => {
    const t = object(raw, `tokens[${i}]`);
    const at = `tokens[${i}]`;
    const chain = tokenChain(t.chain, `${at}.chain`);
    const decimals = t.decimals;
    if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      fail(`${at}.decimals must be a whole number from 0 to 36`);
    }
    const symbol = text(t.symbol, `${at}.symbol`, 12);
    if (!/^[A-Za-z0-9.$-]+$/.test(symbol)) fail(`${at}.symbol "${symbol}" has odd characters`);
    return {
      chain,
      address: address(chain, t.address, `${at}.address`),
      symbol,
      name: text(t.name, `${at}.name`, 60),
      decimals,
      ...(t.priceId !== undefined ? { priceId: text(t.priceId, `${at}.priceId`, 80) } : {}),
    };
  });
  unique(tokens, (t) => addressKey(t.chain, t.address), 'Token');
  return { version: 1, tokens };
}

export function parseBlocklist(input: unknown): Blocklist {
  const root = object(input, 'blocklist');
  version(root);
  const tokens = array(root.tokens, 'tokens').map((raw, i): BlockedToken => {
    const t = object(raw, `tokens[${i}]`);
    const chain = tokenChain(t.chain, `tokens[${i}].chain`);
    return {
      chain,
      address: address(chain, t.address, `tokens[${i}].address`),
      reason: text(t.reason, `tokens[${i}].reason`),
      added: date(t.added, `tokens[${i}].added`),
    };
  });
  const nfts = array(root.nfts, 'nfts').map((raw, i): BlockedNft => {
    const n = object(raw, `nfts[${i}]`);
    const chain = tokenChain(n.chain, `nfts[${i}].chain`);
    return {
      chain,
      contract: address(chain, n.contract, `nfts[${i}].contract`),
      reason: text(n.reason, `nfts[${i}].reason`),
      added: date(n.added, `nfts[${i}].added`),
    };
  });
  const domains = array(root.domains, 'domains').map((raw, i): BlockedDomain => {
    const d = object(raw, `domains[${i}]`);
    const domain = text(d.domain, `domains[${i}].domain`, 253);
    if (normalizeDomain(domain) !== domain) fail(`domains[${i}].domain "${domain}" must be a plain lowercase domain`);
    return { domain, reason: text(d.reason, `domains[${i}].reason`), added: date(d.added, `domains[${i}].added`) };
  });
  unique(tokens, (t) => addressKey(t.chain, t.address), 'Blocked token');
  unique(nfts, (n) => addressKey(n.chain, n.contract), 'Blocked NFT');
  unique(domains, (d) => d.domain, 'Blocked website');
  return { version: 1, tokens, nfts, domains };
}

// Promo banners, for example for partner wallets and exchanges. The app only
// downloads this list and the images; it never reports views or taps.
export const BANNER_PLACEMENTS = ['home', 'explore', 'swap'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export type Banner = {
  id: string;
  title: string;
  text: string;
  link: string;
  placement: BannerPlacement;
  active: boolean;
  // File name inside lists/banners/, for example "binance.png".
  image?: string;
  // First and last day it shows, in UTC (both included).
  start?: string;
  end?: string;
};

export type BannerList = { version: 1; banners: Banner[] };

const IMAGE_FILE = /^[a-z0-9-]{1,40}\.(png|jpg|webp)$/;

export function parseBannerList(input: unknown): BannerList {
  const root = object(input, 'banner list');
  version(root);
  const banners = array(root.banners, 'banners').map((raw, i): Banner => {
    const b = object(raw, `banners[${i}]`);
    const at = `banners[${i}]`;
    const id = text(b.id, `${at}.id`, 40);
    if (slugify(id) !== id) fail(`${at}.id "${id}" may only use a-z, 0-9 and -`);
    const link = text(b.link, `${at}.link`, 300);
    if (normalizeDappUrl(link) !== link) fail(`${at}.link "${link}" must be a lowercase https address`);
    const placement = b.placement as BannerPlacement;
    if (!BANNER_PLACEMENTS.includes(placement)) fail(`${at}.placement must be one of ${BANNER_PLACEMENTS.join(', ')}`);
    if (typeof b.active !== 'boolean') fail(`${at}.active must be true or false`);
    if (b.image !== undefined && !IMAGE_FILE.test(String(b.image))) fail(`${at}.image must be a file name like banner.png`);
    const start = b.start === undefined ? undefined : date(b.start, `${at}.start`);
    const end = b.end === undefined ? undefined : date(b.end, `${at}.end`);
    if (start && end && end < start) fail(`${at} ends before it starts`);
    return {
      id,
      title: text(b.title, `${at}.title`, 40),
      text: text(b.text, `${at}.text`, 100),
      link,
      placement,
      active: b.active,
      ...(b.image !== undefined ? { image: String(b.image) } : {}),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    };
  });
  unique(banners, (b) => b.id, 'Banner');
  return { version: 1, banners };
}

// Switched on, and today is between its start and end days (UTC).
export function isBannerLive(banner: Banner, now: Date = new Date()): boolean {
  if (!banner.active) return false;
  const today = now.toISOString().slice(0, 10);
  if (banner.start && today < banner.start) return false;
  if (banner.end && today > banner.end) return false;
  return true;
}
