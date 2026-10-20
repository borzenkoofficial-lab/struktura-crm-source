'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildScript = fs.readFileSync(path.join(root, 'scripts/create-installer-assets.cjs'), 'utf8');

test('Windows app and installer use the generated STRUKTURA icon', () => {
  assert.equal(pkg.build.win.icon, 'build/struktura.ico');
  assert.equal(pkg.build.nsis.installerIcon, 'build/struktura.ico');
  assert.ok(pkg.scripts['dist:win'].includes('create-installer-assets.cjs'));
  assert.ok(buildScript.includes("'struktura.ico'"));
  assert.ok(buildScript.includes('const n = 256'), 'Windows app icon must be at least 256x256 pixels');
});
