'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
const assets = fs.readFileSync(path.join(root, 'scripts/create-installer-assets.cjs'), 'utf8');
const nsis = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-windows.yml'), 'utf8');

test('ОПЛОТ branding is consistent in app metadata and Windows installer', () => {
  assert.equal(pkg.name, 'oplot');
  assert.equal(pkg.build.productName, 'ОПЛОТ');
  assert.equal(pkg.build.win.icon, 'build/oplot.ico');
  assert.equal(pkg.build.nsis.installerIcon, 'build/oplot.ico');
  assert.match(pkg.build.win.artifactName, /^Oplot-Setup-/);
  assert.equal(pkg.build.appId, 'ru.struktura.crm', 'keep the existing Windows installation identity for upgrade continuity');
  assert.ok(html.includes('<title>ОПЛОТ</title>'));
  assert.ok(html.includes('class="brand-mark" >О</div>'));
  assert.ok(html.includes('STRUKTURA') === false, 'visible HTML branding must be fully renamed');
  assert.ok(main.includes("app.setName('ОПЛОТ')"));
  assert.ok(main.includes("const legacyDataCandidates = ['Struktura CRM', 'struktura-crm', 'struktura-crm-source']"), 'legacy user data discovery must remain intact');
  assert.ok(renderer.includes("const WELCOME_COMPLETED_KEY = 'struktura-crm-welcome-completed-v1'"), 'do not show onboarding again to users who completed it');
});

test('desktop icon is a graphite square with a white Cyrillic O mark at 256px', () => {
  assert.match(assets, /const n = 256/);
  assert.match(assets, /const inO =/);
  assert.match(assets, /palette\.navy/);
  assert.match(assets, /palette\.white/);
  assert.ok(pkg.scripts['dist:win'].includes('create-installer-assets.cjs'));
});

test('installer uses graphite-and-silver branded artwork and describes the application', () => {
  assert.ok(nsis.includes('MUI_BGCOLOR "25282C"'));
  assert.ok(nsis.includes('MUI_TEXTCOLOR "F1F3F5"'));
  assert.ok(nsis.includes('Добро пожаловать в ОПЛОТ'));
  assert.match(nsis, /заявки, клиенты, объекты, сметы, производство и финансы/i);
  assert.ok(nsis.includes('ОПЛОТ готов к работе'));
  assert.ok(pkg.build.nsis.installerHeader.includes('installer-header.bmp'));
  assert.ok(pkg.build.nsis.installerSidebar.includes('installer-sidebar.bmp'));
  assert.ok(workflow.includes('Oplot-Windows-Installer'));
});
