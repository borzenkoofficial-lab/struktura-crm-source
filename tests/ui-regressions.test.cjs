'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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


test('strict calendar date utility rejects impossible dates and accepts leap days', () => {
  const { validDate, normalizeProjectInput } = require('../src/project-utils.cjs');
  for (const date of ['2025-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '14.10.2026', '2026-10-14T00:00:00Z']) {
    assert.equal(validDate(date), false, `expected invalid date: ${date}`);
  }
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-10-14'), true);
  assert.throws(() => normalizeProjectInput({ title: 'Тестовый объект', start_date: '2026-02-30', end_date: '2026-03-10' }), /дату начала/);
  assert.throws(() => normalizeProjectInput({ title: 'Тестовый объект', start_date: '2026-10-15', end_date: '2026-10-14' }), /окончания не может быть раньше/);
});


test('all data-backed sections expose a recoverable load error and retry path', () => {
  const sectionNames = ['dashboard','leads','clients','projects','production','finance','prospects','tasks','reports'];
  for (const name of sectionNames) {
    assert.match(renderer, new RegExp(`\\b${name}: refresh`), `${name} has a loader`);
  }
  assert.match(renderer, /function renderSectionLoadError\(name\)/);
  assert.match(renderer, /data-retry-view=/);
  assert.match(renderer, /document\.addEventListener\('click',[\s\S]*?\[data-retry-view\]/);
  assert.match(renderer, /view\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(renderer, /finally\(\(\) => view\.removeAttribute\('aria-busy'\)\)/);
  assert.match(renderer, /Проверь локальную базу и повтори загрузку/);
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(css, /\.section-load-error/);
  assert.match(css, /\.view\[aria-busy="true"\]/);
});


test('lead pipeline supports validated status changes from the list through the preload bridge', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(preload, /updateLeadStatus: \(data\) => ipcRenderer\.invoke\('leads:updateStatus', data\)/);
  assert.match(main, /ipcMain\.handle\('leads:updateStatus'/);
  const handler = main.match(/ipcMain\.handle\('leads:updateStatus',[\s\S]*?\n\}\);/);
  assert.ok(handler, 'lead status update handler exists');
  assert.match(handler[0], /Number\.isSafeInteger\(id\)/);
  assert.match(handler[0], /allowedStatuses\.includes\(status\)/);
  assert.match(handler[0], /SELECT id FROM leads WHERE id=\?/);
  assert.match(handler[0], /UPDATE leads SET status=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\?/);
  assert.match(renderer, /data-lead-status=/);
  assert.match(renderer, /aria-label="Статус заявки:/);
  assert.match(renderer, /updateLeadStatus\(\{ id, status \}\)/);
});


test('client cards can be edited through validated main-process IPC', () => {
  assert.match(html, /id="clientDialogTitle"/); assert.match(html, /name="id"/);
  assert.match(renderer, /data-edit-client=/); assert.match(renderer, /window\.crm\.updateClient\(data\)/);
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(preload, /updateClient: \(data\) => ipcRenderer\.invoke\('clients:update', data\)/);
  const handler = main.match(/ipcMain\.handle\('clients:update',[\s\S]*?\n\}\);/);
  assert.ok(handler); assert.match(handler[0], /Number\.isSafeInteger\(id\)/);
  assert.match(handler[0], /UPDATE clients SET name=\?, phone=\?, email=\?, client_type=\?, notes=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\?/);
});

test('project status can be changed safely from the objects list', () => {
  assert.match(renderer, /data-project-status=/); assert.match(renderer, /window\.crm\.updateProjectStatus\(\{ id, status \}\)/);
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(preload, /updateProjectStatus: \(data\) => ipcRenderer\.invoke\('projects:updateStatus', data\)/);
  const handler = main.match(/ipcMain\.handle\('projects:updateStatus',[\s\S]*?\n\}\);/);
  assert.ok(handler); assert.match(handler[0], /allowedStatuses\.includes\(status\)/);
  assert.match(handler[0], /UPDATE projects SET status=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\?/);
});


test('lead details can be edited without creating a duplicate lead', () => {
  assert.match(html, /id="leadDialogTitle"/); assert.match(html, /name="id"/);
  assert.match(renderer, /data-edit-lead=/); assert.match(renderer, /window\.crm\.updateLead\(data\)/);
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(preload, /updateLead: \(data\) => ipcRenderer\.invoke\('leads:update', data\)/);
  const handler = main.match(/ipcMain\.handle\('leads:update',[\s\S]*?\n\}\);/);
  assert.ok(handler); assert.match(handler[0], /Number\.isSafeInteger\(id\)/);
  assert.match(handler[0], /UPDATE leads SET title=\?, service=\?, source=\?, budget_rub=\?, address=\?, notes=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\?/);
});


