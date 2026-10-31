// Signs the live lists so the app can tell they really come from the Knight Wallet team.
// For each lists/<name>.json it writes lists/signed/<name>.json: the exact file text plus an
// Ed25519 signature of it. The app only trusts a signed list whose signature matches the
// public key built into the app; anything else falls back to the lists shipped in the app.
// The private key is the LISTS_SIGNING_KEY secret (64 hex characters). Without it nothing
// is signed and the app keeps using what it has.
// Usage: LISTS_SIGNING_KEY=… node scripts/sign-lists.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SIGNED_FILES = ['dapps.json', 'tokens.json', 'blocklist.json', 'banners.json', 'app-config.json'];
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function privateKey(seedHex) {
  if (!/^[0-9a-f]{64}$/i.test(seedHex)) throw new Error('LISTS_SIGNING_KEY must be 64 hex characters.');
  return crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, 'hex')]), format: 'der', type: 'pkcs8' });
}

export function publicKeyHex(seedHex) {
  return crypto.createPublicKey(privateKey(seedHex)).export({ format: 'der', type: 'spki' }).subarray(SPKI_PREFIX.length).toString('hex');
}

export function signText(seedHex, file, text) {
  // The file name is signed too, so a signed banner list can't be passed off as the blocklist.
  const sig = crypto.sign(null, Buffer.from(`${file}\n${text}`, 'utf8'), privateKey(seedHex)).toString('hex');
  return { version: 1, file, sig, data: text };
}

export function verifySigned(publicHex, envelope) {
  const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicHex, 'hex')]), format: 'der', type: 'spki' });
  return crypto.verify(null, Buffer.from(`${envelope.file}\n${envelope.data}`, 'utf8'), key, Buffer.from(envelope.sig, 'hex'));
}

// Puts the time of the last real change into app-config ("issued"), inside the signed text.
// Phones refuse settings older than the newest they have seen, so an old signed copy can't be
// replayed (for example to bring back a feature that was hidden). Re-signing unchanged settings
// keeps the old time; a change always moves it forward, even if the clock goes back.
export function stampIssued(text, previousData, now = Date.now()) {
  const config = JSON.parse(text);
  let previous = null;
  try {
    previous = previousData ? JSON.parse(previousData) : null;
  } catch {}
  const without = (c) => JSON.stringify({ ...c, issued: undefined });
  const prevAt = previous?.issued ? Date.parse(previous.issued) : 0;
  if (previous?.issued && without(previous) === without(config)) {
    config.issued = previous.issued;
  } else {
    config.issued = new Date(Math.max(now, prevAt + 1000)).toISOString();
  }
  const { version, issued, ...rest } = config;
  return JSON.stringify({ version, issued, ...rest }, null, 2) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const seed = (process.env.LISTS_SIGNING_KEY ?? '').trim();
  if (!seed) {
    console.log('No LISTS_SIGNING_KEY secret yet, so the lists were not signed.');
  } else {
    fs.mkdirSync(path.join(ROOT, 'lists/signed'), { recursive: true });
    for (const file of SIGNED_FILES) {
      let text = fs.readFileSync(path.join(ROOT, 'lists', file), 'utf8');
      if (file === 'app-config.json') {
        let previousData = null;
        try {
          previousData = JSON.parse(fs.readFileSync(path.join(ROOT, 'lists/signed', file), 'utf8')).data;
        } catch {}
        text = stampIssued(text, previousData);
        fs.writeFileSync(path.join(ROOT, 'lists', file), text);
      }
      fs.writeFileSync(path.join(ROOT, 'lists/signed', file), JSON.stringify(signText(seed, file, text)) + '\n');
    }
    // The public half, so the team can check which key signs (the app has its own copy built in).
    fs.writeFileSync(path.join(ROOT, 'lists/signed/key.json'), JSON.stringify({ version: 1, publicKey: publicKeyHex(seed) }) + '\n');
    console.log(`Signed ${SIGNED_FILES.length} lists with key ${publicKeyHex(seed).slice(0, 12)}…`);
  }
}
