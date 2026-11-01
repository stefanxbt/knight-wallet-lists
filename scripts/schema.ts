// Shape and checks for the public lists in /lists.
// This is a copy of src/lists/schema.ts in the app repo; keep the two the same.
// The app repo re-checks every list with its own copy when it syncs them.
// It has no imports so it runs under plain Node (scripts/apply-request.mjs).
// Keep it to type-erasable TypeScript: no enums, no namespaces.

export const LIST_CHAINS = ['bitcoin', 'ethereum', 'bsc', 'polygon', 'base', 'arbitrum', 'optimism', 'blackfort', 'hyperevm', 'solana', 'tron'] as const;
export type ListChain = (typeof LIST_CHAINS)[number];

// Chains that have tokens and NFTs at a contract address.
export const TOKEN_CHAINS = ['ethereum', 'bsc', 'polygon', 'base', 'arbitrum', 'optimism', 'blackfort', 'hyperevm', 'solana', 'tron'] as const;
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

// The app reads downloaded lists with skipUnknownChains, so a list that adds a network a newer
// app knows about (for example Base) still loads in an older app, minus that network's rows.
// The form robot checks strictly, so a typo in a network name is still refused.
export type ParseOptions = { skipUnknownChains?: boolean };
const knownChainsOnly = (raws: unknown[], key: string, opts: ParseOptions): unknown[] =>
  opts.skipUnknownChains ? raws.filter((r) => !isFutureChainRow(r, key)) : raws;
// Only a well-formed network name counts as "a newer network"; anything odd still fails the list.
const isFutureChainRow = (r: unknown, key: string): boolean => {
  const chain = r && typeof r === 'object' ? (r as Record<string, unknown>)[key] : undefined;
  return typeof chain === 'string' && /^[a-z0-9-]{2,20}$/.test(chain) && !isTokenChain(chain);
};

