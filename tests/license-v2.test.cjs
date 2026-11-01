'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');
const { createLicenseToken, verifyLicenseToken, getFeaturesForEdition } = require('../src/license-core.cjs');
const { generateConfiguredLicense } = require('../tools/license-generator.cjs');
const { createLicenseService, assertIpcAccess, publicLicenseSummary } = require('../src/license-service.cjs');

const pair = generateKeyPairSync('ed25519');
const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
const deviceId = 'f'.repeat(64);
const now = Date.parse('2026-11-01T00:00:00.000Z');

function payload(overrides = {}) {
  return {
    v: 2,
    product: 'SKOL_CRM',
    licenseId: 'SKOL-CUSTOM-0001',
    planId: 'TEAM_PLUS',
    planName: 'Команда Плюс',
    features: ['finance', 'reports'],
    deviceId,
    issuedAt: '2026-11-01T00:00:00.000Z',
    expiresAt: null,
    updatesUntil: null,
    seatIndex: 1,
    seatCount: 2,
    ...overrides
  };
}

test('version 2 custom plan license verifies signed feature IDs and plan metadata', () => {
  const token = createLicenseToken(payload(), privateKeyPem);
  const result = verifyLicenseToken(token, publicKeyPem, deviceId, now);
  assert.equal(result.valid, true);
  assert.equal(result.license.v, 2);
  assert.equal(result.license.planId, 'TEAM_PLUS');
  assert.equal(result.license.planName, 'Команда Плюс');
  assert.deepEqual(result.license.features, ['finance', 'reports']);
});

test('custom version 2 licenses reject unknown legacy-only features and duplicate IDs', () => {
  assert.throws(() => createLicenseToken(payload({ features: ['advanced_analytics'] }), privateKeyPem), /неизвестн|неподдерживаем/i);
  assert.throws(() => createLicenseToken(payload({ features: ['finance', 'finance'] }), privateKeyPem), /повтор|дублир/i);
  assert.throws(() => createLicenseToken(payload({ planId: 'bad id' }), privateKeyPem), /ID тарифа/i);
});

test('version 1 START, PRO and BUSINESS signed licenses remain valid after version 2 is introduced', () => {
  for (const edition of ['START', 'PRO', 'BUSINESS']) {
    const legacy = {
      v: 1,
      product: 'SKOL_CRM',
      licenseId: 'SKOL-LEGACY-0001',
      edition,
      features: getFeaturesForEdition(edition),
      deviceId,
      issuedAt: '2026-10-31T00:00:00.000Z',
      expiresAt: null,
      updatesUntil: null,
      seatIndex: 1,
      seatCount: 1
    };
    const result = verifyLicenseToken(createLicenseToken(legacy, privateKeyPem), publicKeyPem, deviceId, now);
    assert.equal(result.valid, true, edition);
    assert.equal(result.license.edition, edition);
  }
});

test('configured license generator signs a plan selected from a validated feature list', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-v2-license-'));
  const privateKeyPath = path.join(dir, 'private.pem');
  fs.writeFileSync(privateKeyPath, privateKeyPem, { mode: 0o600 });
  const generated = generateConfiguredLicense({
    planId: 'TEAM_PLUS',
    planName: 'Команда Плюс',
    features: ['reports', 'finance'],
    deviceId,
    privateKeyPath,
    seatIndex: 2,
    seatCount: 3,
    updatesUntil: '2027-12-31',
    expiresAt: ''
  }, publicKeyPem);
  const verified = verifyLicenseToken(generated.token, publicKeyPem, deviceId, now);
  assert.equal(verified.valid, true);
  assert.equal(verified.license.planId, 'TEAM_PLUS');
  assert.deepEqual(verified.license.features, ['finance', 'reports']);
  assert.equal(verified.license.seatIndex, 2);
  assert.equal(verified.license.seatCount, 3);
});

test('CRM license service activates custom plan and enforces its actual IPC modules', () => {
  let saved = null;
  const service = createLicenseService({
    getSetting: (_key, fallback) => saved ?? fallback,
    setSetting: (_key, value) => { saved = value; },
    publicKeyPem,
    deviceId,
    now: () => now
  });
  const token = createLicenseToken(payload(), privateKeyPem);
  const status = service.activate(token);
  assert.equal(status.activated, true);
  assert.equal(status.license.planName, 'Команда Плюс');
  assert.equal(status.license.formatVersion, 2);
  const context = { licenseUnlocked: true, appUnlocked: true, features: status.license.features };
  assert.doesNotThrow(() => assertIpcAccess('finance:insights', context));
  assert.doesNotThrow(() => assertIpcAccess('reports:summary', context));
  assert.throws(() => assertIpcAccess('browser:navigate', context), /тариф/i);
  assert.equal(publicLicenseSummary({ ...payload(), v: 2 }).edition, 'TEAM_PLUS');
});

