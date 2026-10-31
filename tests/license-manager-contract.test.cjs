'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('offline License Manager UI provides tariff, device, seat and date controls', () => {
  const html = read('tools/license-manager/index.html');
  for (const id of ['edition', 'deviceId', 'licenseId', 'seatIndex', 'seatCount', 'updatesUntil', 'expiresAt', 'choosePrivateKeyBtn', 'generateLicenseBtn', 'licenseOutput', 'copyLicenseBtn']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing License Manager control: ${id}`);
  }
});

test('License Manager preload exposes only key selection, generation and copy actions', () => {
  const preload = read('tools/license-manager/preload.cjs');
  assert.match(preload, /choosePrivateKey:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('licenseManager:chooseKey'\)/);
  assert.match(preload, /generateLicense:\s*\(data\)\s*=>\s*ipcRenderer\.invoke\('licenseManager:generate',\s*data\)/);
  assert.match(preload, /copyLicense:\s*\(value\)\s*=>\s*ipcRenderer\.invoke\('licenseManager:copy',\s*value\)/);
});

test('License Manager main process reads private key locally and reuses the signed license generator', () => {
  const main = read('tools/license-manager/main.cjs');
  assert.match(main, /dialog\.showOpenDialog/);
  assert.match(main, /generateLicense\(/);
  assert.match(main, /clipboard\.writeText/);
  assert.doesNotMatch(main, /fetch\(|https?:\/\//);
});

test('package exposes a local command to open License Manager', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['license-manager'], 'electron tools/license-manager/main.cjs');
});
