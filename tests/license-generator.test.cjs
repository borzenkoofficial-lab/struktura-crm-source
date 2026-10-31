'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generateKeyPairSync } = require('node:crypto');
const { verifyLicenseToken } = require('../src/license-core.cjs');

const generatorPath = path.resolve(__dirname, '../tools/license-generator.cjs');
const deviceId = 'e'.repeat(64);

function createTempKey() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-license-test-'));
  const pair = generateKeyPairSync('ed25519');
  const privateKeyPath = path.join(directory, 'private.pem');
  fs.writeFileSync(privateKeyPath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  return {
    directory,
    privateKeyPath,
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' })
  };
}

function runGenerator(args) {
  return spawnSync(process.execPath, [generatorPath, ...args], { encoding: 'utf8' });
}

function tokenFrom(output) {
  return output.match(/SKOL1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0] || '';
}

test('license generator help describes required offline generation parameters', () => {
  const result = runGenerator(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--edition START\|PRO\|BUSINESS/);
  assert.match(result.stdout, /--device-id/);
  assert.match(result.stdout, /--private-key/);
});

test('license generator creates a perpetual PRO key for the supplied device', () => {
  const key = createTempKey();
  const result = runGenerator([
    '--edition', 'PRO',
    '--device-id', deviceId,
    '--private-key', key.privateKeyPath,
    '--updates-until', '2027-10-31'
  ]);
  assert.equal(result.status, 0, result.stderr);
  const token = tokenFrom(result.stdout);
  assert.ok(token, 'generator must print a copyable SKOL1 token');
  const verified = verifyLicenseToken(token, key.publicKeyPem, deviceId, Date.parse('2026-11-01T00:00:00.000Z'));
  assert.equal(verified.valid, true);
  assert.equal(verified.license.edition, 'PRO');
  assert.equal(verified.license.expiresAt, null);
  assert.equal(verified.license.updatesUntil, '2027-10-31');
});

test('generator preserves shared purchase ID and seat allocation for multi-computer licenses', () => {
  const key = createTempKey();
  const result = runGenerator([
    '--edition', 'BUSINESS',
    '--device-id', deviceId,
    '--private-key', key.privateKeyPath,
    '--license-id', 'SKOL-MULTI-0001',
    '--seat-index', '2',
    '--seat-count', '5'
  ]);
  assert.equal(result.status, 0, result.stderr);
  const verified = verifyLicenseToken(tokenFrom(result.stdout), key.publicKeyPem, deviceId);
  assert.equal(verified.valid, true);
  assert.equal(verified.license.licenseId, 'SKOL-MULTI-0001');
  assert.equal(verified.license.seatIndex, 2);
  assert.equal(verified.license.seatCount, 5);
});

test('generator rejects invalid device IDs, missing private keys and malformed dates', () => {
  const key = createTempKey();
  assert.notEqual(runGenerator(['--edition', 'PRO', '--device-id', 'bad', '--private-key', key.privateKeyPath]).status, 0);
  assert.notEqual(runGenerator(['--edition', 'PRO', '--device-id', deviceId, '--private-key', path.join(key.directory, 'missing.pem')]).status, 0);
  assert.notEqual(runGenerator(['--edition', 'PRO', '--device-id', deviceId, '--private-key', key.privateKeyPath, '--updates-until', 'not-a-date']).status, 0);
});
