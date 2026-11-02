'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const electronExecutable = require('electron');
const { createLicenseToken, getFeaturesForEdition } = require('../src/license-core.cjs');

const root = path.resolve(__dirname, '..');
const outputDir = path.resolve(process.env.SKOL_UI_E2E_OUTPUT || path.join(root, 'artifacts', 'ui-layout-smoke'));
const viewNames = [
  'dashboard', 'leads', 'clients', 'projects', 'production', 'finance', 'engineering',
  'prospects', 'tasks', 'reports', 'browser', 'plans', 'settings', 'about'
];
const viewportMatrix = [
  { name: '1024x768', width: 1024, height: 768, views: viewNames, screenshots: ['dashboard', 'leads', 'finance', 'engineering', 'settings'] },
  { name: '1280x800', width: 1280, height: 800, views: ['dashboard', 'projects', 'production', 'finance', 'engineering'], screenshots: ['dashboard', 'projects', 'production'] },
  { name: '1440x900', width: 1440, height: 900, views: viewNames, screenshots: ['dashboard', 'prospects', 'tasks', 'reports', 'browser'] },
  { name: '1920x1080', width: 1920, height: 1080, views: ['dashboard', 'projects', 'production', 'finance', 'engineering', 'plans', 'about'], screenshots: ['dashboard', 'plans', 'about'] }
];

function makeTestLicense(deviceId, privateKeyPem) {
  const updatesUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return createLicenseToken({
    v: 1,
    product: 'SKOL_CRM',
    licenseId: 'SKOL-UI-E2E-00001',
    edition: 'BUSINESS',
    features: getFeaturesForEdition('BUSINESS'),
    deviceId,
    issuedAt: new Date(Date.now() - 60 * 1000).toISOString(),
    expiresAt: null,
    updatesUntil,
    seatIndex: 1,
    seatCount: 1
  }, privateKeyPem);
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
}

async function openView(page, name) {
  const expanded = await page.locator('.sidebar').evaluate(node => node.classList.contains('nav-expanded'));
  if (!expanded) await page.locator('#navMenuToggle').click();

  const item = page.locator('#nav-primary button[data-view="' + name + '"]');
  await item.scrollIntoViewIfNeeded();
  await item.click();

  await page.waitForFunction(viewName => {
    const view = document.getElementById('view-' + viewName);
    return Boolean(view && view.classList.contains('active') && !view.hasAttribute('aria-busy'));
  }, name, { timeout: 20000 });

  const loadErrors = await page.locator('#view-' + name + ' .section-load-error').count();
  assert.equal(loadErrors, 0, 'Раздел ' + name + ' должен загрузиться без ошибки');
}

async function collectGeometry(page, viewport, viewName) {
  const metrics = await page.evaluate(() => {
    const active = document.querySelector('.view.active');
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { left: Math.round(box.left * 10) / 10, right: Math.round(box.right * 10) / 10, top: Math.round(box.top * 10) / 10, bottom: Math.round(box.bottom * 10) / 10, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 };
    };
    const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    const containerSelector = '.section-head,.panel,.records-panel,.stat-card,.finance-card,.settings-card,.pricing-card,.eng-card,.estimate-pro-panel,.dashboard-hero,.dashboard-finance-panel,.browser-shell,.records-workspace,.eng-layout,.settings-page-grid,.pricing-grid';
    const outside = Array.from(active?.querySelectorAll(containerSelector) || [])
      .filter(visible)
      .map(element => ({ selector: element.className || element.tagName, bounds: rect(element) }))
      .filter(item => item.bounds.width > 0 && (item.bounds.left < -1 || item.bounds.right > window.innerWidth + 1))
      .slice(0, 30);

    const clippingSelector = 'h1,h2,h3,h4,.button,.pill,.stat-card > strong,.finance-card > strong,.dashboard-money-card > strong,.pricing-price,.eng-stat > strong';
    const clippedText = Array.from(active?.querySelectorAll(clippingSelector) || [])
      .filter(visible)
      .filter(element => {
        const style = getComputedStyle(element);
        return style.whiteSpace === 'nowrap'
          && style.textOverflow !== 'ellipsis'
          && element.clientWidth > 0
          && element.scrollWidth > element.clientWidth + 2;
      })
      .map(element => ({ text: (element.innerText || element.textContent || '').trim().slice(0, 90), selector: element.className || element.tagName, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }))
      .slice(0, 20);

    const overlappingActions = [];
    const rowSelector = '.button-row,.top-actions,.estimate-actions,.estimate-head-actions,.eng-actions,.modal-actions';
    for (const row of Array.from(active?.querySelectorAll(rowSelector) || []).filter(visible)) {
      const controls = Array.from(row.children).filter(child => visible(child) && child.matches('button,a,.button,input,select'));
      for (let i = 0; i < controls.length; i++) {
        const a = controls[i].getBoundingClientRect();
        for (let j = i + 1; j < controls.length; j++) {
          const b = controls[j].getBoundingClientRect();
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 2 && overlapY > 2) overlappingActions.push({ row: row.className, first: (controls[i].innerText || '').trim(), second: (controls[j].innerText || '').trim() });
        }
      }
    }

    const activeBounds = active ? rect(active) : null;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, bodyScrollWidth: document.body.scrollWidth },
      activeView: active?.id || null,
      activeBounds,
      outside,
      clippedText,
      overlappingActions
    };
  });

  assert.equal(metrics.viewport.width, viewport.width, 'Electron viewport width must match requested size');
  assert.ok(metrics.document.scrollWidth <= viewport.width + 1, viewName + ': document must not scroll horizontally: ' + JSON.stringify(metrics.document));
  assert.ok(metrics.document.bodyScrollWidth <= viewport.width + 1, viewName + ': body must not overflow horizontally: ' + JSON.stringify(metrics.document));
  assert.ok(metrics.activeBounds && metrics.activeBounds.left >= -1 && metrics.activeBounds.right <= viewport.width + 1, viewName + ': active workspace must remain inside the window');
  assert.equal(metrics.outside.length, 0, viewName + ': primary containers must remain inside the viewport: ' + JSON.stringify(metrics.outside));
  assert.equal(metrics.clippedText.length, 0, viewName + ': important labels must not be clipped: ' + JSON.stringify(metrics.clippedText));
  assert.equal(metrics.overlappingActions.length, 0, viewName + ': adjacent action buttons must not overlap: ' + JSON.stringify(metrics.overlappingActions));
  return metrics;
}

