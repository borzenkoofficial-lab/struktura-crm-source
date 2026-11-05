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
  'prospects', 'tasks', 'reports', 'browser', 'settings'
];
const viewportMatrix = [
  { name: '640x800', width: 640, height: 800, views: viewNames, screenshots: ['dashboard', 'engineering'] },
  { name: '800x600', width: 800, height: 600, views: viewNames, screenshots: ['dashboard', 'projects'] },
  { name: '1024x768', width: 1024, height: 768, views: viewNames, screenshots: ['dashboard', 'leads', 'finance', 'engineering', 'settings'] },
  { name: '1280x800', width: 1280, height: 800, views: ['dashboard', 'projects', 'production', 'finance', 'engineering'], screenshots: ['dashboard', 'projects', 'production'] },
  { name: '1440x900', width: 1440, height: 900, views: viewNames, screenshots: ['dashboard', 'prospects', 'tasks', 'reports', 'browser'] },
  { name: '1920x1080', width: 1920, height: 1080, views: viewNames, screenshots: ['dashboard', 'projects', 'settings'] }
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
  const item = page.locator('#skolDock .dock-item[data-view="' + name + '"]');
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
  const childEnv = {
    ...process.env,
    SKOL_UI_E2E: '1',
    SKOL_UI_E2E_USER_DATA: userData,
    SKOL_UI_E2E_PUBLIC_KEY_B64: Buffer.from(publicKeyPem, 'utf8').toString('base64')
  };

  let electronApp;
  let page;
  const pageErrors = [];
  const rendererConsole = [];
  const mainProcessErrors = [];
  const geometry = [];
  const screenshots = [];

  try {
    const packagedExecutable = process.env.SKOL_ELECTRON_EXECUTABLE;
    electronApp = await electron.launch({
      executablePath: packagedExecutable || electronExecutable,
      args: packagedExecutable ? [] : [root],
      env: childEnv,
      timeout: 60000
    });

    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(path.resolve(actualUserData), path.resolve(userData), 'Electron must use an isolated temporary profile');

    page = await electronApp.firstWindow({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const knownWindows = electronApp.windows();
    const crmWindow = knownWindows.find(candidate => candidate.url().startsWith('file://'));
    if (crmWindow) page = crmWindow;
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
    page.on('console', message => rendererConsole.push(message.type() + ': ' + message.text()));
    const electronProcess = electronApp.process();
    electronProcess.stderr?.on('data', chunk => mainProcessErrors.push(String(chunk)));
    try {
      await page.waitForSelector('#licenseActivationScreen:not([hidden])', { timeout: 30000 });
    } catch (error) {
      const electronWindowUrls = electronApp.windows().map(candidate => candidate.url());
      const diagnostics = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        bodyText: (document.body?.innerText || '').slice(0, 4000),
        licenseScreenExists: Boolean(document.getElementById('licenseActivationScreen')),
        licenseScreenHidden: document.getElementById('licenseActivationScreen')?.hidden,
        startupSplash: document.getElementById('startupSplash')?.className
      })).catch(e => ({ evaluationError: String(e) }));
      console.error('[electron-ui] startup diagnostics', JSON.stringify({ diagnostics, electronWindowUrls, pageErrors, rendererConsole, mainProcessErrors }, null, 2));
      throw error;
    }

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

    // Exercise the real preload → IPC → SQLite path for a core CRM relationship.
    const clientLeadWorkflow = await page.evaluate(async () => {
      const client = await window.crm.createClient({
        name: 'E2E заказчик СКОЛ',
        phone: '+79990000001',
        client_type: 'company',
        contact_name: 'Тестовый представитель'
      });
      const lead = await window.crm.createLead({
        title: 'E2E демонтаж офиса',
        client_id: client.id,
        service: 'demolition',
        source: 'phone',
        budget_rub: 125000,
        address: 'Москва, тестовый адрес',
        notes: 'Проверка сквозного сохранения связи'
      });
      const linked = (await window.crm.listLeads()).find(item => item.id === lead.id);
      if (!linked || linked.client_id !== client.id || linked.client_name !== client.name) {
        throw new Error('Связь заявки с клиентом не сохранилась после чтения из SQLite.');
      }
      await window.crm.updateLead({ ...linked, title: 'E2E демонтаж офиса — обновлено' });
      const updated = (await window.crm.listLeads()).find(item => item.id === lead.id);
      if (!updated || updated.client_id !== client.id || updated.client_name !== client.name) {
        throw new Error('Связь заявки с клиентом потерялась при редактировании заявки.');
      }
      let invalidClientRejected = false;
      try {
        await window.crm.createLead({ title: 'E2E invalid relation', client_id: 999999, budget_rub: 0 });
      } catch (error) {
        invalidClientRejected = /клиент не найден/i.test(String(error.message || error));
      }
      if (!invalidClientRejected) throw new Error('CRM должна отклонять ссылку на несуществующего клиента.');
      return { clientId: client.id, leadId: lead.id, linkedClientName: updated.client_name, invalidClientRejected };
    });
    assert.ok(clientLeadWorkflow.clientId > 0 && clientLeadWorkflow.leadId > 0, 'CRM creates test client and lead through IPC');
    assert.equal(clientLeadWorkflow.linkedClientName, 'E2E заказчик СКОЛ', 'lead-client relation survives create, read and update');
    assert.equal(clientLeadWorkflow.invalidClientRejected, true, 'invalid client relations are rejected');

    // Exercise the persistent macOS-inspired Dock on the real Electron window.
    const dock = page.locator('#skolDock');
    await dock.waitFor({ state: 'visible' });
    const dockLayout = await dock.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const items = [...node.querySelectorAll('.dock-item')];
      return {
        position: getComputedStyle(node).position,
        bottomGap: Math.round(window.innerHeight - rect.bottom),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        itemCount: items.length,
        groupCount: node.querySelectorAll('.dock-group').length,
        labelCount: node.querySelectorAll('.dock-label').length,
        iconCount: node.querySelectorAll('.dock-icon svg').length,
        labels: items.map(item => item.querySelector('.dock-label')?.innerText.trim())
      };
    });
    assert.equal(dockLayout.position, 'fixed', 'Dock stays fixed to the application window');
    assert.ok(dockLayout.bottomGap >= 0 && dockLayout.bottomGap <= 20, 'Dock is attached to the bottom edge: ' + JSON.stringify(dockLayout));
    assert.equal(dockLayout.itemCount, 12, 'all 12 primary workspaces are present');
    assert.equal(dockLayout.groupCount, 4, 'workspaces are grouped into four logical groups');
    assert.equal(dockLayout.labelCount, 12, 'every icon retains an accessible label tooltip');
    assert.ok(dockLayout.height >= 48 && dockLayout.height <= 60, 'Dock remains a low-profile 48–60px capsule: ' + JSON.stringify(dockLayout));
    assert.ok(dockLayout.left >= 0 && dockLayout.right <= await page.evaluate(() => window.innerWidth), 'Dock stays fully inside the application viewport: ' + JSON.stringify(dockLayout));
    const dockIconStyles = await dock.locator('.dock-icon').first().evaluate(node => ({ radius: getComputedStyle(node).borderRadius, background: getComputedStyle(node).backgroundImage }));
    assert.match(dockIconStyles.background, /gradient/i, 'Dock icons use individual colorful gradient surfaces');
    assert.equal(dockLayout.iconCount, 12, 'every destination has a vector icon');
    assert.ok(dockLayout.labels.includes('Создать резервную копию') === false, 'data utilities live in Settings, not in the Dock');
    await page.screenshot({ path: path.join(outputDir, 'dock-default.png'), animations: 'disabled' });

    const hoverTarget = dock.locator('.dock-item[data-view="projects"]');
    const beforeHover = await hoverTarget.boundingBox();
    const label = hoverTarget.locator('.dock-label');
    assert.equal(await label.evaluate(node => getComputedStyle(node).visibility), 'hidden', 'labels stay out of the way until hover');
    await hoverTarget.hover();
    await page.waitForTimeout(300);
    const afterHover = await hoverTarget.boundingBox();
    assert.ok(afterHover.width > beforeHover.width * 1.05, 'hover magnifies the dock icon and its hit target');
    assert.equal(await label.evaluate(node => getComputedStyle(node).visibility), 'visible', 'hover reveals the destination label');
    await page.screenshot({ path: path.join(outputDir, 'dock-hover.png'), animations: 'disabled' });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');

    for (const viewport of viewportMatrix) {
      console.log('[viewport] ' + viewport.name + ' started');
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForFunction(expected => window.innerWidth === expected.width && window.innerHeight === expected.height, viewport, { timeout: 10000 });
      const dockBounds = await page.locator('#skolDock').evaluate(node => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
      });
      assert.ok(dockBounds.left >= -1 && dockBounds.right <= viewport.width + 1, 'Dock stays within ' + viewport.name + ': ' + JSON.stringify(dockBounds));
      assert.ok(dockBounds.height <= 60, 'Dock does not grow vertically at ' + viewport.name + ': ' + JSON.stringify(dockBounds));
      assert.ok(dockBounds.scrollWidth <= dockBounds.clientWidth + 1, 'All Dock destinations fit without horizontal clipping at ' + viewport.name + ': ' + JSON.stringify(dockBounds));

      for (const viewName of (viewport.views || viewNames)) {
        console.log('[view] ' + viewport.name + ' / ' + viewName + ' checking');
        await openView(page, viewName);
        if (viewName === 'leads') {
          await page.locator('#leadsTable').getByText('E2E заказчик СКОЛ').waitFor({ state: 'visible' });
        }
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
      const child = electronApp.process();
      // Closing Electron can hang after an assertion fails. Bound the graceful close,
      // then terminate the child before deleting its temporary profile.
      try {
        await Promise.race([
          electronApp.close(),
          new Promise(resolve => {
            const timer = setTimeout(resolve, 10000);
            timer.unref?.();
          })
        ]);
      } catch { /* Preserve the original test failure. */ }
      if (child && child.exitCode === null) {
        try { child.kill(); } catch { /* The process may already be exiting. */ }
        await new Promise(resolve => {
          if (child.exitCode !== null) return resolve();
          const timer = setTimeout(resolve, 5000);
          timer.unref?.();
          child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
      }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