test('project details can be edited while linked finance and production records are preserved', () => {
  assert.match(html, /id="projectDialogTitle"/); assert.match(html, /name="id"/);
  assert.match(renderer, /data-edit-project=/); assert.match(renderer, /window\.crm\.updateProject\(data\)/);
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(preload, /updateProject: \(data\) => ipcRenderer\.invoke\('projects:update', data\)/);
  const handler = main.match(/ipcMain\.handle\('projects:update',[\s\S]*?\n\}\);/);
  assert.ok(handler); assert.match(handler[0], /normalizeProjectInput\(input\)/);
  assert.match(handler[0], /UPDATE projects SET title=@title, service=@service, status=@status, contract_rub=@contract_rub/);
  assert.doesNotMatch(handler[0], /DELETE FROM (payments|expenses|production_plans)/);
});


test('tasks can be edited without resetting completion status', () => {
  assert.match(html, /id="taskDialogTitle"/); assert.match(html, /name="id"/);
  assert.match(renderer, /window\.crm\.updateTask\(data\)/);
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(preload, /updateTask: \(data\) => ipcRenderer\.invoke\('tasks:update', data\)/);
  const handler = main.match(/ipcMain\.handle\('tasks:update',[\s\S]*?\n\}\);/);
  assert.ok(handler); assert.match(handler[0], /normalizeTaskInput\(input\)/);
  assert.match(handler[0], /UPDATE tasks SET title=\?, due_at=\?, lead_id=\?, project_id=\? WHERE id=\?/);
  assert.doesNotMatch(handler[0], /is_done\s*=/);
});


test('payment and expense records can be corrected with validated updates', () => {
  assert.match(html, /id="paymentDialogTitle"/); assert.match(html, /id="expenseDialogTitle"/);
  assert.match(renderer, /data-edit-payment=/); assert.match(renderer, /data-edit-expense=/);
  assert.match(renderer, /window\.crm\.updatePayment\(data\)/); assert.match(renderer, /window\.crm\.updateExpense\(data\)/);
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(preload, /updatePayment: \(data\) => ipcRenderer\.invoke\('payments:update', data\)/);
  assert.match(preload, /updateExpense: \(data\) => ipcRenderer\.invoke\('expenses:update', data\)/);
  const payment = main.match(/ipcMain\.handle\('payments:update',[\s\S]*?\n\}\);/);
  const expense = main.match(/ipcMain\.handle\('expenses:update',[\s\S]*?\n\}\);/);
  assert.ok(payment); assert.ok(expense);
  assert.match(payment[0], /validDate\(date\)/); assert.match(payment[0], /UPDATE payments SET/);
  assert.match(expense[0], /validDate\(date\)/); assert.match(expense[0], /UPDATE expenses SET/);
});


test('production shift reports can be corrected transactionally without stale work rows', () => {
  assert.match(html, /id="productionShiftDialogTitle"/);
  assert.match(renderer, /data-edit-production-shift=/);
  assert.match(renderer, /window\.crm\.getWorkShift/); assert.match(renderer, /window\.crm\.updateWorkShift\(data\)/);
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(preload, /getWorkShift: \(id\) => ipcRenderer\.invoke\('production:getShift', id\)/);
  assert.match(preload, /updateWorkShift: \(data\) => ipcRenderer\.invoke\('production:updateShift', data\)/);
  const handler = main.match(/ipcMain\.handle\('production:updateShift',[\s\S]*?\n\}\);/);
  assert.ok(handler); assert.match(handler[0], /db\.transaction/);
  assert.match(handler[0], /DELETE FROM work_shift_items WHERE shift_id=\?/);
  assert.match(handler[0], /UPDATE work_shifts SET/);
});


test('reports combine sales funnel and finance metrics with explicit cash-balance limitations', () => {
  for (const id of ['reportReceived','reportExpenses','reportCash','reportReceivables']) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /не банковский баланс и не чистая прибыль/);
  assert.ok(renderer.includes("$('reportReceivables').textContent = fmt(finance.receivablesTotal)"));
});

