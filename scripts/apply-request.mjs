// Applies one change request from a GitHub issue form (.github/ISSUE_TEMPLATE)
// to the lists in /lists. Run by .github/workflows/lists.yml.
//
//   node scripts/lists/apply-request.mjs <event.json> <out-dir>
//
// Writes <out-dir>/message.md (the reply posted on the issue) and, on success,
// <out-dir>/commit.txt. Exits 1 when the request cannot be applied.
// The issue text is only ever read as data here, never passed to a shell.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addressKey,
  isBannerLive,
  isValidAddress,
  normalizeDappUrl,
  normalizeDomain,
  parseBannerList,
  parseBlocklist,
  parseDappList,
  parseTokenList,
  slugify,
} from './schema.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTS = process.env.LISTS_DIR ?? path.join(ROOT, 'lists');

const NETWORKS = {
  Bitcoin: 'bitcoin',
  Ethereum: 'ethereum',
  'BNB Chain': 'bsc',
  Polygon: 'polygon',
  BlackFort: 'blackfort',
  Solana: 'solana',
  Tron: 'tron',
};
const PLACEMENTS = { 'Home screen': 'home', 'Explore tab': 'explore', 'Swap screen': 'swap' };
const MAX_IMAGE_BYTES = 1024 * 1024;
const CATEGORIES = { Exchange: 'exchange', Lending: 'lending', Staking: 'staking', NFTs: 'nft', Other: 'other' };

class RequestError extends Error {}
const fail = (message) => {
  throw new RequestError(message);
};

// Issue forms arrive as "### Label\n\nanswer" sections.
export function parseForm(body) {
  const fields = {};
  const parts = String(body ?? '').replace(/\r\n/g, '\n').split(/^### +/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf('\n');
    const label = (newline === -1 ? part : part.slice(0, newline)).trim();
    const value = newline === -1 ? '' : part.slice(newline + 1).trim();
    fields[label] = value === '_No response_' ? '' : value;
  }
  return fields;
}

