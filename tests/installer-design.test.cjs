'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const nsis = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
const assets = fs.readFileSync(path.join(root, 'scripts/create-liquid-installer-assets.cjs'), 'utf8');
const notice = fs.readFileSync(path.join(root, 'build/installer-notice.rtf'), 'utf8');

test('SKOL installer keeps assisted NSIS and the established Windows identity', () => {
  assert.equal(pkg.build.appId, 'ru.struktura.crm');
  assert.equal(pkg.build.productName, 'СКОЛ');
  assert.equal(pkg.build.nsis.oneClick, false);
  assert.equal(pkg.build.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(pkg.build.nsis.createDesktopShortcut, true);
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
  assert.equal(pkg.build.nsis.include, 'build/installer.nsh');
  assert.equal(pkg.build.nsis.license, 'build/installer-notice.rtf');
  assert.match(pkg.scripts['dist:win'], /create-installer-assets\.cjs/);
  assert.match(pkg.scripts['dist:win'], /create-liquid-installer-assets\.cjs/);
  assert.match(pkg.scripts['dist:win'], /electron-builder --win nsis/);
});

test('Liquid Glass installer includes a branded welcome page and three navigable feature slides', () => {
  assert.match(nsis, /!macro customWelcomePage[\s\S]*?MUI_PAGE_WELCOME[\s\S]*?Page custom SKOLFeaturePageCreate[\s\S]*?!macroend/);
  assert.match(nsis, /!ifndef BUILD_UNINSTALLER[\s\S]*?Function SKOLSlideRender[\s\S]*?FunctionEnd[\s\S]*?!endif ; BUILD_UNINSTALLER/);
  assert.match(nsis, /SKOLSlideRender/);
  assert.match(nsis, /Управление объектами/);
  assert.match(nsis, /Сметы и производство/);
  assert.match(nsis, /Финансы и контроль/);
  assert.match(nsis, /NSD_OnClick/);
  assert.match(nsis, /MUI_WELCOMEPAGE_TITLE/);
  assert.match(nsis, /MUI_FINISHPAGE_TITLE/);
});

test('installer notice describes local data and backup without inventing a commercial license grant', () => {
  assert.match(notice, /локально/);
  assert.match(notice, /резервную копию/);
  assert.match(notice, /не заменяет отдельный договор или лицензионное соглашение/);
});

test('Liquid Glass artwork generator produces the installer header and sidebar dimensions', () => {
  assert.match(assets, /image\(164, 314/);
  assert.match(assets, /image\(150, 57/);
  assert.match(assets, /skol-installer-sidebar\.bmp/);
  assert.match(assets, /skol-installer-header\.bmp/);
  assert.match(assets, /lime/);
});
