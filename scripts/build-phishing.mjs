// Builds the scam-website list the app downloads, from two free public lists:
//   - MetaMask eth-phishing-detect (DBAD licence): blacklist, whitelist, fuzzylist
//   - ScamSniffer scam-database (GPL-3.0; the public copy is about 7 days behind)
// About 470,000 domains is too much text for a phone, so each blocked domain is stored as the
// first 6 bytes of its SHA-256, sorted (phishing/blocked.bin, about 3 MB). The phone hashes the site
// it is about to open and looks it up; the site never leaves the phone.
//
// node scripts/build-phishing.mjs <out dir> [metamask.json] [scamsniffer.json]
// Without files it downloads both lists.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SOURCES = {
  metamask: 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json',
  scamsniffer: 'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json',
};
export const HASH_BYTES = 6;

export function cleanDomain(value) {
  if (typeof value !== 'string') return null;
  const d = value.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

export function domainHash(domain) {
  return createHash('sha256').update(domain).digest().subarray(0, HASH_BYTES);
}

// Sorted, de-duplicated hashes as one buffer.
export function packHashes(domains) {
  const hashes = [...new Set(domains)].map(domainHash).sort(Buffer.compare);
  const out = [];
  for (const h of hashes) if (!out.length || !out[out.length - 1].equals(h)) out.push(h);
  return Buffer.concat(out);
}

export function buildLists(metamask, scamsniffer) {
  if (!Array.isArray(metamask?.blacklist) || metamask.blacklist.length < 1000) throw new Error('MetaMask list looks wrong');
  if (!Array.isArray(scamsniffer) || scamsniffer.length < 1000) throw new Error('ScamSniffer list looks wrong');
  const allow = new Set((metamask.whitelist ?? []).map(cleanDomain).filter(Boolean));
  const blocked = [...metamask.blacklist, ...scamsniffer].map(cleanDomain).filter((d) => d && !allow.has(d));
  const bin = packHashes(blocked);
  const extra = {
    version: 1,
    hashBytes: HASH_BYTES,
    count: bin.length / HASH_BYTES,
    whitelist: [...allow].sort(),
    fuzzylist: (metamask.fuzzylist ?? []).map(cleanDomain).filter(Boolean),
    tolerance: typeof metamask.tolerance === 'number' ? metamask.tolerance : 1,
    sources: [
      { name: 'MetaMask eth-phishing-detect', url: 'https://github.com/MetaMask/eth-phishing-detect', licence: 'DBAD Public License 1.2' },
      { name: 'ScamSniffer scam-database', url: 'https://github.com/scamsniffer/scam-database', licence: 'GPL-3.0' },
    ],
  };
  return { bin, extra };
}

async function load(file, url) {
  if (file) return JSON.parse(await readFile(file, 'utf8'));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, mmFile, ssFile] = process.argv.slice(2);
  const { bin, extra } = buildLists(await load(mmFile, SOURCES.metamask), await load(ssFile, SOURCES.scamsniffer));
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'blocked.bin'), bin);
  await writeFile(join(out, 'meta.json'), `${JSON.stringify(extra, null, 1)}\n`);
  console.log(`${extra.count} blocked domains`);
}