function checked(value) {
  return value
    .split('\n')
    .map((line) => line.match(/^- \[[xX]\] (.+)$/))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

function field(fields, label, { optional = false } = {}) {
  const value = (fields[label] ?? '').trim();
  if (!value && !optional) fail(`"${label}" is empty.`);
  return value;
}

function network(fields, label = 'Network', { tokensOnly = true } = {}) {
  const value = field(fields, label);
  const chain = NETWORKS[value];
  if (!chain || (tokensOnly && chain === 'bitcoin')) fail(`"${value}" is not a network I can use here.`);
  return chain;
}

function contract(fields, chain, label) {
  const value = field(fields, label);
  if (!isValidAddress(chain, value)) fail(`"${value}" is not a valid ${chain} address. Copy it again from a block explorer.`);
  return value;
}

const today = () => new Date().toISOString().slice(0, 10);

function read(file) {
  return JSON.parse(fs.readFileSync(path.join(LISTS, file), 'utf8'));
}

function write(file, data) {
  fs.writeFileSync(path.join(LISTS, file), JSON.stringify(data, null, 2) + '\n');
}

function addDapp(fields) {
  const list = parseDappList(read('dapps.json'));
  const name = field(fields, 'dApp name');
  const url = normalizeDappUrl(field(fields, 'Website address'));
  if (!url) fail('The website address must start with https:// and be a normal domain name.');
  const category = CATEGORIES[field(fields, 'Category')] ?? 'other';
  const chains = checked(field(fields, 'Networks')).map((n) => NETWORKS[n]).filter(Boolean);
  if (chains.length === 0) fail('Tick at least one network.');
  const host = normalizeDomain(url);
  if (list.dapps.some((d) => normalizeDomain(d.url) === host)) fail(`A dApp on ${host} is already on the list.`);
  let id = slugify(name) || 'dapp';
  while (list.dapps.some((d) => d.id === id)) id = `${id}-2`;
  const dapp = {
    id,
    name,
    url,
    description: field(fields, 'Short description'),
    category,
    chains,
    ...(checked(fields['Show at the top'] ?? '').length ? { featured: true } : {}),
  };
  list.dapps.push(dapp);
  write('dapps.json', parseDappList(list));
  return { summary: `Added the dApp **${name}** (${url}).`, commit: `Add dApp ${name}` };
}

function removeDapp(fields) {
  const list = parseDappList(read('dapps.json'));
  const wanted = field(fields, 'dApp name or website');
  const host = normalizeDomain(wanted);
  const match = list.dapps.find(
    (d) => d.name.toLowerCase() === wanted.toLowerCase() || d.id === slugify(wanted) || (host && normalizeDomain(d.url) === host),
  );
  if (!match) fail(`No dApp called "${wanted}" is on the list. The list has: ${list.dapps.map((d) => d.name).join(', ')}.`);
  list.dapps = list.dapps.filter((d) => d !== match);
  write('dapps.json', parseDappList(list));
  return { summary: `Removed the dApp **${match.name}**.`, commit: `Remove dApp ${match.name}` };
}

function addToken(fields) {
  const list = parseTokenList(read('tokens.json'));
  const chain = network(fields);
  const address = contract(fields, chain, 'Contract address');
  const decimals = Number(field(fields, 'Decimals'));
  if (!Number.isInteger(decimals)) fail('Decimals must be a whole number, for example 6 or 18.');
  const blocked = parseBlocklist(read('blocklist.json'));
  if (blocked.tokens.some((t) => addressKey(t.chain, t.address) === addressKey(chain, address))) {
    fail('This token is on the scam blocklist. Unblock it first if that was a mistake.');
  }
  if (list.tokens.some((t) => addressKey(t.chain, t.address) === addressKey(chain, address))) {
    fail('This token is already on the list.');
  }
  const priceId = field(fields, 'CoinGecko ID', { optional: true });
  const symbol = field(fields, 'Symbol').toUpperCase();
  list.tokens.push({ chain, address, symbol, name: field(fields, 'Token name'), decimals, ...(priceId ? { priceId } : {}) });
  write('tokens.json', parseTokenList(list));
  return { summary: `Added the token **${symbol}** on ${chain} (\`${address}\`).`, commit: `Add token ${symbol} on ${chain}` };
}

function removeToken(fields) {
  const list = parseTokenList(read('tokens.json'));
  const chain = network(fields);
  const address = contract(fields, chain, 'Contract address');
  const match = list.tokens.find((t) => addressKey(t.chain, t.address) === addressKey(chain, address));
  if (!match) fail('That token is not on the list.');
  list.tokens = list.tokens.filter((t) => t !== match);
  write('tokens.json', parseTokenList(list));
  return { summary: `Removed the token **${match.symbol}** on ${chain}.`, commit: `Remove token ${match.symbol} on ${chain}` };
}

function target(fields) {
  const kind = field(fields, 'What is it?');
  if (kind === 'Website') {
    const domain = normalizeDomain(field(fields, 'Contract address or website'));
    if (!domain) fail('That does not look like a website address, for example scam-site.com.');
    return { kind: 'domain', domain, label: `the website **${domain}**` };
  }
  const chain = network(fields);
  const address = contract(fields, chain, 'Contract address or website');
  if (kind === 'Token') return { kind: 'token', chain, address, label: `the token \`${address}\` on ${chain}` };
  if (kind === 'NFT collection') return { kind: 'nft', chain, address, label: `the NFT collection \`${address}\` on ${chain}` };
  return fail(`"${kind}" is not something I can block.`);
}

function sameEntry(t, entry) {
  if (t.kind === 'domain') return entry.domain === t.domain;
  return addressKey(entry.chain, entry.address ?? entry.contract) === addressKey(t.chain, t.address);
}

const SECTION = { domain: 'domains', token: 'tokens', nft: 'nfts' };

function block(fields) {
  const list = parseBlocklist(read('blocklist.json'));
  const t = target(fields);
  const reason = field(fields, 'Why is it a scam?').slice(0, 200);
  const entries = list[SECTION[t.kind]];
  if (entries.some((e) => sameEntry(t, e))) fail(`${t.label} is already blocked.`);
  const added = today();
  if (t.kind === 'domain') entries.push({ domain: t.domain, reason, added });
  else if (t.kind === 'token') entries.push({ chain: t.chain, address: t.address, reason, added });
  else entries.push({ chain: t.chain, contract: t.address, reason, added });
  write('blocklist.json', parseBlocklist(list));

  // A blocked token must not stay on the token list.
  let extra = '';
  if (t.kind === 'token') {
    const tokens = parseTokenList(read('tokens.json'));
    const before = tokens.tokens.length;
    tokens.tokens = tokens.tokens.filter((x) => addressKey(x.chain, x.address) !== addressKey(t.chain, t.address));
    if (tokens.tokens.length !== before) {
      write('tokens.json', parseTokenList(tokens));
      extra = ' It was also taken off the token list.';
    }
  }
  return { summary: `Blocked ${t.label}.${extra}`, commit: `Block ${t.kind === 'domain' ? t.domain : `${t.kind} ${t.address}`}` };
}

function unblock(fields) {
  const list = parseBlocklist(read('blocklist.json'));
  const t = target(fields);
  const key = SECTION[t.kind];
  const before = list[key].length;
  list[key] = list[key].filter((e) => !sameEntry(t, e));
  if (list[key].length === before) fail(`${t.label} is not on the blocklist.`);
  write('blocklist.json', parseBlocklist(list));
  return {
    summary: `Unblocked ${t.label}. Phones that already have it in the built-in list keep blocking it until the next app update.`,
    commit: `Unblock ${t.kind === 'domain' ? t.domain : `${t.kind} ${t.address}`}`,
  };
}

function optionalDate(fields, label) {
  const value = field(fields, label, { optional: true });
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(`"${label}" must be a date like 2026-12-31, or left empty.`);
  }
  return value;
}

