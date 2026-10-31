'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { createLicenseToken, getFeaturesForEdition } = require('../src/license-core.cjs');
const { createLicenseService, featureForChannel, assertIpcAccess, filterDashboardSummary } = require('../src/license-service.cjs');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const deviceId = 'c'.repeat(64);

function makeToken(overrides = {}) {
  return createLicenseToken({
    v: 1,
    product: 'SKOL_CRM',
    licenseId: 'SKOL-SERVICE-001',
    edition: 'PRO',
    features: getFeaturesForEdition('PRO'),
    deviceId,
    issuedAt: '2026-10-31T00:00:00.000Z',
    expiresAt: null,
    updatesUntil: '2027-10-31',
    seatIndex: 1,
    seatCount: 1,
    ...overrides
  }, privateKeyPem);
}

function setup(initialToken = null) {
  const settings = new Map();
  if (initialToken) settings.set('license_token_v1', initialToken);
  const service = createLicenseService({
    getSetting: (key, fallback) => settings.has(key) ? settings.get(key) : fallback,
    setSetting: (key, value) => settings.set(key, value),
    publicKeyPem,
    deviceId,
    now: () => Date.parse('2026-11-01T00:00:00.000Z')
  });
  return { service, settings };
}

test('license service starts inactive without changing local settings', () => {
  const { service, settings } = setup();
  const status = service.getStatus();
  assert.equal(status.activated, false);
  assert.equal(status.deviceId, deviceId);
  assert.equal(settings.size, 0);
});

test('activation stores a valid signed token and status revalidates it', () => {
  const { service, settings } = setup();
  const token = makeToken();
  const activated = service.activate(token);
  assert.equal(activated.activated, true);
  assert.equal(activated.license.edition, 'PRO');
  assert.equal(settings.get('license_token_v1'), token);
  assert.equal(service.getStatus().activated, true);
});

test('invalid activation is rejected and does not overwrite a previously stored license', () => {
  const original = makeToken();
  const { service, settings } = setup(original);
  assert.throws(() => service.activate('not-a-license'), /ключ|лиценз/i);
  assert.equal(settings.get('license_token_v1'), original);
});

test('a saved license for a different computer is reported inactive and can be replaced', () => {
  const wrongDeviceToken = makeToken({ deviceId: 'd'.repeat(64) });
  const { service, settings } = setup(wrongDeviceToken);
  assert.equal(service.getStatus().activated, false);
  assert.equal(service.getStatus().reason, 'wrong_device');
  const replacement = makeToken();
  assert.equal(service.activate(replacement).activated, true);
  assert.equal(settings.get('license_token_v1'), replacement);
});

test('feature mapping protects paid modules while leaving base channels available', () => {
  assert.equal(featureForChannel('finance:insights'), 'finance');
  assert.equal(featureForChannel('income:list'), 'finance');
  assert.equal(featureForChannel('production:overview'), 'production');
  assert.equal(featureForChannel('pi:coachHistory'), 'production');
  assert.equal(featureForChannel('engineering:importEstimateFile'), 'engineering');
  assert.equal(featureForChannel('estimate:exportQuotePdf'), 'engineering');
  assert.equal(featureForChannel('engineeringPlans:list'), 'engineering_plans');
  assert.equal(featureForChannel('orders:search'), 'order_radar');
  assert.equal(featureForChannel('prospects:list'), 'order_radar');
  assert.equal(featureForChannel('search:run'), 'order_radar');
  assert.equal(featureForChannel('browser:navigate'), 'web_browser');
  assert.equal(featureForChannel('clients:list'), null);
  assert.equal(featureForChannel('backup:create'), null);
});

test('expired saved license is inactive but local data remains available for reactivation', () => {
  const token = makeToken({ expiresAt: '2026-10-31T12:00:00.000Z' });
  const { service, settings } = setup(token);
  assert.equal(service.getStatus().activated, false);
  assert.equal(service.getStatus().reason, 'expired');
  assert.equal(settings.get('license_token_v1'), token);
});


test('IPC guard allows activation before licensing but blocks business operations', () => {
  assert.doesNotThrow(() => assertIpcAccess('license:status', { licenseUnlocked: false, appUnlocked: true, features: [] }));
  assert.throws(() => assertIpcAccess('clients:list', { licenseUnlocked: false, appUnlocked: true, features: [] }), /активируй лицензию/i);
});

test('IPC guard allows START base channels and blocks PRO and BUSINESS channels', () => {
  const base = { licenseUnlocked: true, appUnlocked: true, features: [] };
  assert.doesNotThrow(() => assertIpcAccess('clients:list', base));
  assert.throws(() => assertIpcAccess('finance:insights', base), /тариф/i);
  const pro = { ...base, features: getFeaturesForEdition('PRO') };
  assert.doesNotThrow(() => assertIpcAccess('finance:insights', pro));
  assert.throws(() => assertIpcAccess('orders:search', pro), /тариф/i);
  const business = { ...base, features: getFeaturesForEdition('BUSINESS') };
  assert.doesNotThrow(() => assertIpcAccess('orders:search', business));
  assert.doesNotThrow(() => assertIpcAccess('browser:navigate', business));
});

test('IPC guard keeps PIN lock active even when a valid license is installed', () => {
  const state = { licenseUnlocked: true, appUnlocked: false, features: getFeaturesForEdition('BUSINESS') };
  assert.doesNotThrow(() => assertIpcAccess('security:pinVerify', state));
  assert.doesNotThrow(() => assertIpcAccess('license:status', state));
  assert.throws(() => assertIpcAccess('clients:list', state), /PIN-код/i);
});


test('IPC guard applies BUSINESS entitlement to prospect CSV exports without blocking base exports', () => {
  const start = { licenseUnlocked: true, appUnlocked: true, features: [], args: ['prospects'] };
  assert.throws(() => assertIpcAccess('data:exportCsv', start), /тариф/i);
  assert.doesNotThrow(() => assertIpcAccess('data:exportCsv', { ...start, args: ['clients'] }));
  const business = { ...start, features: getFeaturesForEdition('BUSINESS') };
  assert.doesNotThrow(() => assertIpcAccess('data:exportCsv', business));
});


test('START dashboard summary does not expose finance totals while PRO keeps them', () => {
  const summary = { leads: 3, projects: 4, clients: 5, contract: 100000, received: 50000, expenses: 20000, cash: 30000 };
  assert.deepEqual(filterDashboardSummary(summary, []), {
    leads: 3, projects: 4, clients: 5, contract: 0, received: 0, expenses: 0, cash: 0
  });
  assert.deepEqual(filterDashboardSummary(summary, getFeaturesForEdition('PRO')), summary);
});
