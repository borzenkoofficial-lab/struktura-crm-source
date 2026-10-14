'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');

test('async create forms capture their form before awaiting IPC', () => {
  for (const id of ['leadForm', 'clientForm', 'projectForm', 'paymentForm', 'expenseForm']) {
    const start = renderer.indexOf(`$('${id}').addEventListener('submit'`);
    assert.notEqual(start, -1, `${id} submit handler exists`);
    const formIds = ['leadForm', 'clientForm', 'projectForm', 'paymentForm', 'expenseForm'];
    const starts = formIds.map(formId => renderer.indexOf(`$('${formId}').addEventListener('submit'`)).filter(position => position > start);
    const block = renderer.slice(start, starts.length ? Math.min(...starts) : renderer.length);
    assert.match(block, /const form = e\.currentTarget/ , `${id} captures form synchronously`);
    assert.match(block, /form\.reset\(\)/, `${id} resets the captured form`);
    assert.doesNotMatch(block, /e\.currentTarget\.reset\(\)/, `${id} does not use currentTarget after await`);
  }
});

test('pricing and AI API preview clearly do not enable checkout or provider credentials', () => {
  assert.match(html, /Покупка пока не активна/);
  assert.match(html, /платёжный провайдер будет подключён отдельно/i);
  assert.match(html, /Поля отключены намеренно/);
  assert.match(html, /id="view-plans"/);
});

test('HTML IDs are unique and all literal renderer element references resolve', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML element IDs must be unique');
  const idSet = new Set(ids);
  for (const match of renderer.matchAll(/\$\('([^']+)'\)/g)) {
    assert.ok(idSet.has(match[1]), `renderer references missing HTML id: ${match[1]}`);
  }
});

test('startup animation is wired to initial dashboard readiness with a safety timeout', () => {
  assert.match(html, /id="startupSplash"/);
  assert.match(html, /class="startup-mark"/);
  assert.match(html, /class="startup-progress"/);
  assert.match(renderer, /function hideStartupSplash\(\)/);
  assert.match(renderer, /\.finally\(hideStartupSplash\)/);
  assert.match(renderer, /window\.setTimeout\(hideStartupSplash, 8000\)/);
  assert.match(renderer, /startupSplash\.classList\.add\('is-hidden'\)/);
});

test('startup animation includes reduced-motion accessibility support', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.startup-splash\.is-hidden/);
});

test('dashboard home has real navigation actions and no fabricated business metrics', () => {
  const dashboard = html.match(/<section class="view active" id="view-dashboard">([\s\S]*?)<\/section>\s*<section class="view" id="view-leads">/);
  assert.ok(dashboard, 'dashboard section exists');
  assert.match(dashboard[1], /Бизнес начинается/);
  assert.match(dashboard[1], /data-goto="projects"/);
  assert.match(dashboard[1], /data-goto="leads"/);
  for (const id of ['statLeads', 'statProjects', 'statReceived', 'statCash', 'recentLeads']) {
    assert.match(dashboard[1], new RegExp(`id="${id}"`), `${id} stays available for live data`);
  }
  assert.match(dashboard[1], /Состояние бизнеса/);
});

test('dashboard visual refresh has responsive and reduced-motion rules', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(css, /\.welcome-side/);
  assert.match(css, /\.hero-mini-card/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});


test('production workspace provides plan, shift log, history and explicit learning confidence', () => {
  assert.match(html, /id="view-production"/);
  assert.match(html, /id="productionPlanDialog"/);
  assert.match(html, /id="productionShiftDialog"/);
  assert.match(html, /id="productionHistory"/);
  assert.match(html, /3–4 — уточняющими/);
  assert.match(html, /5\+ наблюдений/);
  assert.match(renderer, /productionOverview/);
  assert.match(renderer, /saveProductionPlan/);
  assert.match(renderer, /saveWorkShift/);
  assert.match(main, /forecastRemainingWork/);
});


