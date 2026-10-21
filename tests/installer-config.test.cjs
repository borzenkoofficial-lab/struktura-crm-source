'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildScript = fs.readFileSync(path.join(root, 'scripts/create-installer-assets.cjs'), 'utf8');

test('Windows app and installer use the СКОЛ logo and product identity', () => {
  assert.equal(pkg.version, '1.16.14');
  assert.equal(pkg.name, 'skol-desktop');
  assert.equal(pkg.build.productName, 'СКОЛ');
  assert.equal(pkg.build.win.icon, 'build/skol.ico');
  assert.equal(pkg.build.nsis.installerIcon, 'build/skol.ico');
  assert.equal(pkg.build.nsis.uninstallerIcon, 'build/skol.ico');
  assert.equal(pkg.build.nsis.installerHeader, 'build/skol-installer-header.bmp');
  assert.equal(pkg.build.nsis.installerSidebar, 'build/skol-installer-sidebar.bmp');
  assert.equal(pkg.build.nsis.uninstallerSidebar, 'build/skol-installer-sidebar.bmp');
  assert.match(pkg.build.win.artifactName, /^SKOL-Setup-/);
  assert.equal(pkg.build.appId, 'ru.struktura.crm', 'keep the established Windows app identity for upgrade compatibility');
  assert.ok(pkg.scripts['dist:win'].includes('create-installer-assets.cjs'));
  assert.ok(buildScript.includes("'skol.ico'"));
  assert.ok(buildScript.includes("'skol-installer-sidebar.bmp'"));
  assert.ok(buildScript.includes("'skol-installer-header.bmp'"));
  assert.ok(buildScript.includes('СКОЛ'));
  assert.ok(buildScript.includes('const n = 256'), 'Windows app icon must be 256x256 pixels');
});
