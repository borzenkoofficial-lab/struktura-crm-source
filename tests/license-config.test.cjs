'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FEATURE_CATALOG,
  FEATURE_IDS,
  normalizeFeatureIds
} = require('../src/license-catalog.cjs');
const {
  createDefaultTariffConfig,
  normalizeTariffConfig,
  normalizeLicenseRequest
} = require('../src/license-config.cjs');

test('catalog contains only independently protected modules present in CRM', () => {
  assert.deepEqual(FEATURE_IDS, [
    'engineering',
    'engineering_plans',
    'finance',
    'order_radar',
    'production',
    'reports',
    'web_browser'
  ]);
  assert.equal(FEATURE_CATALOG.advanced_analytics, undefined);
  for (const id of FEATURE_IDS) {
    assert.equal(FEATURE_CATALOG[id].id, id);
    assert.ok(FEATURE_CATALOG[id].name);
    assert.ok(Array.isArray(FEATURE_CATALOG[id].requires));
  }
});

test('feature normalization sorts IDs and rejects unknown, duplicate and malformed IDs', () => {
  assert.deepEqual(normalizeFeatureIds(['finance', 'production']), ['finance', 'production']);
  assert.throws(() => normalizeFeatureIds(['finance', 'advanced_analytics']), /неизвестн|разреш/i);
  assert.throws(() => normalizeFeatureIds(['finance', 'finance']), /повтор|дублир/i);
  assert.throws(() => normalizeFeatureIds('finance'), /список|массив/i);
});

test('default tariff config mirrors the real CRM entitlement map without guessed prices', () => {
  const config = createDefaultTariffConfig();
  assert.equal(config.format, 'SKOL_TARIFF_CONFIG');
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.catalogVersion, 1);
  assert.deepEqual(config.plans.map(plan => plan.id), ['START', 'PRO', 'BUSINESS']);
  assert.equal(config.plans[0].price, null);
  assert.deepEqual(config.plans[0].features, []);
  assert.deepEqual(config.plans[1].features, ['engineering', 'finance', 'production', 'reports']);
  assert.deepEqual(config.plans[2].features, [
    'engineering',
    'engineering_plans',
    'finance',
    'order_radar',
    'production',
    'reports',
    'web_browser'
  ]);
});

test('tariff config round-trips custom plans, prices and device limits', () => {
  const config = createDefaultTariffConfig();
  config.plans.push({
    id: 'TEAM_PLUS',
    name: 'Команда Плюс',
    description: 'Индивидуальный состав модулей.',
    price: 14900,
    maxDevices: 4,
    features: ['finance', 'reports'],
    enabled: true,
    displayOrder: 4
  });
  const normalized = normalizeTariffConfig(config);
  assert.equal(normalized.plans[3].price, 14900);
  assert.equal(normalized.plans[3].maxDevices, 4);
  assert.deepEqual(normalized.plans[3].features, ['finance', 'reports']);
});

test('tariff config rejects unknown modules, duplicate plan keys and invalid prices or device caps', () => {
  const base = createDefaultTariffConfig();
  assert.throws(() => normalizeTariffConfig({ ...base, plans: [...base.plans, { ...base.plans[0], features: ['advanced_analytics'] }] }), /неизвестн|разреш/i);
  assert.throws(() => normalizeTariffConfig({ ...base, plans: [...base.plans, { ...base.plans[0] }] }), /уникальн|повтор/i);
  assert.throws(() => normalizeTariffConfig({ ...base, plans: [...base.plans, { ...base.plans[0], id: 'CUSTOM' }] }), /зарезерв/i);
  assert.throws(() => normalizeTariffConfig({ ...base, plans: [{ ...base.plans[0], price: -1 }, ...base.plans.slice(1)] }), /стоимост|цен/i);
  assert.throws(() => normalizeTariffConfig({ ...base, plans: [{ ...base.plans[0], maxDevices: 51 }, ...base.plans.slice(1)] }), /устройств|компьютер/i);
});

test('license request contract preserves a custom feature selection and validates seats', () => {
  const request = normalizeLicenseRequest({
    format: 'SKOL_LICENSE_REQUEST',
    schemaVersion: 1,
    catalogVersion: 1,
    product: 'SKOL_CRM',
    planId: 'CUSTOM',
    planName: 'Индивидуальная конфигурация',
    features: ['reports', 'finance'],
    seatCount: 3,
    customer: { name: 'Покупатель', contact: 'telegram @buyer' },
    message: 'Нужен расчёт лицензии.'
  });
  assert.deepEqual(request.features, ['finance', 'reports']);
  assert.equal(request.seatCount, 3);
  assert.throws(() => normalizeLicenseRequest({ ...request, features: ['finance', 'advanced_analytics'] }), /неизвестн|разреш/i);
  assert.throws(() => normalizeLicenseRequest({ ...request, seatCount: 0 }), /компьютер|мест/i);
});