test('commercial order card button is wired through preload to the lead conversion handler', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(renderer, /data-order-convert/);
  assert.match(renderer, /closest\('\[data-order-convert\]'\)/);
  assert.match(renderer, /window\.crm\.convertCommercialOrderToLead\(orderId\)/);
  assert.match(renderer, /await refreshLeads\(\)/);
  assert.match(preload, /convertCommercialOrderToLead: \(id\) => ipcRenderer\.invoke\('orders:convertLead', id\)/);
  assert.match(main, /ipcMain\.handle\('orders:convertLead'/);
});

test('converting a commercial order to a lead preserves its PI economics as provisional context', () => {
  const handler = main.match(/ipcMain\.handle\('orders:convertLead',[\s\S]*?\n\}\);/);
  assert.ok(handler);
  assert.match(handler[0], /SELECT \* FROM commercial_order_analysis WHERE order_id=\?/);
  assert.match(handler[0], /ПИ — предварительная экономика, не подтверждённая смета/);
  assert.match(handler[0], /estimated_profit_rub/);
  assert.match(handler[0], /estimated_margin_pct/);
  assert.match(handler[0], /estimated_days/);
  assert.match(handler[0], /бюджет заказчика не подтверждён/);
});

test('client and prospect create, update and CSV import validate contact email at the main-process boundary', () => {
  assert.match(main, /require\('\.\/contact-utils\.cjs'\)/);
  assert.ok(main.includes('email: normalizeContactEmail(input.email)'));
  assert.ok(main.includes('email: normalizeContactEmail(item.email)'));
});


test('Windows app startup hides the legacy menu and reports startup failures', () => {
  assert.match(main, /Menu\.setApplicationMenu\(null\)/);
  assert.match(main, /win\.setMenuBarVisibility\(false\)/);
  assert.match(main, /Failed to load CRM interface/);
  assert.match(main, /Struktura CRM startup failed/);
});

test('startup splash has an independent CSS failsafe if renderer JavaScript never runs', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(css, /startup-splash-failsafe/);
  assert.match(css, /12s/);
  assert.match(renderer, /Превышено время ожидания загрузки обзора/);
});