// Images dropped into a GitHub form are uploaded to GitHub. They are copied
// into lists/banners/ so phones only ever download from this repo.
const UPLOAD_URL = /https:\/\/(?:github\.com\/user-attachments\/assets\/[0-9a-f-]+|(?:private-)?user-images\.githubusercontent\.com\/[^\s)"'<>]+)/i;

function imageType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp';
  return null;
}

async function downloadImage(text, id) {
  const url = text.match(UPLOAD_URL)?.[0];
  if (!url) fail('I could not find the picture. Drag the image file into the "Image" box and wait until it finishes uploading.');
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'follow' });
  if (!response.ok) fail(`The picture could not be downloaded (GitHub answered ${response.status}). Please try again.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) fail('The picture is bigger than 1 MB. Please use a smaller one.');
  const type = imageType(bytes);
  if (!type) fail('The picture must be a PNG, JPG or WebP file.');
  const file = `${id}.${type}`;
  fs.mkdirSync(path.join(LISTS, 'banners'), { recursive: true });
  fs.writeFileSync(path.join(LISTS, 'banners', file), bytes);
  return file;
}

function bannerStatus(list, now = new Date()) {
  if (list.banners.length === 0) return 'There are no banners now.';
  const rows = list.banners.map((b) => {
    const when = b.start || b.end ? ` (${b.start ?? 'now'} to ${b.end ?? 'no end'})` : '';
    const state = isBannerLive(b, now) ? '🟢 showing' : b.active ? '🟡 on, but outside its dates' : '⚪ off';
    return `| ${b.title} | ${b.placement} | ${state}${when} |`;
  });
  return ['| Banner | Where | Status |', '| --- | --- | --- |', ...rows].join('\n');
}

function findBanner(list, wanted) {
  const match = list.banners.find((b) => b.title.toLowerCase() === wanted.toLowerCase() || b.id === slugify(wanted));
  if (!match) fail(`No banner called "${wanted}". The banners are: ${list.banners.map((b) => b.title).join(', ') || 'none'}.`);
  return match;
}

function bannerBlocklistCheck(link) {
  const host = normalizeDomain(link);
  const blocked = parseBlocklist(read('blocklist.json')).domains.find((d) => host === d.domain || host.endsWith(`.${d.domain}`));
  if (blocked) fail(`${host} is on the scam blocklist, so it cannot be used in a banner.`);
}

async function addBanner(fields) {
  const list = parseBannerList(read('banners.json'));
  const title = field(fields, 'Banner title');
  const link = normalizeDappUrl(field(fields, 'Link'));
  if (!link) fail('The link must start with https:// and be a normal website address.');
  bannerBlocklistCheck(link);
  const placement = PLACEMENTS[field(fields, 'Where should it show?')];
  if (!placement) fail(`Pick where it shows: ${Object.keys(PLACEMENTS).join(', ')}.`);
  const start = optionalDate(fields, 'First day');
  const end = optionalDate(fields, 'Last day');
  let id = slugify(title) || 'banner';
  while (list.banners.some((b) => b.id === id)) id = `${id}-2`;
  const imageText = field(fields, 'Image', { optional: true });
  const image = imageText ? await downloadImage(imageText, id) : undefined;
  const active = checked(fields['Switch on'] ?? '').length > 0;
  list.banners.push({
    id,
    title,
    text: field(fields, 'Banner text'),
    link,
    placement,
    active,
    ...(image ? { image } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  });
  write('banners.json', parseBannerList(list));
  return {
    summary: `Added the banner **${title}** (${active ? 'switched on' : 'switched off'}).\n\n${bannerStatus(list)}`,
    commit: `Add banner ${title}`,
  };
}

function switchBanner(fields) {
  const list = parseBannerList(read('banners.json'));
  const banner = findBanner(list, field(fields, 'Banner title'));
  const on = field(fields, 'Switch') === 'On';
  banner.active = on;
  write('banners.json', parseBannerList(list));
  return {
    summary: `Switched the banner **${banner.title}** ${on ? 'on' : 'off'}.\n\n${bannerStatus(list)}`,
    commit: `Switch banner ${banner.title} ${on ? 'on' : 'off'}`,
  };
}

function removeBanner(fields) {
  const list = parseBannerList(read('banners.json'));
  const banner = findBanner(list, field(fields, 'Banner title'));
  list.banners = list.banners.filter((b) => b !== banner);
  write('banners.json', parseBannerList(list));
  if (banner.image) fs.rmSync(path.join(LISTS, 'banners', banner.image), { force: true });
  return { summary: `Removed the banner **${banner.title}**.\n\n${bannerStatus(list)}`, commit: `Remove banner ${banner.title}` };
}

const ACTIONS = {
  'Add a dApp': addDapp,
  'Remove a dApp': removeDapp,
  'Add a token': addToken,
  'Remove a token': removeToken,
  'Block a scam': block,
  'Unblock something': unblock,
  'Add a banner': addBanner,
  'Switch a banner on or off': switchBanner,
  'Remove a banner': removeBanner,
};

export async function apply(body) {
  const fields = parseForm(body);
  const action = ACTIONS[fields.Action];
  if (!action) fail('This issue is not a list change form.');
  return await action(fields);
}

async function main() {
  const [eventPath, outDir] = process.argv.slice(2);
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const { summary, commit } = await apply(event.issue.body);
    fs.writeFileSync(path.join(outDir, 'commit.txt'), `${commit}\n\nRequested in #${event.issue.number}\n`);
    fs.writeFileSync(
      path.join(outDir, 'message.md'),
      `✅ Done. ${summary}\n\nThe app picks this up the next time it is opened (it can take up to 5 minutes to reach phones).`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fs.writeFileSync(
      path.join(outDir, 'message.md'),
      `❌ Nothing was changed: ${reason}\n\nTo try again, open a new request with the fix. Editing this one does not run it again.`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