async function run() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-electron-ui-e2e-'));
  const userData = path.join(tempRoot, 'user-data');
  fs.mkdirSync(userData, { recursive: true });

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const preloadHook = path.join(__dirname, 'electron-e2e-preload.cjs');

  const childEnv = {
    ...process.env,
    SKOL_UI_E2E: '1',
    SKOL_UI_E2E_USER_DATA: userData,
    SKOL_UI_E2E_PUBLIC_KEY_B64: Buffer.from(publicKeyPem, 'utf8').toString('base64'),
    NODE_OPTIONS: '--require="' + preloadHook + '"'
  };

  let electronApp;
  let page;
  const pageErrors = [];
  const geometry = [];
  const screenshots = [];

  try {
    electronApp = await electron.launch({
      executablePath: electronExecutable,
      args: [root],
      env: childEnv,
      timeout: 60000
    });

    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(path.resolve(actualUserData), path.resolve(userData), 'Electron must use an isolated temporary profile');

    page = await electronApp.firstWindow({ timeout: 60000 });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
    await page.waitForSelector('#licenseActivationScreen:not([hidden])', { timeout: 30000 });

    const deviceId = (await page.locator('#licenseDeviceId').innerText()).trim();
    assert.match(deviceId, /^[a-f0-9]{64}$/i, 'temporary license activation must expose a valid device ID');
    const token = makeTestLicense(deviceId, privateKeyPem);
    await page.locator('#licenseKeyInput').fill(token);
    await page.locator('#licenseActivateBtn').click();
    await page.locator('#licenseActivationScreen').waitFor({ state: 'hidden', timeout: 15000 });

    await page.waitForSelector('#view-dashboard.active', { timeout: 30000 });
    await page.waitForFunction(() => {
      const splash = document.getElementById('startupSplash');
      return !splash || splash.classList.contains('is-hidden');
    }, null, { timeout: 15000 });
    await page.waitForTimeout(750);
    if (await page.locator('#navGuideCard').isVisible().catch(() => false)) {
      await page.locator('#navGuideSkip').click();
    }

    // Exercise the actual two-step guide and the centered top menu.
    await page.locator('#navGuideReplay').click();
    await page.locator('#navGuideCard:not([hidden])').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#navGuideCard').getAttribute('data-step'), '1');
    assert.ok(await page.locator('#navMenuToggle').evaluate(node => node.classList.contains('nav-guide-highlight')));
    await page.screenshot({ path: path.join(outputDir, 'navigation-guide-step-1.png'), animations: 'disabled' });
    await page.locator('#navGuideNext').click();
    assert.equal(await page.locator('#navGuideCard').getAttribute('data-step'), '2');
    assert.ok(await page.locator('#nav-primary').evaluate(node => node.classList.contains('nav-guide-highlight')));
    await page.screenshot({ path: path.join(outputDir, 'navigation-guide-step-2.png'), animations: 'disabled' });
    await page.locator('#navGuideSkip').click();

    await page.locator('#navMenuToggle').click();
    const navLayout = await page.evaluate(() => {
      const shell = document.querySelector('.sidebar');
      const toggle = document.getElementById('navMenuToggle');
      const panel = document.getElementById('nav-primary');
      const shellRect = shell.getBoundingClientRect();
      const toggleRect = toggle.getBoundingClientRect();
      const groups = Array.from(panel.querySelectorAll('.nav-menu-group'));
      const items = Array.from(panel.querySelectorAll('.nav-item[data-view]'));
      return {
        toggleCenter: toggleRect.left + toggleRect.width / 2,
        viewportCenter: window.innerWidth / 2,
        shellWidth: shellRect.width,
        navVisible: getComputedStyle(panel).visibility === 'visible',
        groupDirections: groups.map(group => getComputedStyle(group).flexDirection),
        itemCount: items.length
      };
    });
    assert.ok(Math.abs(navLayout.toggleCenter - navLayout.viewportCenter) <= 4, 'top menu trigger must be horizontally centered: ' + JSON.stringify(navLayout));
    assert.equal(navLayout.navVisible, true, 'top navigation panel must be visible after opening');
    assert.equal(navLayout.itemCount, 14, 'all 14 main workspaces must remain in the navigation');
    assert.ok(navLayout.groupDirections.every(value => value === 'row'), 'navigation groups must stay horizontal');
    await page.screenshot({ path: path.join(outputDir, 'navigation-open.png'), animations: 'disabled' });

    const hoverTarget = page.locator('#nav-primary .nav-item[data-view="projects"]');
    await hoverTarget.hover();
    const hoverAnimation = await hoverTarget.evaluate(node => getComputedStyle(node).animationName);
    assert.match(hoverAnimation, /skolNavJelly/, 'navigation item hover must use the jelly motion');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('nav-expanded'));

    // Check the real five-second idle close rather than only inspecting the timer constant.
    await page.locator('#navMenuToggle').click();
    await page.mouse.move(12, Math.min(500, await page.evaluate(() => window.innerHeight - 20)));
    await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('nav-expanded'), null, { timeout: 7500 });

    for (const viewport of viewportMatrix) {
      console.log('[viewport] ' + viewport.name + ' started');
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForFunction(expected => window.innerWidth === expected.width && window.innerHeight === expected.height, viewport, { timeout: 10000 });

      for (const viewName of (viewport.views || viewNames)) {
        console.log('[view] ' + viewport.name + ' / ' + viewName + ' checking');
        await openView(page, viewName);
        const report = await collectGeometry(page, viewport, viewName);
        geometry.push({ viewport: viewport.name, view: viewName, ...report });
        console.log('[view] ' + viewport.name + ' / ' + viewName + ' passed');
        if (viewport.screenshots.includes(viewName)) {
          const screenshotName = viewport.name + '-' + safeFileName(viewName) + '.png';
          const screenshotPath = path.join(outputDir, screenshotName);
          await page.screenshot({ path: screenshotPath, animations: 'disabled' });
          screenshots.push(screenshotName);
        }
      }
    }

    assert.equal(pageErrors.length, 0, 'renderer must not throw uncaught errors: ' + pageErrors.join('\\n'));
    const result = {
      status: 'passed',
      electronVersion: await electronApp.evaluate(({ app }) => process.versions.electron),
      chromiumVersion: await electronApp.evaluate(() => process.versions.chrome || process.versions.chromium || 'unknown'),
      viewports: viewportMatrix,
      viewsChecked: [...new Set(geometry.map(item => item.view))],
      checkedPairs: geometry.map(item => ({ viewport: item.viewport, view: item.view })),
      screenshots,
      pageErrors,
      geometry
    };
    fs.writeFileSync(path.join(outputDir, 'geometry-report.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log('SKOL Electron UI layout smoke passed: ' + viewportMatrix.length + ' viewport sizes × ' + viewNames.length + ' workspaces; ' + screenshots.length + ' screenshots.');
  } catch (error) {
    if (page) {
      try {
        await page.screenshot({ path: path.join(outputDir, 'failure-current-view.png'), animations: 'disabled' });
      } catch { /* Electron may already have closed. */ }
    }
    const failure = {
      status: 'failed',
      message: String(error?.stack || error),
      pageErrors,
      screenshots,
      geometry
    };
    fs.writeFileSync(path.join(outputDir, 'geometry-report.json'), JSON.stringify(failure, null, 2), 'utf8');
    throw error;
  } finally {
    if (electronApp) {
      try { await electronApp.close(); } catch { /* Preserve the original test failure. */ }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
