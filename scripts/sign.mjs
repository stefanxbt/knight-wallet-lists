// Signs the lists, so the app can tell they came from the robot and not from someone who
// changed the files another way. Writes lists/manifest.json (the SHA-256 of every list file)
// and lists/manifest.sig (an Ed25519 signature of manifest.json, in hex).
//
// The private key is the LISTS_SIGNING_KEY secret (PKCS#8, base64), made once on
// admin/signing-key.html. The app only has the public key, which is also written into the
// manifest so it can be copied into the app.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SIGNED_FILES = ['app-config.json', 'banners.json', 'blocklist.json', 'dapps.json', 'tokens.json'];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function privateKeyFrom(base64) {
  const key = crypto.createPrivateKey({ key: Buffer.from(String(base64).trim(), 'base64'), format: 'der', type: 'pkcs8' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('LISTS_SIGNING_KEY is not an Ed25519 key');
  return key;
}

// The raw 32-byte public key, in hex.
export function publicKeyHex(privateKey) {
  const der = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  return der.subarray(der.length - 32).toString('hex');
}

export function buildManifest(dir, privateKey, now = new Date()) {
  const files = {};
  for (const name of SIGNED_FILES) files[name] = sha256(fs.readFileSync(path.join(dir, name)));
  const manifest = `${JSON.stringify({ version: 1, signedAt: now.toISOString(), publicKey: publicKeyHex(privateKey), files }, null, 2)}\n`;
  const signature = crypto.sign(null, Buffer.from(manifest), privateKey).toString('hex');
  return { manifest, signature };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const secret = process.env.LISTS_SIGNING_KEY;
  if (!secret) {
    // Before the key exists the lists stay unsigned, and the app keeps working as before.
    console.log('LISTS_SIGNING_KEY is not set, so the lists are not signed.');
    process.exit(0);
  }
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'lists');
  const { manifest, signature } = buildManifest(dir, privateKeyFrom(secret));
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifest);
  fs.writeFileSync(path.join(dir, 'manifest.sig'), `${signature}\n`);
  console.log(`Signed ${SIGNED_FILES.length} lists.`);
}
