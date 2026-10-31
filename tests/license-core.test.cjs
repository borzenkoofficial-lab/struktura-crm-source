'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const {
  createLicenseToken,
  verifyLicenseToken,
  getFeaturesForEdition,
  normalizeLicenseToken
} = require('../src/license-core.cjs');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const deviceId = 'a'.repeat(64);

function payload(overrides = {}) {
  return {
    v: 1,
    product: 'SKOL_CRM',
    licenseId: 'SKOL-TEST-000001',
    edition: 'PRO',
    features: getFeaturesForEdition('PRO'),
    deviceId,
    issuedAt: '2026-10-31T00:00:00.000Z',
    expiresAt: null,
    updatesUntil: '2027-10-31',
    seatIndex: 1,
    seatCount: 2,
    ...overrides
  };
}

test('edition feature sets are stable and BUSINESS includes PRO features', () => {
  assert.deepEqual(getFeaturesForEdition('START'), []);
  assert.deepEqual(getFeaturesForEdition('PRO'), ['engineering', 'finance', 'production', 'reports']);
  assert.deepEqual(getFeaturesForEdition('BUSINESS'), [
    'advanced_analytics',
    'engineering',
    'engineering_plans',
    'finance',
    'order_radar',
    'production',
    'reports',
    'web_browser'
  ]);
  assert.throws(() => getFeaturesForEdition('ENTERPRISE'), /тариф/i);
});

test('valid signed PRO license verifies for the bound device', () => {
  const token = createLicenseToken(payload(), privateKeyPem);
  const result = verifyLicenseToken(token, publicKeyPem, deviceId, Date.parse('2026-11-01T00:00:00.000Z'));
  assert.equal(result.valid, true);
  assert.equal(result.license.edition, 'PRO');
  assert.deepEqual(result.license.features, getFeaturesForEdition('PRO'));
  assert.equal(result.license.seatIndex, 1);
  assert.equal(result.license.seatCount, 2);
});

test('tampered payload and signature are rejected', () => {
  const token = createLicenseToken(payload(), privateKeyPem);
  const parts = token.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify(payload({ edition: 'BUSINESS' }))).toString('base64url');
  assert.equal(verifyLicenseToken(`SKOL1.${tamperedPayload}.${parts[2]}`, publicKeyPem, deviceId).reason, 'invalid_signature');
  const alteredSignature = parts[2].slice(0, -1) + (parts[2].endsWith('A') ? 'B' : 'A');
  assert.equal(verifyLicenseToken(`SKOL1.${parts[1]}.${alteredSignature}`, publicKeyPem, deviceId).valid, false);
});

test('license issued for another device is rejected', () => {
  const token = createLicenseToken(payload(), privateKeyPem);
  const result = verifyLicenseToken(token, publicKeyPem, 'b'.repeat(64));
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'wrong_device');
});

test('expired license is rejected while perpetual license remains valid', () => {
  const expiring = createLicenseToken(payload({ expiresAt: '2026-10-31T12:00:00.000Z' }), privateKeyPem);
  assert.equal(verifyLicenseToken(expiring, publicKeyPem, deviceId, Date.parse('2026-10-31T12:00:01.000Z')).reason, 'expired');
  const perpetual = createLicenseToken(payload({ expiresAt: null }), privateKeyPem);
  assert.equal(verifyLicenseToken(perpetual, publicKeyPem, deviceId, Date.parse('2036-10-31T00:00:00.000Z')).valid, true);
});

test('invalid editions, feature escalation, invalid device IDs and seat values cannot be signed', () => {
  assert.throws(() => createLicenseToken(payload({ edition: 'ENTERPRISE' }), privateKeyPem), /тариф/i);
  assert.throws(() => createLicenseToken(payload({ features: [...getFeaturesForEdition('PRO'), 'web_browser'] }), privateKeyPem), /разреш/i);
  assert.throws(() => createLicenseToken(payload({ deviceId: 'not-a-device' }), privateKeyPem), /устройств/i);
  assert.throws(() => createLicenseToken(payload({ seatIndex: 3, seatCount: 2 }), privateKeyPem), /устройств/i);
});

test('token normalization removes pasted whitespace but preserves signed content', () => {
  const token = createLicenseToken(payload(), privateKeyPem);
  const pasted = `  ${token.slice(0, 25)}\n  ${token.slice(25)}  `;
  assert.equal(normalizeLicenseToken(pasted), token);
  assert.equal(verifyLicenseToken(normalizeLicenseToken(pasted), publicKeyPem, deviceId).valid, true);
});

test('malformed, oversized and unsupported tokens fail closed', () => {
  assert.equal(verifyLicenseToken('', publicKeyPem, deviceId).reason, 'invalid_format');
  assert.equal(verifyLicenseToken('SKOL1.a.b.c', publicKeyPem, deviceId).reason, 'invalid_format');
  assert.equal(verifyLicenseToken('x'.repeat(3000), publicKeyPem, deviceId).reason, 'invalid_format');
});