export function parseTokenList(input: unknown, opts: ParseOptions = {}): TokenList {
  const root = object(input, 'token list');
  version(root);
  const tokens = knownChainsOnly(array(root.tokens, 'tokens'), 'chain', opts).map((raw, i): ListedToken => {
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

export function parseBlocklist(input: unknown, opts: ParseOptions = {}): Blocklist {
  const root = object(input, 'blocklist');
  version(root);
  const tokens = knownChainsOnly(array(root.tokens, 'tokens'), 'chain', opts).map((raw, i): BlockedToken => {
    const t = object(raw, `tokens[${i}]`);
    const chain = tokenChain(t.chain, `tokens[${i}].chain`);
    return {
      chain,
      address: address(chain, t.address, `tokens[${i}].address`),
      reason: text(t.reason, `tokens[${i}].reason`),
      added: date(t.added, `tokens[${i}].added`),
    };
  });
  const nfts = knownChainsOnly(array(root.nfts, 'nfts'), 'chain', opts).map((raw, i): BlockedNft => {
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
  // Colour style. Left out: the app picks one at random each time it opens.
  colour?: BannerColour;
  // Opens a screen in the app instead of `link`. Older app versions open `link`.
  action?: BannerAction;
};

export const BANNER_COLOURS = ['aurora', 'ember', 'violet', 'ocean', 'mint', 'gold'] as const;
export type BannerColour = (typeof BANNER_COLOURS)[number];
export const BANNER_ACTIONS = ['invite', 'receive', 'request', 'friends', 'swap'] as const;
export type BannerAction = (typeof BANNER_ACTIONS)[number];

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
    const colour = b.colour as BannerColour | undefined;
    if (colour !== undefined && !BANNER_COLOURS.includes(colour)) fail(`${at}.colour must be one of ${BANNER_COLOURS.join(', ')}`);
    const action = b.action as BannerAction | undefined;
    if (action !== undefined && !BANNER_ACTIONS.includes(action)) fail(`${at}.action must be one of ${BANNER_ACTIONS.join(', ')}`);
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
      ...(colour ? { colour } : {}),
      ...(action ? { action } : {}),
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

// App settings the team can change without an app update: messages to every
// user, an "please update" prompt, and emergency off switches. Switches can only
// turn a feature off, never on, so a bad or tampered file can't enable anything
// the app itself keeps disabled (for example sending on mainnet).
export const FEATURE_SWITCHES = ['swap', 'walletconnect', 'dappBrowser', 'send'] as const;
export type FeatureSwitch = (typeof FEATURE_SWITCHES)[number];

// Every feature the admin page can show or hide without a new app build, for example when it
// breaks or isn't released yet. Each one is in one of three states:
//   on       everyone sees it
//   testers  only wallets on the signed tester list (realMoneyTesters) see it
//   off      nobody sees it: its buttons, rows and screens are hidden, not just disabled
// `standard` is the state when the lists don't mention the feature. RULE: every new feature is
// added here, with standard 'testers' until it is released, so a new build never shows an
// unreleased feature to everyone, even when the lists can't be downloaded.
// These only show or hide things. Safety locks in the app's code (real money before the audit,
// tester limits, country rules) stay in force whatever the lists say.
export const FEATURE_STATES = ['on', 'testers', 'off'] as const;
export type FeatureState = (typeof FEATURE_STATES)[number];
export const APP_FEATURES = {
  swap: { label: 'Swaps', standard: 'on' },
  send: { label: 'Sending', standard: 'on' },
  walletconnect: { label: 'WalletConnect', standard: 'on' },
  dappBrowser: { label: 'dApp browser', standard: 'on' },
  hyperliquid: { label: 'Hyperliquid trading', standard: 'on' },
  predictions: { label: 'Predictions (Polymarket)', standard: 'on' },
  sendByLink: { label: 'Send by link', standard: 'on' },
  tapToPay: { label: 'Tap to pay (NFC)', standard: 'testers' },
  requests: { label: 'Payment requests', standard: 'on' },
  friends: { label: 'Friends', standard: 'on' },
  invite: { label: 'Invite friends', standard: 'on' },
  ledger: { label: 'Ledger hardware wallet', standard: 'testers' },
  allCoins: { label: 'All coins list (Swap)', standard: 'testers' },
  crossChain: { label: 'Cross-chain swaps', standard: 'testers' },
  walletMove: { label: 'Move wallet to another phone (QR)', standard: 'testers' },
} as const satisfies Record<string, { label: string; standard: FeatureState }>;
export type AppFeature = keyof typeof APP_FEATURES;
const isAppFeature = (key: string): key is AppFeature => Object.prototype.hasOwnProperty.call(APP_FEATURES, key);

// Features that can be switched off by country, for example where trading or betting apps are
// not allowed. `blocked`: two-letter country codes (ISO 3166-1, e.g. "US"). `unknownOff`: also off
// when the app can't tell the country.
export const REGION_FEATURES = ['hyperliquidTrade', 'predictions', 'swap', 'dappBrowser', 'walletconnect'] as const;
export type RegionFeature = (typeof REGION_FEATURES)[number];
export type RegionRule = { blocked: string[]; unknownOff: boolean };
const COUNTRY = /^[A-Z]{2}$/;

export const NOTICE_LEVELS = ['info', 'warning', 'critical'] as const;
export type NoticeLevel = (typeof NOTICE_LEVELS)[number];

export type Notice = {
  id: string;
  title: string;
  text: string;
  level: NoticeLevel;
  active: boolean;
  link?: string;
  start?: string;
  end?: string;
};

export type AppConfig = {
  version: 1;
  // When the team last changed these settings (UTC, set by scripts/sign-lists.mjs in the lists
  // repo, inside the signed text). Phones refuse settings older than the newest they have seen,
  // so an old signed copy can't be replayed to switch a hidden feature back on or bring back a
  // removed tester.
  issued?: string;
  notices: Notice[];
  switchedOff: FeatureSwitch[];
  // Show / testers only / hide per feature (see APP_FEATURES). Features not listed use their
  // standard state.
  features?: Partial<Record<AppFeature, FeatureState>>;
  // Versions below this are asked to update, for example after a security fix.
  minVersion?: string;
  updateMessage?: string;
  // Country rules per feature. A feature without a rule is on everywhere.
  regions?: Partial<Record<RegionFeature, RegionRule>>;
  // Wallets (Ethereum address, lowercase) allowed to switch on small real-money tests in the
  // test app. Nobody else sees the switch, so a public test app can't move real money.
  realMoneyTesters?: string[];
  // Knight's LI.FI swap fee during the real-money test only (0.005 = 0.5%, at most 0.01), so the
  // team can check fees reach the fee wallet. Applies only to testers in the test app.
  testSwapFee?: number;
  // Which "Add to … Wallet" buttons Receive shows (see src/walletPass/pass.ts). Each one is
  // switched on only once that wallet's issuer account and signing key are set up.
  walletPasses?: { apple?: boolean; google?: boolean; samsung?: boolean };
  // Real-money test limits in US dollars (test app only; see src/send/smallMainnet.ts, which also
  // caps them at $250 per action and $1,000 per day whatever this says).
  testLimits?: { perActionUsd?: number; perDayUsd?: number };
};

const VERSION = /^\d+\.\d+\.\d+$/;
const ISSUED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// -1, 0 or 1, like a sort comparator. "1.10.0" is newer than "1.9.3".
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

export function parseAppConfig(input: unknown): AppConfig {
  const root = object(input, 'app config');
  version(root);
  const notices = array(root.notices, 'notices').map((raw, i): Notice => {
    const n = object(raw, `notices[${i}]`);
    const at = `notices[${i}]`;
    const id = text(n.id, `${at}.id`, 40);
    if (slugify(id) !== id) fail(`${at}.id "${id}" may only use a-z, 0-9 and -`);
    const level = n.level as NoticeLevel;
    if (!NOTICE_LEVELS.includes(level)) fail(`${at}.level must be one of ${NOTICE_LEVELS.join(', ')}`);
    if (typeof n.active !== 'boolean') fail(`${at}.active must be true or false`);
    let link: string | undefined;
    if (n.link !== undefined) {
      link = text(n.link, `${at}.link`, 300);
      if (normalizeDappUrl(link) !== link) fail(`${at}.link "${link}" must be a lowercase https address`);
    }
    const start = n.start === undefined ? undefined : date(n.start, `${at}.start`);
    const end = n.end === undefined ? undefined : date(n.end, `${at}.end`);
    if (start && end && end < start) fail(`${at} ends before it starts`);
    return {
      id,
      title: text(n.title, `${at}.title`, 60),
      text: text(n.text, `${at}.text`, 300),
      level,
      active: n.active,
      ...(link ? { link } : {}),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    };
  });
  unique(notices, (n) => n.id, 'Message');
  const switchedOff = array(root.switchedOff, 'switchedOff') as FeatureSwitch[];
  if (switchedOff.some((s) => !FEATURE_SWITCHES.includes(s))) {
    fail(`switchedOff may only list ${FEATURE_SWITCHES.join(', ')}`);
  }
  unique(switchedOff, (s) => s, 'Switch');
  // Lenient on purpose: an older app ignores features it doesn't know yet (added for newer
  // versions), and a state it doesn't understand counts as off, so nothing is shown by mistake.
  let features: AppConfig['features'];
  if (root.features !== undefined) {
    const raw = object(root.features, 'features');
    features = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!isAppFeature(key)) continue;
      features[key] = (FEATURE_STATES as readonly unknown[]).includes(value) ? (value as FeatureState) : 'off';
    }
  }
  let issued: string | undefined;
  if (root.issued !== undefined) {
    issued = text(root.issued, 'issued', 30);
    if (!ISSUED.test(issued) || Number.isNaN(Date.parse(issued))) fail('issued must be a UTC time like 2026-10-31T20:45:00.000Z');
  }
  let minVersion: string | undefined;
  if (root.minVersion !== undefined) {
    minVersion = text(root.minVersion, 'minVersion', 20);
    if (!VERSION.test(minVersion)) fail('minVersion must look like 1.2.0');
  }
  let regions: AppConfig['regions'];
  if (root.regions !== undefined) {
    const raw = object(root.regions, 'regions');
    regions = {};
    for (const [feature, value] of Object.entries(raw)) {
      if (!(REGION_FEATURES as readonly string[]).includes(feature)) fail(`regions may only name ${REGION_FEATURES.join(', ')}`);
      const rule = object(value, `regions.${feature}`);
      const blocked = array(rule.blocked, `regions.${feature}.blocked`).map((c) => String(c).toUpperCase());
      if (blocked.some((c) => !COUNTRY.test(c))) fail(`regions.${feature}.blocked must be two-letter country codes like US`);
      if (blocked.length > 250) fail(`regions.${feature}.blocked is too long`);
      unique(blocked, (c) => c, 'Country');
      regions[feature as RegionFeature] = { blocked: blocked.sort(), unknownOff: rule.unknownOff === true };
    }
  }
  let realMoneyTesters: string[] | undefined;
  if (root.realMoneyTesters !== undefined) {
    realMoneyTesters = array(root.realMoneyTesters, 'realMoneyTesters').map((a) => String(a).toLowerCase());
    if (realMoneyTesters.some((a) => !/^0x[0-9a-f]{40}$/.test(a))) fail('realMoneyTesters must be wallet addresses like 0x1234…');
    if (realMoneyTesters.length > 50) fail('realMoneyTesters may list at most 50 wallets');
    unique(realMoneyTesters, (a) => a, 'Tester');
  }
  let testSwapFee: number | undefined;
  if (root.testSwapFee !== undefined) {
    testSwapFee = root.testSwapFee as number;
    if (typeof testSwapFee !== 'number' || !Number.isFinite(testSwapFee) || testSwapFee < 0 || testSwapFee > 0.01) {
      fail('testSwapFee must be a share between 0 and 0.01 (1%)');
    }
  }
  let testLimits: AppConfig['testLimits'];
  if (root.testLimits !== undefined) {
    const l = root.testLimits as Record<string, unknown>;
    if (!l || typeof l !== 'object' || Array.isArray(l)) fail('testLimits must be an object');
    testLimits = {};
    for (const [k, max] of [['perActionUsd', 250], ['perDayUsd', 1000]] as const) {
      const v = l[k];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) fail(`testLimits.${k} must be a number from 1 to ${max}`);
      testLimits[k] = v;
    }
  }
  let walletPasses: AppConfig['walletPasses'];
  if (root.walletPasses !== undefined) {
    const w = root.walletPasses as Record<string, unknown>;
    if (!w || typeof w !== 'object' || Array.isArray(w)) fail('walletPasses must be an object');
    walletPasses = {};
    for (const [k, v] of Object.entries(w)) {
      if (k !== 'apple' && k !== 'google' && k !== 'samsung') fail(`walletPasses: unknown wallet ${k}`);
      if (typeof v !== 'boolean') fail(`walletPasses.${k} must be true or false`);
      if (v) walletPasses[k] = true;
    }
  }
  return {
    version: 1,
    ...(issued ? { issued } : {}),
    notices,
    switchedOff,
    ...(features && Object.keys(features).length ? { features } : {}),
    ...(regions ? { regions } : {}),
    ...(realMoneyTesters?.length ? { realMoneyTesters } : {}),
    ...(testSwapFee ? { testSwapFee } : {}),
    ...(walletPasses && Object.keys(walletPasses).length ? { walletPasses } : {}),
    ...(testLimits && Object.keys(testLimits).length ? { testLimits } : {}),
    ...(minVersion ? { minVersion } : {}),
    ...(root.updateMessage !== undefined ? { updateMessage: text(root.updateMessage, 'updateMessage', 300) } : {}),
  };
}

export function isNoticeLive(notice: Notice, now: Date = new Date()): boolean {
  return isBannerLive({ ...notice, link: '', placement: 'home' }, now);
}

// The state a feature is in. App versions from before the three states only read the older
// emergency list (switchedOff), so the robot keeps Send, Swap, WalletConnect and the dApp browser
// on that list whenever they are not on for everyone: old versions then hide them, and newer
// ones still let testers see a "testers only" feature.
export function featureState(config: AppConfig, feature: AppFeature): FeatureState {
  const state = config.features?.[feature];
  if ((config.switchedOff as readonly string[]).includes(feature)) return state === 'testers' ? 'testers' : 'off';
  return state ?? APP_FEATURES[feature].standard;
}

// Whether this phone shows a feature. `tester`: the wallet in use is on the signed tester list.
export function featureShown(config: AppConfig, feature: AppFeature, tester: boolean): boolean {
  const state = featureState(config, feature);
  return state === 'on' || (state === 'testers' && tester);
}

// When these settings were made, in milliseconds (0 when the file has no time, as before
// rollback protection existed).
export function configIssuedAt(config: AppConfig): number {
  return config.issued ? Date.parse(config.issued) : 0;
}