test('calculator consumes locally learned productivity and refreshes after shift reports', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(html, /id="estimateLearningStatus"/);
  assert.match(renderer, /function estimateEffectiveProductivity\(line\)/);
  assert.match(renderer, /estimateEffectiveProductivity\(line\)/);
  assert.match(renderer, /1–2 наблюдения — 25%/);
  assert.match(renderer, /refreshEstimateLearningRates\(\)/);
  assert.match(preload, /productionRateModels: \(catalogIds, targetCrewSize\) => ipcRenderer\.invoke\('production:rateModels'/);
  assert.match(main, /ipcMain\.handle\('production:rateModels'/);
  assert.match(main, /const \{ forecastRemainingWork, buildRateModel \} = require\('\.\/production-model\.cjs'\)/);
  assert.match(preload, /target_crew_size: targetCrewSize/);
  assert.match(renderer, /crewScalingApplied/);
});

test('project creation from an estimate saves object and production plan in one SQLite transaction', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(main, /ipcMain\.handle\('projects:createWithPlan'[\s\S]*?const create = db\.transaction\(\(\) => \{[\s\S]*?production_plans[\s\S]*?return db\.prepare\('SELECT \* FROM projects WHERE id=\?'\)/);
  assert.match(renderer, /createProjectWithPlan\(\{ project: data, plan: planToAttach \}\)/);
  assert.match(preload, /createProjectWithPlan: \(data\) => ipcRenderer\.invoke\('projects:createWithPlan'/);
});

test('shift reports prevent double-counted labor and permit zero-output shifts only with a reason', () => {
  const planUtils = fs.readFileSync(path.join(__dirname, '../src/production-plan-utils.cjs'), 'utf8');
  assert.match(planUtils, /одни и те же часы нельзя учитывать дважды/);
  assert.match(main, /Если за смену ничего не сделано, укажи причину простоя/);
  assert.match(html, /Если за всю смену ничего не сделано, обязательно укажи причину/);
  assert.match(renderer, /production-plan-exceeded/);
});

test('shift report preloads the selected object plan and ignores blank quantities', () => {
  assert.match(renderer, /async function productionLoadShiftRows\(\)/);
  assert.match(renderer, /productionRenderRows\('productionShiftLines','shift',data\.lines\.length \? data\.lines : \[\]\)/);
  assert.match(renderer, /filter\(line => Number\(line\.quantity_done\) > 0\)/);
  assert.match(html, /оставь её объём пустым/);
});


test('production intelligence and production PDF are connected through the safe preload bridge', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  const intelligence = fs.readFileSync(path.join(__dirname, '../src/production-intelligence.cjs'), 'utf8');
  const report = fs.readFileSync(path.join(__dirname, '../src/production-report.cjs'), 'utf8');
  assert.match(html, /id="piHomeSummary"/);
  assert.match(html, /id="piProductionAlerts"/);
  assert.match(html, /id="productionReportPdfBtn"/);
  assert.match(html, /id="productionReportInternal"/);
  assert.match(intelligence, /Недостаточно данных/iu);
  assert.match(intelligence, /Превышен план/iu);
  assert.match(report, /не заменяет договор или акт приёмки/iu);
  assert.match(preload, /exportProductionReportPdf: \(data\) => ipcRenderer\.invoke\('production:exportReportPdf'/);
  assert.match(main, /ipcMain\.handle\('production:exportReportPdf'/);
  assert.match(main, /nodeIntegration: false/);
});

test('PDF commercial proposal has branded layout, named executor, signature and stamp area', () => {
  assert.match(main, /ИП Борзенко Семен Сергеевич/);
  assert.match(main, /МЕСТО<br>ДЛЯ ПЕЧАТИ/);
  assert.match(main, /class="signatures"/);
  assert.match(main, /class="signature-line"/);
  assert.match(main, /КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ/);
  assert.match(main, /hero-mark/);
  assert.match(main, /Срок действия:/);
  assert.match(main, /не является договором подряда/);
});

test('notification settings are wired through the safe preload bridge and a 15-minute scheduler', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  const reminderEngine = fs.readFileSync(path.join(__dirname, '../src/reminder-engine.cjs'), 'utf8');
  assert.match(html, /id="notificationSettingsDialog"/);
  assert.match(html, /id="notificationSettingsBtn"/);
  assert.match(html, /id="notificationSettingsForm"/);
  assert.match(renderer, /getNotificationSettings/);
  assert.match(renderer, /saveNotificationSettings/);
  assert.ok(preload.includes("getNotificationSettings: () => ipcRenderer.invoke('notifications:getSettings')"));
  assert.ok(preload.includes("saveNotificationSettings: (data) => ipcRenderer.invoke('notifications:saveSettings', data)"));
  assert.match(main, /setInterval\(checkAndSendReminders, 15 \* 60 \* 1000\)/);
  assert.match(main, /new Notification\(/);
  assert.match(main, /reminder_last_sent/);
  assert.match(reminderEngine, /staleShiftDays/);
  assert.match(reminderEngine, /repeatEveryHours/);
});

test('homepage explains PI with a clearly labeled illustrative mockup, not live-looking fake business data', () => {
  assert.match(html, /id="piExplainerTitle"/);
  assert.match(html, /ПИ — производственный интеллект/);
  assert.match(html, /class="pi-mockup"/);
  assert.match(html, /Демо-данные/);
  assert.match(html, /Цифры не относятся к вашим объектам/);
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(css, /\.pi-explainer/);
  assert.match(css, /\.pi-mockup-alert/);
  assert.match(css, /@media\(max-width:900px\)\{\.pi-explainer/);
});


test('backup restore is exposed in the UI and safe preload bridge', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(html, /id="restoreBackupBtn"/);
  assert.match(renderer, /\$\('restoreBackupBtn'\)\.addEventListener\('click'/);
  assert.match(preload, /restoreBackup:\s*\(\) => ipcRenderer\.invoke\('backup:restore'\)/);
  assert.match(main, /ipcMain\.handle\('backup:restore'/);
});

test('backup restore validates SQLite integrity and preserves an automatic rollback copy', () => {
  assert.match(main, /integrity_check/);
  assert.match(main, /const required = \['clients', 'leads', 'projects', 'payments', 'expenses', 'settings'\]/);
  assert.match(main, /await db\.backup\(safetyPath\)/);
  assert.match(main, /прежняя база возвращена/);
  assert.match(main, /Действующая база не изменена/);
});

test('payments and expenses reject impossible calendar dates before writing to SQLite', () => {
  const paymentHandler = main.match(/ipcMain\.handle\('payments:create',[\s\S]*?\n\}\);/);
  const expenseHandler = main.match(/ipcMain\.handle\('expenses:create',[\s\S]*?\n\}\);/);
  assert.ok(paymentHandler, 'payment create handler exists');
  assert.ok(expenseHandler, 'expense create handler exists');
  assert.match(paymentHandler[0], /!validDate\(date\) \|\| !date/);
  assert.match(expenseHandler[0], /!validDate\(date\) \|\| !date/);
});
