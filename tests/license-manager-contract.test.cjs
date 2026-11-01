'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('offline License Manager UI provides tariff, device, seat and date controls', () => {
  const html = read('tools/license-manager/index.html');
  for (const id of ['edition', 'deviceId', 'licenseId', 'seatIndex', 'seatCount', 'updatesUntil', 'expiresAt', 'choosePrivateKeyBtn', 'generateLicenseBtn', 'licenseOutput', 'copyLicenseBtn', 'managedPlan', 'managedPlanId', 'managedPlanName', 'managedPlanPrice', 'managedPlanDevices', 'configFeatureOptions', 'loadConfigBtn', 'saveConfigBtn', 'importRequestBtn', 'addPlanBtn', 'removePlanBtn']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing License Manager control: ${id}`);
  }
});

test('License Manager preload exposes only key selection, generation and copy actions', () => {
  const preload = read('tools/license-manager/preload.cjs');
  assert.match(preload, /choosePrivateKey:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('licenseManager:chooseKey'\)/);
  assert.match(preload, /generateLicense:\s*\(data\)\s*=>\s*ipcRenderer\.invoke\('licenseManager:generate',\s*data\)/);
  for (const method of ['getConfig', 'updateConfig', 'loadConfig', 'saveConfig', 'importRequest']) assert.match(preload, new RegExp(method + ':'));
  assert.match(preload, /copyLicense:\s*\(value\)\s*=>\s*ipcRenderer\.invoke\('licenseManager:copy',\s*value\)/);
});

test('License Manager main process reads private key locally and reuses the signed license generator', () => {
  const main = read('tools/license-manager/main.cjs');
  assert.match(main, /dialog\.showOpenDialog/);
  assert.match(main, /generateConfiguredLicense\(/);
  assert.match(main, /normalizeTariffConfig/);
  assert.match(main, /normalizeLicenseRequest/);
  assert.match(main, /licenseManager:config:load/);
  assert.match(main, /licenseManager:config:save/);
  assert.match(main, /licenseManager:request:import/);\n  assert.match(main, /loadTariffConfigFile/);\n  assert.match(main, /persistTariffConfig/);
  assert.match(main, /clipboard\.writeText/);
  assert.doesNotMatch(main, /fetch\(|https?:\/\//);
});

test('package exposes a local command to open License Manager', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['license-manager'], 'electron tools/license-manager/main.cjs');
});


test('standalone License Manager build contains only its UI, generator and public license core', () => {
  const config = read('tools/license-manager/electron-builder.yml');
  assert.match(config, /main:\s*tools\/license-manager\/main\.cjs/);
  assert.match(config, /tools\/license-manager\/\*\*\/*/);
  assert.match(config, /tools\/license-generator\.cjs/);
  assert.match(config, /src\/license-core\.cjs/);
  assert.match(config, /src\/license-catalog\.cjs/);
  assert.match(config, /src\/license-config\.cjs/);
  assert.doesNotMatch(config, /license-private|license-keys/);
});

test('Windows CI builds and uploads the separate License Manager executable', () => {
  const workflow = read('.github/workflows/build-windows.yml');
  assert.match(workflow, /npm run dist:license-manager/);
  assert.match(workflow, /dist-license-manager\/\*\.exe/);
});