test('primary navigation is registered before optional renderer widgets initialize', () => {
  const early = renderer.indexOf('Register primary navigation before the rest of renderer initialization');
  const laterWidgets = renderer.indexOf("window.crm.onBrowserState(updateBrowserState)");
  assert.notEqual(early, -1, 'early navigation delegate exists');
  assert.ok(laterWidgets > early, 'navigation is wired before browser widget initialization');
  assert.match(renderer, /event\.target\.closest\('\[data-view\]'\)/);
  assert.match(renderer, /window\.addEventListener\('error'/);
  assert.doesNotMatch(renderer, /document\.querySelectorAll\('\[data-view\]'\)\.forEach\(b => b\.addEventListener/);
});

test('renderer and Electron entry scripts pass Node syntax validation', () => {
  const files = [
    '../src/main.cjs', '../src/preload.cjs', '../src/renderer.js',
    '../src/production-intelligence.js', '../src/prospect-scoring.js',
    '../src/prospect-radar.js', '../src/estimate-calculator.js'
  ];
  for (const relative of files) {
    const file = path.join(__dirname, relative);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Syntax check failed for ${relative}: ${result.stderr || result.stdout}`);
  }
});


test('additional income CRUD is wired end-to-end and contributes to cash totals exactly once', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  const db = fs.readFileSync(path.join(__dirname, '../src/db.cjs'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
  assert.match(html, /id="addIncomeBtn"/);
  assert.match(html, /id="incomeForm"/);
  assert.match(html, /name="record_type"/);
  assert.match(renderer, /window\.crm\.listIncomeRecords\(\)/);
  assert.match(renderer, /window\.crm\.createIncomeRecord\(data\)/);
  assert.match(renderer, /window\.crm\.updateIncomeRecord\(data\)/);
  assert.match(preload, /listIncomeRecords: \(\) => ipcRenderer\.invoke\('income:list'\)/);
  assert.match(preload, /createIncomeRecord: \(data\) => ipcRenderer\.invoke\('income:create', data\)/);
  assert.match(preload, /updateIncomeRecord: \(data\) => ipcRenderer\.invoke\('income:update', data\)/);
  assert.match(main, /ipcMain\.handle\('income:list'/);
  assert.match(main, /ipcMain\.handle\('income:create'/);
  assert.match(main, /ipcMain\.handle\('income:update'/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS income_records/);
  assert.match(main, /const totalReceived = received \+ otherIncome/);
  assert.match(main, /cash: totalReceived - expenses/);
  assert.match(main, /cash: totalReceived - paid/);
});


test('PI compares recent production performance, detects persistent low output and declining trend', () => {
  const { buildProductionIntelligence } = require('../src/production-intelligence.js');
  const history = [
    { project_id: 1, shift_date: '2026-10-15', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж стяжки', unit: 'м²', actualRate: 70, expectedRate: 100, deviationPct: -30 }] },
    { project_id: 1, shift_date: '2026-10-14', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж стяжки', unit: 'м²', actualRate: 72, expectedRate: 100, deviationPct: -28 }] },
    { project_id: 1, shift_date: '2026-10-13', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж стяжки', unit: 'м²', actualRate: 68, expectedRate: 100, deviationPct: -32 }] },
    { project_id: 1, shift_date: '2026-10-12', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж стяжки', unit: 'м²', actualRate: 105, expectedRate: 100, deviationPct: 5 }] },
    { project_id: 1, shift_date: '2026-10-11', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж стяжки', unit: 'м²', actualRate: 100, expectedRate: 100, deviationPct: 0 }] },
    { project_id: 1, shift_date: '2026-10-10', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж стяжки', unit: 'м²', actualRate: 98, expectedRate: 100, deviationPct: -2 }] }
  ];
  const result = buildProductionIntelligence({
    projects: [{ id: 1, title: 'Тестовый объект', planCount: 1, shiftCount: 6, forecast: { estimated: true, lines: [] }, lastShiftDate: '2026-10-15' }],
    history,
    totals: { shifts: 6, work_records: 6 }
  }, { today: '2026-10-15' });
  assert.equal(result.dataQuality.comparableWorkTypes, 1);
  assert.equal(result.dataQuality.lowProductivityWorkTypes, 1);
  assert.equal(result.dataQuality.decliningWorkTypes, 1);
  assert.ok(result.alerts.some(alert => alert.title.includes('Устойчивая выработка ниже нормы')));
  assert.ok(result.alerts.some(alert => alert.title.includes('Выработка ухудшается')));
  assert.match(result.summary, /сравнение по истории доступно для 1 видов работ/);
});

test('PI refuses to infer productivity trends from fewer than three valid observations', () => {
  const { buildProductionIntelligence } = require('../src/production-intelligence.js');
  const result = buildProductionIntelligence({
    projects: [{ id: 1, title: 'Тест', planCount: 1, forecast: { estimated: true, lines: [] }, shiftCount: 2, lastShiftDate: '2026-10-15' }],
    history: [
      { project_id: 1, shift_date: '2026-10-15', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж', unit: 'м²', actualRate: 70, expectedRate: 100, deviationPct: -30 }] },
      { project_id: 1, shift_date: '2026-10-14', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж', unit: 'м²', actualRate: 72, expectedRate: 100, deviationPct: -28 }] }
    ],
    totals: { shifts: 2, work_records: 2 }
  }, { today: '2026-10-15' });
  assert.equal(result.dataQuality.comparableWorkTypes, 0);
  assert.equal(result.dataQuality.lowProductivityWorkTypes, 0);
  assert.equal(result.alerts.some(alert => alert.title.includes('Устойчивая выработка ниже нормы')), false);
});

test('PI labels invalid or missing productivity data instead of treating it as zero output', () => {
  const { buildProductionIntelligence } = require('../src/production-intelligence.js');
  const result = buildProductionIntelligence({
    projects: [{ id: 1, title: 'Тест', planCount: 1, forecast: { estimated: true, lines: [] }, shiftCount: 1, lastShiftDate: '2026-10-15' }],
    history: [{ project_id: 1, shift_date: '2026-10-15', shift_hours: 8, downtime_hours: 0, performance: [{ work_name: 'Демонтаж', unit: 'м²', actualRate: 0, expectedRate: 100, deviationPct: -100 }] }],
    totals: { shifts: 1, work_records: 1 }
  }, { today: '2026-10-15' });
  assert.equal(result.dataQuality.validPerformanceObservations, 0);
  assert.equal(result.dataQuality.invalidPerformanceObservations, 1);
  assert.equal(result.dataQuality.comparableWorkTypes, 0);
});


test('PI flags unstable output when comparable observations vary sharply', () => {
  const { buildProductionIntelligence } = require('../src/production-intelligence.js');
  const deviations = [-40, -5, -45, -2, -3, -1];
  const history = deviations.map((deviation, index) => ({
    project_id: 1,
    shift_date: `2026-10-${String(15 - index).padStart(2, '0')}`,
    shift_hours: 8,
    downtime_hours: 0,
    performance: [{ work_name: 'Вынос вручную', unit: 'м³', actualRate: 100 + deviation, expectedRate: 100, deviationPct: deviation }]
  }));
  const result = buildProductionIntelligence({
    projects: [{ id: 1, title: 'Тест', planCount: 1, forecast: { estimated: true, lines: [] }, shiftCount: 6, lastShiftDate: '2026-10-15' }],
    history,
    totals: { shifts: 6, work_records: 6 }
  }, { today: '2026-10-15' });
  assert.equal(result.dataQuality.unstableWorkTypes, 1);
  assert.ok(result.alerts.some(alert => alert.title.includes('Нестабильная выработка')));
});


test('PI proposes conservative local norm calibration only after five valid observations', () => {
  const { buildProductionIntelligence } = require('../src/production-intelligence.js');
  const history = [0, 1, 2, 3, 4].map(index => ({
    project_id: 1,
    shift_date: `2026-10-${String(15 - index).padStart(2, '0')}`,
    shift_hours: 8,
    downtime_hours: 0,
    performance: [{ work_name: 'Демонтаж стяжки', unit: 'м²', actualRate: 70, expectedRate: 100, deviationPct: -30 }]
  }));
  const result = buildProductionIntelligence({
    projects: [{ id: 1, title: 'Тест', planCount: 1, forecast: { estimated: true, lines: [] }, shiftCount: 5, lastShiftDate: '2026-10-15' }],
    history,
    totals: { shifts: 5, work_records: 5 }
  }, { today: '2026-10-15' });
  const model = result.learningModels.find(item => item.workName === 'Демонтаж стяжки');
  assert.equal(model.observations, 5);
  assert.equal(model.observedFactor, 0.7);
  assert.equal(model.suggestedFactor, 0.85);
  assert.equal(model.status, 'candidate');
  assert.match(result.learningSummary, /не применяются автоматически/);
});

test('PI keeps sparse calibration data in collection mode and never suggests an extreme correction', () => {
  const { buildProductionIntelligence } = require('../src/production-intelligence.js');
  const history = [0, 1, 2].map(index => ({
    project_id: 1,
    shift_date: `2026-10-${String(15 - index).padStart(2, '0')}`,
    shift_hours: 8,
    downtime_hours: 0,
    performance: [{ work_name: 'Вынос вручную', unit: 'м³', actualRate: 150, expectedRate: 100, deviationPct: 50 }]
  }));
  const result = buildProductionIntelligence({
    projects: [{ id: 1, title: 'Тест', planCount: 1, forecast: { estimated: true, lines: [] }, shiftCount: 3, lastShiftDate: '2026-10-15' }],
    history,
    totals: { shifts: 3, work_records: 3 }
  }, { today: '2026-10-15' });
  const model = result.learningModels.find(item => item.workName === 'Вынос вручную');
  assert.equal(model.status, 'watch');
  assert.equal(model.suggestedFactor, 1);
  assert.equal(result.learningSummary.includes('не предлагает менять нормы'), true);
});


test('product presentation tab is reachable and contains the STRUKTURA story and functional navigation', () => {
  assert.match(html, /data-view="about"/);
  assert.match(html, /id="view-about"/);
  assert.match(html, /Порядок в работе/);
  assert.match(html, /Факты важнее впечатлений/);
  assert.match(html, /ПИ — производственный интеллект/);
  assert.match(html, /data-goto="production"/);
  assert.match(html, /data-goto="projects"/);
  assert.match(renderer, /about: 'О продукте STRUKTURA'/);
});

test('product presentation includes responsive 3D visuals and respects reduced-motion preferences', () => {
  const styles = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(styles, /\.about-hero-scene/);
  assert.match(styles, /perspective:/);
  assert.match(styles, /@keyframes about-slab-float/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)\{\.about-view/);
});
