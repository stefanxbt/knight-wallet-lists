// Weekly check-up of the lists, run by .github/workflows/checkup.yml.
//
//   node scripts/checkup.mjs <open-issues.json> > report.md
//
// Checks that dApp and banner links still open and are not on MetaMask's scam
// list, and lists banners and messages that start, end or have ended.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isBannerLive, isNoticeLive, normalizeDomain, parseAppConfig, parseBannerList, parseDappList } from './schema.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTS = process.env.LISTS_DIR ?? path.join(ROOT, 'lists');
const METAMASK = 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json';
const read = (f) => JSON.parse(fs.readFileSync(path.join(LISTS, f), 'utf8'));
const day = (d) => d.toISOString().slice(0, 10);

async function opens(url, fetchImpl) {
  try {
    const r = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Mozilla/5.0 KnightWalletCheckup' } });
    // Many sites block robots with 403 or 429; that is not a broken site.
    if (r.ok || r.status === 403 || r.status === 429) return null;
    return `answers ${r.status}`;
  } catch {
    return 'does not open';
  }
}

function onScamList(url, blacklist) {
  const host = normalizeDomain(url);
  if (!host || !blacklist) return false;
  const parts = host.split('.');
  return parts.slice(0, -1).some((_, i) => blacklist.has(parts.slice(i).join('.')));
}

export async function checkup({ openIssues = [], now = new Date(), fetchImpl = fetch } = {}) {
  const dapps = parseDappList(read('dapps.json')).dapps;
  const banners = parseBannerList(read('banners.json')).banners;
  const config = parseAppConfig(read('app-config.json'));
  const soon = day(new Date(now.getTime() + 7 * 86_400_000));
  const today = day(now);

  let blacklist = null;
  try {
    const r = await fetchImpl(METAMASK, { signal: AbortSignal.timeout(30_000) });
    if (r.ok) blacklist = new Set((await r.json()).blacklist.map((d) => String(d).toLowerCase()));
  } catch {
    // reported below
  }

  const links = [
    ...dapps.map((d) => ({ what: `dApp **${d.name}**`, url: d.url })),
    ...banners.map((b) => ({ what: `banner **${b.title}**`, url: b.link })),
    ...config.notices.filter((n) => n.link).map((n) => ({ what: `message **${n.title}**`, url: n.link })),
  ];
  const results = await Promise.all(links.map(async (l) => ({ ...l, problem: await opens(l.url, fetchImpl) })));

  const urgent = [];
  const todo = [];
  const info = [];
  for (const l of links) if (onScamList(l.url, blacklist)) urgent.push(`${l.what} links to ${l.url}, which is now on MetaMask's scam list. Remove it.`);
  for (const r of results) if (r.problem) todo.push(`${r.what}: ${r.url} ${r.problem}. Check it, and remove it if the site is gone.`);
  for (const b of [...banners, ...config.notices]) {
    const kind = 'placement' in b ? 'Banner' : 'Message';
    if (b.active && b.end && b.end < today) todo.push(`${kind} **${b.title}** ended on ${b.end} but is still switched on. Switch it off or remove it.`);
    else if (b.active && b.end && b.end <= soon) info.push(`${kind} **${b.title}** ends on ${b.end}.`);
    if (b.active && b.start && b.start > today && b.start <= soon) info.push(`${kind} **${b.title}** starts on ${b.start}.`);
  }
  const live = banners.filter((b) => isBannerLive(b, now)).length;
  if (live === 0) info.push('No banner is showing right now.');
  if (banners.some((b) => b.id === 'sample-welcome' && b.active)) todo.push('The sample banner "Banners are live" is still on. Switch it off once you add a real one.');
  for (const i of openIssues) todo.push(`Request #${i.number} "${i.title}" from @${i.author} is waiting. Add the **approved** label to apply it, or close it.`);
  if (!blacklist) info.push("MetaMask's scam list could not be downloaded this time, so links were not checked against it.");
  if (config.switchedOff.length) info.push(`Still switched off for everyone: ${config.switchedOff.join(', ')}.`);

  const section = (title, items) => (items.length ? [`### ${title}`, '', ...items.map((t) => `- ${t}`), ''] : []);
  const report = [
    `Weekly check-up for ${today}.`,
    '',
    ...section('🔴 Do now', urgent),
    ...section('🟡 To do', todo),
    ...section('ℹ️ Good to know', info),
    `Checked ${links.length} links, ${dapps.length} dApps, ${banners.length} banners (${live} showing) and ${config.notices.length} messages.`,
  ];
  if (!urgent.length && !todo.length) report.splice(2, 0, '✅ Everything looks fine. Nothing to do this week.', '');
  return { report: report.join('\n'), needsAction: urgent.length + todo.length > 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const issuesFile = process.argv[2];
  const openIssues = issuesFile ? JSON.parse(fs.readFileSync(issuesFile, 'utf8')) : [];
  const { report } = await checkup({ openIssues });
  process.stdout.write(report + '\n');
}
