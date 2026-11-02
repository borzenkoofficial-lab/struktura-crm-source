'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('activation screen exposes a device ID, copy action and license key form', () => {
  const html = read('src/index.html');
  assert.match(html, /id="licenseActivationScreen"/);
  assert.match(html, /id="licenseDeviceId"/);
  assert.match(html, /id="copyLicenseDeviceIdBtn"/);
  assert.match(html, /id="licenseActivationForm"/);
  assert.match(html, /id="licenseKeyInput"/);
  assert.match(html, /id="licenseActivationStatus"/);
});

test('protected navigation and views declare their feature entitlements', () => {
  const html = read('src/index.html');
  for (const feature of ['finance', 'production', 'engineering', 'reports', 'order_radar', 'web_browser']) {
    assert.match(html, new RegExp(`data-feature=["']${feature}["']`), `missing feature marker: ${feature}`);
  }
  assert.doesNotMatch(html, /data-feature=["']engineering_plans["']/);
});

test('preload exposes only the required license status, activation and device-copy actions', () => {
  const preload = read('src/preload.cjs');
  assert.match(preload, /getLicenseStatus:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('license:status'\)/);
  assert.match(preload, /activateLicense:\s*\(data\)\s*=>\s*ipcRenderer\.invoke\('license:activate',\s*data\)/);
  assert.match(preload, /copyLicenseDeviceId:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('license:copyDeviceId'\)/);
});

test('renderer gates startup on license before loading business data', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /async function initializeLicenseGate\(/);
  assert.match(renderer, /await initializeLicenseGate\(\)/);
  assert.match(renderer, /applyLicenseEntitlements\(/);
  assert.match(renderer, /licenseActivationForm/);
});


test('startup timeout begins only after the user completes license and PIN gates', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /initializeStartupGate\(\)\s*\.then\(\(\)\s*=>\s*Promise\.race\(\[\s*refreshDashboard\(\)/);
});
