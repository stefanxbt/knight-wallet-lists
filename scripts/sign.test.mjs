import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildManifest, privateKeyFrom, publicKeyHex, SIGNED_FILES } from './sign.mjs';

function keyPair() {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  return privateKeyFrom(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
}

test('the manifest lists every file and the signature checks out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lists-'));
  for (const name of SIGNED_FILES) fs.writeFileSync(path.join(dir, name), `{"name":"${name}"}`);
  const key = keyPair();
  const { manifest, signature } = buildManifest(dir, key, new Date('2026-10-30T00:00:00Z'));
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.publicKey, publicKeyHex(key));
  assert.deepEqual(Object.keys(parsed.files), SIGNED_FILES);
  assert.equal(parsed.files['dapps.json'], crypto.createHash('sha256').update('{"name":"dapps.json"}').digest('hex'));
  assert.ok(crypto.verify(null, Buffer.from(manifest), crypto.createPublicKey(key), Buffer.from(signature, 'hex')));
  assert.ok(!crypto.verify(null, Buffer.from(manifest.replace('dapps', 'dappz')), crypto.createPublicKey(key), Buffer.from(signature, 'hex')));
});

test('a key that is not Ed25519 is refused', () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  assert.throws(() => privateKeyFrom(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')), /not an Ed25519 key/);
});
