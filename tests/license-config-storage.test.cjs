'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDefaultTariffConfig } = require('../src/license-config.cjs');
const { loadTariffConfigFile, saveTariffConfigFile } = require('../src/license-config-storage.cjs');

test('missing local configuration starts from safe defaults', () => {
  const file = path.join(os.tmpdir(), 'skol-missing-config-' + process.pid, 'tariffs.json');
  const result = loadTariffConfigFile(file);
  assert.equal(result.source, 'default');
  assert.equal(result.warning, null);
  assert.deepEqual(result.config, createDefaultTariffConfig());
});

test('tariff configuration is atomically saved and restored from the local profile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-tariff-store-'));
  const file = path.join(dir, 'settings', 'tariffs.json');
  const config = createDefaultTariffConfig();
  config.plans[0].price = 1200;
  const saved = saveTariffConfigFile(file, config);
  const loaded = loadTariffConfigFile(file);
  assert.equal(saved.plans[0].price, 1200);
  assert.equal(loaded.source, 'local');
  assert.equal(loaded.warning, null);
  assert.equal(loaded.config.plans[0].price, 1200);
  assert.equal(fs.readdirSync(path.dirname(file)).some(name => name.includes('.tmp-')), false);
});

test('corrupted local configuration falls back visibly instead of crashing the manager', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-tariff-corrupt-'));
  const file = path.join(dir, 'tariffs.json');
  fs.writeFileSync(file, '{broken', 'utf8');
  const loaded = loadTariffConfigFile(file);
  assert.equal(loaded.source, 'default');
  assert.match(loaded.warning, /не прочитана/i);
  assert.deepEqual(loaded.config, createDefaultTariffConfig());
});

test('invalid tariff configuration is never written to disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-tariff-invalid-'));
  const file = path.join(dir, 'tariffs.json');
  const config = createDefaultTariffConfig();
  config.plans[1].features = ['unknown_feature'];
  assert.throws(() => saveTariffConfigFile(file, config), /неизвестн|неподдерживаем/i);
  assert.equal(fs.existsSync(file), false);
});
