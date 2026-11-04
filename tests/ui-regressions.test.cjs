'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
const pinSecurity = fs.readFileSync(path.join(__dirname, '../src/pin-security.cjs'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
const layoutCss = fs.readFileSync(path.join(__dirname, '../src/ui-layout-hardening.css'), 'utf8');

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

test('commercial tariff page is fully removed without affecting license management', () => {
  assert.doesNotMatch(html, /id="view-plans"|data-view="plans"|data-plan-action/);
  assert.doesNotMatch(html, /Тариф СКОЛ CRM|Тариф и интеграции|Покупка пока не активна|платёжный провайдер будет подключён отдельно/);
  assert.doesNotMatch(renderer, /data-plan-action|plans: 'Тариф/);
  assert.match(html, /id="manageLicenseBtn"/, 'local license management remains available in Settings');
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
  assert.match(renderer, /\.finally\(\(\) => \{[\s\S]*?hideStartupSplash\(\);[\s\S]*?\}\)/, 'startup hides the splash after the startup gate resolves');
  assert.doesNotMatch(renderer, /maybeStartNavGuide|NAV_GUIDE_STORAGE_KEY/);
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
  assert.match(dashboard[1], /Весь бизнес/);
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

test('homepage shows the live production-intelligence feed without an illustrative dashboard mockup', () => {
  assert.match(html, /id="piHomeSummary"/);
  assert.match(html, /id="piHomeAlerts"/);
  assert.match(renderer, /renderProductionIntelligence\(snapshot\.production, 'piHomeSummary', 'piHomeAlerts'\)/);
  assert.doesNotMatch(html, /id="piExplainerTitle"|class="pi-mockup"|Демо-данные/);
});

test('backup restore is exposed in the UI and safe preload bridge', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(html, /id="restoreBackupBtn"/);
  assert.match(renderer, /\$\('restoreBackupBtn'\)\.addEventListener\('click'/);
  assert.match(preload, /restoreBackup:\s*\(\) => ipcRenderer\.invoke\('backup:restore'\)/);
  assert.match(main, /ipcMain\.handle\('backup:restore'/);
});

test('data and product utilities are grouped inside Settings, not in the Dock', () => {
  const settingsStart = html.indexOf('id="view-settings"');
  const settingsEnd = html.indexOf('<footer class="app-footer"', settingsStart);
  const settings = html.slice(settingsStart, settingsEnd);
  for (const id of ['dataFolderBtn','backupBtn','restoreBackupBtn']) {
    assert.ok(settings.includes('id="' + id + '"'), id + ' is available in Settings');
  }
  assert.ok(settings.includes('class="about-settings-details"'), 'product information is expandable inside Settings');
  assert.ok(settings.includes('О продукте СКОЛ'));
  const dockStart = html.indexOf('id="skolDock"');
  const dockEnd = html.indexOf('</nav>', dockStart);
  const dock = html.slice(dockStart, dockEnd);
  for (const id of ['dataFolderBtn','backupBtn','restoreBackupBtn']) assert.ok(!dock.includes('id="' + id + '"'));
  assert.match(html, /id="manageLicenseBtn"/, 'license management remains separate from the removed commercial tariff page');
});

test('backup restore validates SQLite structure and preserves an automatic rollback copy', () => {
  const backupUtils = fs.readFileSync(path.join(__dirname, '../src/backup-utils.cjs'), 'utf8');
  assert.match(main, /validateBackupDatabase\(candidate\)/);
  assert.match(main, /validateBackupDatabase\(normalized\)/);
  assert.match(backupUtils, /integrity_check/);
  assert.match(backupUtils, /REQUIRED_BACKUP_COLUMNS/);
  assert.match(backupUtils, /clients: \['id', 'name', 'phone', 'email'/);
  assert.match(main, /await db\.backup\(safetyPath\)/);
  assert.match(main, /прежняя база возвращена/);
  assert.match(main, /Действующая база не изменена/);
});

test('backup restore normalizes SQLite files so source WAL data is included and rollback sidecars are cleared', () => {
  const restoreStart = main.indexOf("ipcMain.handle('backup:restore'");
  const restoreEnd = main.indexOf("ipcMain.handle('browser:state'", restoreStart);
  const restore = main.slice(restoreStart, restoreEnd);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, 'restore handler exists');
  assert.match(restore, /await candidate\.backup\(restoreCandidatePath\)/);
  assert.match(restore, /new Database\(restoreCandidatePath, \{ readonly: true, fileMustExist: true \}\)/);
  assert.match(restore, /fs\.copyFileSync\(restoreCandidatePath, livePath\)/);
  assert.doesNotMatch(restore, /fs\.copyFileSync\(sourcePath, livePath\)/);
  assert.match(restore, /for \(const sidecar of \[walPath, shmPath\]\).*fs\.rmSync\(sidecar/);
  assert.match(restore, /fs\.rmSync\(restoreCandidatePath, \{ force: true \}\)/);
});

test('backup restore cleans candidate and incomplete safety backup if safety backup creation fails', () => {
  const restoreStart = main.indexOf("ipcMain.handle('backup:restore'");
  const restoreEnd = main.indexOf("ipcMain.handle('browser:state'", restoreStart);
  const restore = main.slice(restoreStart, restoreEnd);
  const safetyBlock = restore.slice(restore.indexOf('const safetyPath'), restore.indexOf('  db.close();', restore.indexOf('const safetyPath')));
  assert.match(safetyBlock, /try\s*\{[\s\S]*db\.pragma\('wal_checkpoint\(FULL\)'\)[\s\S]*await db\.backup\(safetyPath\)[\s\S]*\}\s*catch\s*\(error\)/);
  assert.match(safetyBlock, /fs\.rmSync\(safetyPath, \{ force: true \}\)/);
  assert.match(safetyBlock, /fs\.rmSync\(restoreCandidatePath, \{ force: true \}\)/);
  assert.match(safetyBlock, /Действующая база не изменена/);
  assert.ok(restore.indexOf('db.close();', restore.indexOf('const safetyPath')) > restore.indexOf('await db.backup(safetyPath)'), 'live database stays open until safety backup succeeds');
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
  assert.match(handler[0], /UPDATE clients SET name=\?, phone=\?, email=\?, contact_name=\?, client_type=\?, notes=\?, updated_at=CURRENT_TIMESTAMP WHERE id=\?/);
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
  assert.match(handler[0], /UPDATE projects SET lead_id=@lead_id, client_id=@client_id, title=@title, service=@service, status=@status, contract_rub=@contract_rub/);
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
  assert.ok(renderer.includes("$('reportReceivables').textContent = fmt(report.finance.receivablesTotal)"));
  assert.match(renderer, /window\.crm\.reportsSummary\(\)/);
  assert.match(main, /ipcMain\.handle\('reports:summary'/);
  assert.match(html, /report-finance-stats" data-feature="finance"/);
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
  assert.match(handler[0], /INSERT INTO tasks\(lead_id,title,due_at\)/);
  assert.match(handler[0], /Проверить заказ и связаться с заказчиком/);
  assert.match(handler[0], /due\.setDate\(due\.getDate\(\)\+1\)/);
  assert.match(renderer, /if\(!result\.alreadyExists\) await refreshTasks\(\)/);
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
  assert.match(main, /СКОЛ startup failed/);
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
    '../src/engineering-calculator-ui.js', '../src/engineering-project-plan.js', '../src/engineering-project-plan-ui.js',
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


test('product information is grouped inside Settings with its original story and contextual navigation', () => {
  assert.match(html, /class="about-settings-details"/);
  assert.match(html, /<strong>О продукте СКОЛ<\/strong>/);
  assert.match(html, /Порядок в работе/);
  assert.match(html, /Факты важнее впечатлений/);
  assert.match(html, /data-goto="production"/);
  assert.match(html, /data-goto="projects"/);
  assert.doesNotMatch(html, /id="view-about"|data-view="about"/);
});
test('product presentation includes responsive 3D visuals and respects reduced-motion preferences', () => {
  const styles = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(styles, /\.about-hero-scene/);
  assert.match(styles, /perspective:/);
  assert.match(styles, /@keyframes about-slab-float/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)\{\.about-view/);
});

test('objects workspace is divided into numbered, responsive sections with a separate object list', () => {
  const projectView = html.slice(html.indexOf('id="view-projects"'), html.indexOf('id="view-production"'));
  for (const heading of [
    'Паспорт сметы', 'Состав работ и объёмы', 'Планирование сроков',
    'Фактическая производительность', 'Себестоимость и расходы',
    'Итоговая экономика', 'Контроль объекта: план / факт', 'Действия по смете'
  ]) assert.ok(projectView.includes(heading), `objects workflow includes "${heading}"`);
  assert.match(projectView, /class="object-list-head"[\s\S]*?<div class="panel records-panel"><div class="records-workspace"><div id="projectsTable" class="table-wrap records-list">/);
  const styles = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(styles, /#view-projects \.object-block-title/);
  assert.match(styles, /@media\(max-width:480px\)\{#view-projects/);
  assert.match(styles, /#view-projects \.estimate-pro-results/);
});


test('PI voice companion is present, data-driven, and supports speech plus evidence', () => {
  assert.match(html, /id="piCoachAvatarBtn"/);
  assert.match(html, /id="piCoachPopover"/);
  assert.match(html, /id="piCoachSpeakBtn"/);
  assert.match(html, /id="piCoachListenBtn"/);
  assert.match(html, /id="piCoachEvidence"/);
  assert.match(html, /src="pi-coach\.js"/);
  assert.match(renderer, /SpeechSynthesisUtterance/);
  assert.match(renderer, /SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(renderer, /function piCoachAnswerVoice/);
  assert.match(renderer, /window\.crm\.estimateHistory\(\)/);
  assert.match(renderer, /window\.crm\.productionOverview\(\)/);
  assert.match(renderer, /window\.crm\.piCoachHistory\(\)/);
  assert.match(renderer, /window\.crm\.financeInsights\(\)/);
  assert.match(renderer, /20 \* 60 \* 1000/);
  const styles = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(styles, /\.pi-coach-avatar/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('exported quote history is stored locally and exposed through a narrow preload API', () => {
  const database = fs.readFileSync(path.join(__dirname, '../src/db.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  assert.match(database, /CREATE TABLE IF NOT EXISTS quote_history/);
  assert.match(main, /ipcMain\.handle\('estimate:history'/);
  assert.match(main, /INSERT INTO quote_history/);
  assert.match(main, /ipcMain\.handle\('pi:coachHistory'/);
  assert.match(preload, /piCoachHistory: \(\) => ipcRenderer\.invoke\('pi:coachHistory'\)/);
  assert.match(preload, /estimateHistory: \(\) => ipcRenderer\.invoke\('estimate:history'\)/);
});

test('startup PIN is configurable in settings, verified in main process, and hashed with scrypt', () => {
  assert.match(html, /id="pinLockScreen"/);
  assert.match(html, /id="pinUnlockForm"/);
  assert.match(html, /id="pinSettingsForm"/);
  assert.match(html, /id="pinDisableBtn"/);
  assert.match(renderer, /initializeStartupGate\(\)\s*\.then\(\(\) => Promise\.race\(\[\s*refreshDashboard\(\)/);
  assert.match(preload, /verifyPin: \(data\) => ipcRenderer\.invoke\('security:pinVerify', data\)/);
  assert.match(main, /require\('\.\/pin-security\.cjs'\)/);
  assert.match(pinSecurity, /crypto\.scryptSync\(pin, salt, 64\)/);
  assert.match(pinSecurity, /crypto\.timingSafeEqual/);
  assert.match(main, /security:pinSet/);
  assert.match(main, /allowedWhileLocked/);
  assert.match(main, /if \(!appUnlocked && !allowedWhileLocked\.has\(channel\)\)/);
  assert.match(main, /if \(attempt\.result\.ok\) appUnlocked = true/);
  assert.match(main, /lockedUntil/);
});

test('PI error history keeps errors after transient toast and exposes explanations', () => {
  assert.match(renderer, /PI_ERROR_STORAGE_KEY/);
  assert.match(renderer, /function piRecordError\(/);
  assert.match(renderer, /function piErrorExplain\(/);
  assert.match(renderer, /window\.addEventListener\('unhandledrejection'/);
  assert.match(renderer, /function openPiErrorHistory\(/);
  assert.match(renderer, /piRecordError\(error\.message, 'Производство · План работ', error\)/);
  assert.match(html, /id="piErrorHistoryDialog"/);
  assert.match(html, /id="piOpenErrorHistoryBtn"/);
  assert.match(html, /id="piErrorList"/);
  assert.match(html, /id="piErrorDetail"/);
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(css, /\.pi-error-history-layout/);
});


test('production report export does not reference quote-only variables and quote export owns history persistence', () => {
  const reportStart = main.indexOf("ipcMain.handle('production:exportReportPdf'");
  const quoteStart = main.indexOf("ipcMain.handle('estimate:exportQuotePdf'");
  assert.ok(reportStart >= 0 && quoteStart > reportStart);
  const report = main.slice(reportStart, quoteStart);
  const quote = main.slice(quoteStart, main.indexOf("ipcMain.handle('updates:status'", quoteStart));
  assert.doesNotMatch(report, /total - costRub|run\(title, customer|discount, lines\.length/);
  assert.match(quote, /INSERT INTO quote_history/);
  assert.match(quote, /historySaved: true/);
});


test('PDF commercial quote recalculates the final total from submitted work lines', () => {
  assert.match(main, /require\('\.\/quote-economics\.cjs'\)/);
  const quoteStart = main.indexOf("ipcMain.handle('estimate:exportQuotePdf'");
  const quoteEnd = main.indexOf("ipcMain.handle('updates:status'", quoteStart);
  const quote = main.slice(quoteStart, quoteEnd);
  assert.match(quote, /calculateQuoteTotals\(lines, input\.discount, input\.costInputs \|\| \{\}\)/);
  assert.match(quote, /const total = totals\.revenueRub/);
  assert.match(main, /function quoteUnitPrice\(value\)/);
  assert.match(quote, /quoteUnitPrice\(line\.price\)/);
  assert.match(quote, /const price = Math\.round\(priceInput \* 100\) \/ 100/);
  assert.match(quote, /const discount = totals\.discountRub/);
  assert.doesNotMatch(quote, /Number\(input\.revenue\)/);
  assert.doesNotMatch(quote, /estimatedCostRub|estimatedProfitRub|input\.marginPct/);
  assert.match(quote, /const profitRub = totals\.profitRub/);
  assert.match(renderer, /costInputs: \{ payroll: r\.payroll/);
});

test('project editor exposes client and lead selectors and persists relationship columns', () => {
  assert.match(html, /id="projectClientSelect"/);
  assert.match(html, /id="projectLeadSelect"/);
  assert.ok(renderer.includes('populateProjectRelationships'));
  assert.ok(main.includes('INSERT INTO projects(lead_id,client_id,title'));
  assert.ok(main.includes('UPDATE projects SET lead_id=@lead_id, client_id=@client_id'));
  assert.ok(main.includes('Выбранная заявка принадлежит другому клиенту'));
});

test('date-only defaults use local calendar fields rather than UTC ISO conversion', () => {
  assert.ok(renderer.includes('function dateToday() { const now = new Date();'));
  assert.ok(!renderer.includes('function dateToday() { return new Date().toISOString()'));
  assert.ok(renderer.includes('productionReportStart'));
  assert.ok(renderer.includes("padStart(2,'0')"));
});


test('export filenames and startup dialogs use the current brand and real line breaks', () => {
  assert.ok(main.includes('СКОЛ-'));
  assert.ok(!main.includes('gruzli-'));
  assert.ok(main.includes('Не удалось загрузить интерфейс приложения.\\n\\n'));
  assert.ok(!main.includes('Не удалось загрузить интерфейс приложения.\\\\n\\\\n'));
});


test('prominent brand surfaces use the SKOL wordmark and monogram assets', () => {
  assert.match(html, /class="startup-mark"[^>]*><img src="assets\/skol-monogram-mark\.svg"/);
  assert.match(html, /class="dashboard-hero-emblem"><img src="assets\/skol-monogram-mark\.svg"/);
  assert.match(html, /class="browser-welcome-mark"><img src="assets\/skol-monogram-mark\.svg"/);
  assert.match(html, /assets\/skol-wordmark\.svg/);
  assert.doesNotMatch(html, /assets\/skol-wordmark-inverse\.svg/);
  assert.match(html, /Компании, представители заказчиков и контактные данные/);
  assert.doesNotMatch(html, /Контакты заказчиков и история отношений/);
});

test('regression fixes preserve contract amounts, task links, budgets and finance semantics', () => {
  assert.match(renderer, /String\(Math\.round\(result\.revenue\)\)/);
  assert.match(renderer, /Keep closed records selectable/);
  assert.match(renderer, /taskBucket\(t\) === 'overdue'/);
  assert.match(renderer, /Math\.max\(0,Number\(p\.contract_rub\)-Math\.max\(0,Number\(p\.received_rub\)\)\)/);
  assert.match(renderer, /estimateCrewDaysForCost/);
  assert.match(renderer, /Полный срок не рассчитан — проверь оплату бригады/);
  assert.match(main, /leadBudget=Math\.max\(0,Math\.round\(Number\(order\.budget_rub\)\|\|0\)\)/);
  assert.doesNotMatch(main, /leadBudget=Math\.max\(0,Math\.round\(Number\(analysis\?\.revenue_rub\)/);
  assert.match(main, /Статус «Превращена в заявку» устанавливается только действием конвертации/);
  assert.match(main, /normalizePhone/);
  assert.match(main, /datetime\(t\.due_at\)<datetime\('now','localtime'\)/);
  const database = fs.readFileSync(path.join(__dirname, '../src/db.cjs'), 'utf8');
  assert.match(database, /baseline_productivity REAL NOT NULL CHECK\(baseline_productivity >= 0\)/);
  assert.match(database, /production_plans_legacy/);
});


test('PIN controls are available from a dedicated Settings workspace', () => {
  assert.match(html, /id="skolDock"[\s\S]*?data-view="settings"/);
  assert.match(html, /id="view-settings"/);
  assert.match(html, /id="pinSettingsForm"/);
  assert.match(renderer, /settings: 'Настройки'/);
  assert.match(renderer, /if \(name === 'settings'\) refreshPinSettings\(\)/);
});

test('modal dialogs use opaque surfaces and readable backdrops', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  assert.match(css, /dialog\.modal,dialog\.modal\[open\]\{background-color:#fff!important/);
  assert.match(css, /dialog\.modal::backdrop\{background:rgba\(9,20,35,\.68\)/);
});

test('PI shows user-friendly error explanations and hides raw IPC errors behind disclosure', () => {
  assert.match(renderer, /function piErrorUserMessage\(message\)/);
  assert.match(renderer, /Отчёт смены не сохранён/);
  assert.match(renderer, /Технические подробности для диагностики/);
  assert.doesNotMatch(renderer, /<p><strong>Техническое сообщение<\/strong>/);
  assert.match(renderer, /item\.userMessage \|\| piErrorUserMessage\(item\.message\)/);
});


test('production economics explains that per-unit costs exclude crew payroll', () => {
  assert.match(html, /Прочие затраты на единицу, ₽/);
  assert.match(html, /Без зарплаты рабочих: оплата бригады учитывается отдельно/);
});

test('engineering calculator UI script is loaded after its core module', () => {
  const coreScript = '<script src="engineering-calculator.js"></script>';
  const uiScript = '<script src="engineering-calculator-ui.js"></script>';
  const coreIndex = html.indexOf(coreScript);
  const uiIndex = html.indexOf(uiScript);
  assert.notEqual(coreIndex, -1, 'engineering calculator core script is linked');
  assert.notEqual(uiIndex, -1, 'engineering calculator UI script is linked');
  assert.ok(uiIndex > coreIndex, 'UI script loads after the calculator core');
  const ui = fs.readFileSync(path.join(__dirname, '../src/engineering-calculator-ui.js'), 'utf8');
  assert.match(ui, /engCalculateBtn/);
  assert.match(ui, /engSaveActualBtn/);
});

test('engineering calculator reports shift-report evidence instead of false zero-confidence warnings', () => {
  const engineeringUi = fs.readFileSync(path.join(__dirname, '../src/engineering-calculator-ui.js'), 'utf8');
  assert.ok(engineeringUi.includes('renderResult(result, input, Number(result.observations ?? observations.length))'));
  assert.ok(engineeringUi.includes('Number.isFinite(Number(p.result?.observations))'));
  assert.ok(engineeringUi.includes("p.result?.rateEvidenceSource === 'Фактические сменные отчёты'"));
  assert.ok(engineeringUi.includes("result.warnings = (result.warnings || []).filter(w => !String(w).startsWith('Нет фактических наблюдений:'))"));
  assert.ok(engineeringUi.includes('if (externalCount < 3) result.warnings.push'));
});

test('production rate-model IPC returns evidence weight for conservative estimate learning', () => {
  assert.match(main, /observedWeight:\s*model\.observedWeight/);
  const engineeringUi = fs.readFileSync(path.join(__dirname, '../src/engineering-calculator-ui.js'), 'utf8');
  assert.match(engineeringUi, /api\.applyRateEvidence\(input, evidence\)/);
});

test('engineering calculator compares local history with production shift evidence', () => {
  const core = fs.readFileSync(path.join(__dirname, '../src/engineering-calculator.js'), 'utf8');
  const engineeringUi = fs.readFileSync(path.join(__dirname, '../src/engineering-calculator-ui.js'), 'utf8');
  assert.match(core, /function selectRateEvidence\(localObservations = \[\], externalModel = null\)/);
  assert.match(core, /externalCount > local\.length/);
  assert.match(engineeringUi, /return api\.selectRateEvidence\(local, externalModel\)/);
  assert.doesNotMatch(engineeringUi, /if \(local\.length\) return \{ observations: local/);
});

test('complex project-plan history can be opened, updated, deleted, and retains calendar settings', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  const plannerUi = fs.readFileSync(path.join(__dirname, '../src/engineering-project-plan-ui.js'), 'utf8');
  assert.match(html, /id="engPlanNewBtn"/);
  assert.match(html, /id="engProjectPlanHistory"/);
  assert.match(html, /Планы хранятся в SQLite и входят в резервную копию CRM/);
  assert.match(plannerUi, /data-plan-load=/);
  assert.match(plannerUi, /data-plan-delete=/);
  assert.match(plannerUi, /window\.crm\?\.deleteEngineeringPlan/);
  assert.match(plannerUi, /activeSavedPlanId \|\| makePlanId\(\)/);
  assert.match(plannerUi, /const index = history\.findIndex\(item => item && item\.id === record\.id\)/);
  assert.match(plannerUi, /calendarOptions/);
  assert.match(plannerUi, /if \(missing\.length\) stored = await window\.crm\.listEngineeringPlans\(\)/);
  assert.match(plannerUi, /localStorage\.removeItem\(STORAGE_KEY\)/);
});

test('estimate data transfers into standard or complex PI and triggers the chosen calculation',()=>{
 const transfer=fs.readFileSync(path.join(__dirname,'../src/engineering-transfer.js'),'utf8');
 const standardUI=fs.readFileSync(path.join(__dirname,'../src/engineering-calculator-ui.js'),'utf8');
 const plannerUI=fs.readFileSync(path.join(__dirname,'../src/engineering-project-plan-ui.js'),'utf8');
 assert.match(html,/id="estimatePiTransferBtn"/);assert.match(html,/id="estimateEngineeringTransferDialog"/);
 assert.match(html,/value="standard"/);assert.match(html,/value="complex"/);assert.match(html,/Перенести и сразу рассчитать/);
 assert.match(html,/src="engineering-transfer\.js"/);assert.match(renderer,/buildEstimateEngineeringTransfer\(mode,selectedLineId\)/);
 assert.match(renderer,/durationLines:duration\.lines/);assert.match(renderer,/new CustomEvent\('skol:engineering-transfer'/);
 assert.match(transfer,/function buildEngineeringTransfer\(source=\{\}\)/);assert.match(standardUI,/window\.addEventListener\('skol:engineering-transfer'/);
 assert.match(standardUI,/runEngineeringCalculation\(\{/);assert.match(standardUI,/rateEvidenceAlreadyAdjusted/);
 assert.match(plannerUI,/window\.addEventListener\('skol:engineering-transfer'/);assert.match(plannerUI,/sourceMetadata:activeSourceMetadata/);
 assert.match(plannerUI,/\$\('engProjectPlanCalculateBtn'\)\.click\(\)/);
});

test('lead acquisition workspace shows source-backed order metrics and clear workspace naming', () => {
  assert.ok(html.includes('Центр заказов'));
  assert.ok(html.includes('Центр привлечения заказов'));
  assert.ok(html.includes('id="orderMetricTotal"'));
  assert.ok(html.includes('id="orderMetricBudget"'));
  assert.ok(html.includes('id="orderMetricContacts"'));
  assert.ok(html.includes('id="orderMetricConverted"'));
  assert.ok(renderer.includes('orderMetricBudget:rows.filter(o=>Number(o.budget_rub)>0).length'));
});

test('client records support a structured representative contact field', () => {
  assert.match(html, /<label>Контактное лицо<input name="contact_name"/);
  assert.match(renderer, /c\.contact_name\s*\|\|\s*''/);
  assert.match(renderer, /<th>Контактное лицо<\/th>/);
  assert.match(renderer, /'contact_name','client_type'/);
  assert.match(main, /INSERT INTO clients\(name,phone,email,contact_name,client_type,notes\)/);
  assert.match(main, /UPDATE clients SET name=\?, phone=\?, email=\?, contact_name=\?/);
});

test('commercial order cards can read a public source page through a validated preload IPC action', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  const pageFetcher = fs.readFileSync(path.join(__dirname, '../src/order-page-fetch.cjs'), 'utf8');
  assert.match(renderer, /data-order-fetch=/);
  assert.match(renderer, /window\.crm\.fetchCommercialOrderSource\(orderId\)/);
  assert.match(renderer, /source_page_text/);
  assert.match(preload, /fetchCommercialOrderSource: \(id\) => ipcRenderer\.invoke\('orders:fetchSource', id\)/);
  assert.match(main, /ipcMain\.handle\('orders:fetchSource'/);
  assert.match(main, /UPDATE commercial_orders SET[\s\S]*source_page_text=/);
  assert.match(pageFetcher, /robotsAllows/);
  assert.match(pageFetcher, /validatePublicUrl/);
  assert.match(pageFetcher, /AbortSignal\.timeout/);
});

test('commercial order attachments can be parsed as public PDF documents via scoped IPC', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  const pdfFetcher = fs.readFileSync(path.join(__dirname, '../src/order-pdf-fetch.cjs'), 'utf8');
  assert.match(renderer, /data-order-pdf=/);
  assert.match(renderer, /window\.crm\.fetchCommercialOrderPdf\(\{order_id:orderId,document_id:documentId\}\)/);
  assert.match(preload, /fetchCommercialOrderPdf: \(data\) => ipcRenderer\.invoke\('orders:fetchPdf', data\)/);
  assert.match(main, /ipcMain\.handle\('orders:fetchPdf'/);
  assert.match(main, /SELECT \* FROM commercial_order_documents WHERE id=\? AND order_id=\?/);
  assert.match(pdfFetcher, /MAX_PDF_PAGES=40/);
  assert.match(pdfFetcher, /нет текстового слоя/);
});

test('commercial order spreadsheet attachments can be parsed through scoped IPC', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
  const tableFetcher = fs.readFileSync(path.join(__dirname, '../src/order-table-fetch.cjs'), 'utf8');
  assert.match(renderer, /data-order-table=/);
  assert.match(renderer, /window\.crm\.fetchCommercialOrderTable\(\{order_id:orderId,document_id:documentId\}\)/);
  assert.match(preload, /fetchCommercialOrderTable: \(data\) => ipcRenderer\.invoke\('orders:fetchTable', data\)/);
  assert.match(main, /ipcMain\.handle\('orders:fetchTable'/);
  assert.match(main, /SELECT \* FROM commercial_order_documents WHERE id=\? AND order_id=\?/);
  assert.match(tableFetcher, /MAX_ROWS=5000/);
  assert.match(tableFetcher, /MAX_TABLE_BYTES=12\*1024\*1024/);
});

test('tabular attachment parsing exposes normalized scope lines from a workbook', () => {
  assert.match(renderer, /order-document-lines/);
  assert.match(renderer, /line\.work_name/);
  assert.match(renderer, /line\.quantity/);
  assert.match(main, /line_items_json/);
  assert.match(main, /JSON\.stringify\(table\.line_items\|\|\[\]\)/);
  assert.match(renderer, /Позиции работ/);
});

test('commercial order scope lines can be reviewed and imported into the existing engineering plan', () => {
  const planUi = fs.readFileSync(path.join(__dirname, '../src/engineering-project-plan-ui.js'), 'utf8');
  assert.match(renderer, /data-order-plan=/);
  assert.match(renderer, /skol:import-order-lines/);
  assert.match(renderer, /showView\('engineering'\)/);
  assert.match(planUi, /window\.addEventListener\('skol:import-order-lines'/);
  assert.match(planUi, /parseEstimateText\(text\)/);
  assert.match(planUi, /unitsCompatible\(sourceUnit, item\.unit\)/);
  assert.match(planUi, /Цены и нормы взяты из прайса СКОЛ/);
  assert.match(html, /order-plan-handoff\.cjs/);
});

test('engineering handoff requires catalog review before replacing plan operations', () => {
  const planUi = fs.readFileSync(path.join(__dirname, '../src/engineering-project-plan-ui.js'), 'utf8');
  assert.match(html, /id="engOrderPlanReview"/);
  assert.match(planUi, /skol:import-order-lines/);
  assert.match(planUi, /data-order-lines-accept/);
  assert.match(planUi, /data-order-lines-cancel/);
  assert.match(planUi, /unitsCompatible\(source\.unit, item\.unit\)/);
  assert.match(planUi, /window\.confirm\('Сопоставлено позиций:/);
  assert.match(planUi, /Цены и нормы взяты из прайса СКОЛ/);
  assert.match(planUi, /mappedLines/);
});
test('dashboard contains only live business KPI slots, interactive rings and explicit period controls', () => {
  const start = html.indexOf('<section class="view active" id="view-dashboard">');
  const end = html.indexOf('<section class="view" id="view-leads">', start);
  assert.ok(start >= 0 && end > start, 'single home view exists');
  const dashboard = html.slice(start, end);
  for (const id of [
    'statLeads','statProjects','dashboardClientsCount','dashboardPeopleCount',
    'statReceived','dashboardExpensesAmount','statCash','dashboardCashflowChart',
    'dashboardProjectPercent','dashboardProductionPercent','dashboardTaskPercent',
    'dashboardLeadPercent','dashboardCollectionPercent','dashboardRecentProjects',
    'dashboardAttention','piHomeSummary','piHomeAlerts'
  ]) assert.ok(dashboard.includes('id="' + id + '"'), id + ' is available for live metrics');
  for (const period of ['week','month','year']) assert.ok(dashboard.includes('data-dashboard-period="' + period + '"'));
  assert.doesNotMatch(dashboard, /Демо-данные|68%|≈ 4 смены/);
  assert.ok(renderer.includes('const metricsApi = window.SKOLDashboardMetrics'));
  assert.ok(renderer.includes('metricsApi.computeDashboardMetrics'));
  assert.ok(renderer.includes('window.SKOLDashboardMetrics.getTaskBucket'));
  assert.match(renderer, /async function refreshDashboard\(\)/);
  assert.ok(renderer.includes("metrics.progress.projects.total > 0 ? metrics.progress.projects.percent : null"));
  assert.ok(renderer.includes("metrics.progress.tasks.total > 0 ? metrics.progress.tasks.percent : null"));
  assert.ok(renderer.includes("metrics.progress.leads.total > 0 ? metrics.progress.leads.percent : null"));
  assert.ok(renderer.includes("metrics.finance.totalContract > 0 ? metrics.finance.collectionPercent : null"));
});

test('navigation is grouped in a persistent bottom Dock with all active workspaces', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate HTML ids');
  assert.equal((html.match(/id="skolDock"/g) || []).length, 1);
  const dockStart = html.indexOf('id="skolDock"');
  const dockEnd = html.indexOf('</nav>', dockStart);
  const dock = html.slice(dockStart, dockEnd);
  assert.deepEqual([...dock.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]),
    ['dashboard','leads','clients','projects','production','finance','engineering','tasks','reports','prospects','browser','settings']);
  assert.equal((dock.match(/class="dock-group/g) || []).length, 4, 'workspaces are grouped by purpose');
  assert.equal((dock.match(/class="dock-divider"/g) || []).length, 3, 'groups are visually separated');
  assert.equal((dock.match(/class="dock-icon"/g) || []).length, 12, 'each destination has a dedicated icon');
  assert.equal((dock.match(/class="dock-label"/g) || []).length, 12, 'each destination has a text capsule');
  for (const view of ['dashboard','leads','clients','projects','production','finance','engineering','tasks','reports','prospects','browser','settings']) {
    assert.ok(dock.includes('data-view="' + view + '"'), view + ' remains reachable');
  }
  assert.doesNotMatch(html, /navMenuToggle|nav-primary|navGuideCard|navGuideReplay|id="view-plans"|id="view-about"/);
  assert.ok(renderer.includes("const skolDock = $('skolDock')"));
  assert.match(renderer, /skolDock\.addEventListener\('keydown'/);
  assert.match(renderer, /event\.target\.closest\('\[data-view\]'\)/);
  assert.match(layoutCss, /\.skol-dock\s*\{[\s\S]*?position:fixed/);
  assert.match(layoutCss, /\.skol-dock\s*\{[\s\S]*?backdrop-filter:blur/);
  assert.match(layoutCss, /\.skol-dock \.dock-item:hover[\s\S]*?scale\(1\.12\)/);
  assert.match(layoutCss, /\.skol-dock:has\(\.dock-item:hover\)/);
  assert.match(layoutCss, /\.dock-label\s*\{[\s\S]*?border-radius:999px/);
  assert.match(layoutCss, /@media\(prefers-reduced-motion:reduce\)/);
});
test('all five split workspaces keep a detail pane and table list in the current 1.25 interface', () => {
  for (const id of ['leadDetailPanel','clientDetailPanel','projectDetailPanel','paymentDetailPanel','expenseDetailPanel']) {
    assert.equal((html.match(new RegExp('id="' + id + '"','g')) || []).length, 1, id + ' appears once');
  }
  for (const id of ['leadsTable','clientsTable','projectsTable','paymentsTable','expensesTable']) {
    assert.ok(html.includes('id="' + id + '" class="table-wrap records-list"'), id + ' uses the same list surface');
  }
  assert.ok(renderer.includes('function selectRecord(kind, id)'));
  assert.ok(renderer.includes('function selectFinanceRecord(kind, id)'));
  assert.ok(renderer.includes("renderRecordDetailPanel('client', selected)"));
  assert.ok(renderer.includes("renderFinanceDetailPanel('expense', selectedExpense)"));
});

test('Salesforce themes load after base CSS and theme bootstrap runs before body paint', () => {
  const baseStyles = html.indexOf('href="styles.css"');
  const darkThemeStyles = html.indexOf('href="theme-salesforce.css"');
  const lightThemeStyles = html.indexOf('href="theme-salesforce-light.css"');
  const themeBoot = html.indexOf('theme-boot.js');
  assert.ok(baseStyles >= 0 && darkThemeStyles > baseStyles, 'dark theme stylesheet follows base CSS');
  assert.ok(lightThemeStyles > darkThemeStyles, 'light theme stylesheet follows dark theme stylesheet');
  assert.ok(themeBoot > lightThemeStyles && themeBoot < html.indexOf('<body>'), 'theme bootstrap follows both themes and precedes body paint');
  assert.ok(html.includes('<script src="dashboard-metrics.js"></script><script src="renderer.js"></script>'));
  const css = fs.readFileSync(path.join(__dirname, '../src/theme-salesforce-light.css'), 'utf8');
  for (const selector of ['.dashboard-kpis','.dashboard-finance-metrics','.dashboard-rings-grid','.dashboard-attention-list','.nav-more-menu']) assert.ok(css.includes(selector));
  assert.ok(css.includes('@media(max-width:620px)'));
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(css.includes('overflow-wrap:anywhere'));
  assert.ok(css.includes('min-width:0'));
});




test('Dock interaction layer exposes command search, contextual actions and persistent preferences', () => {
  assert.match(html, /id="dockPaletteDialog"/);
  assert.match(html, /id="dockSettingsDialog"/);
  assert.match(html, /data-dock-badge="lead"/);
  assert.match(html, /data-dock-badge="task"/);
  assert.match(renderer, /DOCK_PREFS_KEY/);
  assert.match(renderer, /contextmenu/);
  assert.match(renderer, /dockOpenPalette/);
  assert.match(renderer, /dockRunCommand/);
  assert.match(renderer, /dockRememberView/);
  assert.match(renderer, /data-dock-recent-index/);
  assert.match(renderer, /dockPreferences\.order/);
  assert.match(layoutCss, /--dock-pointer-x/);
  assert.match(layoutCss, /dock-context-menu/);
});

test('shared layout hardening keeps content inside cards, forms, tables and dialogs', () => {
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g)].map(match => match[1]);
  assert.equal(links.at(-2), 'ui-layout-hardening.css', 'the shared geometry layer loads after both themes');
  assert.equal(links.at(-1), 'struktura-design-system.css', 'the semantic design-system layer loads after shared geometry hardening');
  assert.ok(layoutCss.includes('.main'));
  assert.ok(layoutCss.includes('min-width: 0'));
  assert.match(layoutCss, /\.stat-card > strong[\s\S]*?white-space: normal/);
  assert.ok(layoutCss.includes('overflow-wrap: anywhere'));
  assert.match(layoutCss, /\.table-wrap,[\s\S]*?overflow-x: auto/);
  assert.match(layoutCss, /dialog\.modal,[\s\S]*?max-height: calc\(100dvh - 32px\)/);
  assert.match(layoutCss, /@media \(max-width: 1120px\)[\s\S]*?\.records-workspace[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  const withoutComments = layoutCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\.skol-dock[\s\S]*$/, '');
  const navigationAnimationRules = withoutComments
    .replace(/\.sidebar \.nav-primary\s*\{[^}]*\}/g, '')
    .replace(/\.sidebar\.nav-expanded \.nav-primary\s*\{[^}]*\}/g, '');
  assert.doesNotMatch(navigationAnimationRules, /overflow\s*:\s*hidden/, 'the layout layer must not conceal business content; only the collapsed navigation panel may clip during its animation');
});


test('macOS Dock remains fixed, accessible, responsive and respects reduced motion', () => {
  assert.match(html, /id="skolDock"[^>]*aria-label="Основная навигация СКОЛ"/);
  assert.match(html, /class="dock-icon"/);
  assert.match(html, /<svg viewBox="0 0 24 24">/);
  assert.match(renderer, /ArrowLeft.*ArrowRight.*Home.*End/);
  assert.match(layoutCss, /\.skol-dock\s*\{[\s\S]*?position:fixed/);
  assert.match(layoutCss, /@media\(max-width:760px\)/);
  assert.match(layoutCss, /@media\(max-width:420px\)/);
  assert.match(layoutCss, /@media\(prefers-reduced-motion:reduce\)/);
});
test('shared design system keeps component rhythm consistent without replacing page layouts', () => {
  assert.match(layoutCss, /--skol-radius-control:\s*12px/);
  assert.match(layoutCss, /--skol-radius-card:\s*17px/);
  assert.match(layoutCss, /--skol-radius-panel:\s*20px/);
  assert.match(layoutCss, /--skol-elevation-1:/);
  assert.match(layoutCss, /--skol-elevation-2:/);
  assert.match(layoutCss, /:where\(\s*\.panel, \.records-panel, \.settings-card/);
  assert.match(layoutCss, /\.button\.compact, \.data-table \.button/);
  assert.match(layoutCss, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(layoutCss, /\.data-table tbody tr:hover td/);
  assert.match(layoutCss, /@media \(max-width: 760px\)/);
  assert.match(layoutCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(withoutDockCss(designCssForTest(layoutCss)), /overflow\s*:\s*hidden/, 'shared design polish must not clip interactive/business content');
});

function withoutDockCss(source) {
  return source.replace(/\/\* SKOL Dock — compact, colorful macOS-inspired icon rail\.[\s\S]*$/, '');
}

function designCssForTest(source) {
  const marker = '/* SKOL 1.26 — shared visual system.';
  return source.slice(source.lastIndexOf(marker));
}


test('workspace polish gives dashboard, records, estimate, production, finance and engineering consistent responsive layouts', () => {
  const marker = '/* SKOL 1.27 — workspace-specific visual pass.';
  const workspaceCss = withoutDockCss(layoutCss.slice(layoutCss.lastIndexOf(marker)));
  assert.ok(layoutCss.includes(marker), 'workspace polish is present in the final layout layer');

  assert.match(workspaceCss, /#view-dashboard \.dashboard-hero/);
  assert.match(workspaceCss, /#view-dashboard \.dashboard-finance-metrics/);
  assert.match(workspaceCss, /#view-dashboard \.dashboard-rings-grid/);
  assert.match(workspaceCss, /\.records-workspace\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1\.12fr\) minmax\(300px, \.88fr\)/);
  assert.match(workspaceCss, /\.record-detail-panel\s*\{[\s\S]*?background: var\(--skol-surface-soft\)/);
  assert.match(workspaceCss, /#view-projects \.estimate-meta-grid/);
  assert.match(workspaceCss, /#view-projects \.estimate-duration-results/);
  assert.match(workspaceCss, /#view-production \.production-project-grid/);
  assert.match(workspaceCss, /#view-production \.production-model-note/);
  assert.match(workspaceCss, /#view-finance \.finance-grid\s*\{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workspaceCss, /#view-finance \.finance-forecast-grid/);
  assert.match(workspaceCss, /#view-engineering \.eng-layout/);
  assert.match(workspaceCss, /#view-engineering \.eng-form-grid/);

  for (const breakpoint of ['1120px','760px','520px']) {
    assert.ok(workspaceCss.includes('max-width: ' + breakpoint), 'responsive breakpoint ' + breakpoint + ' is defined');
  }
  assert.match(workspaceCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspaceCss, /overflow\s*:\s*hidden/, 'workspace polish must not clip business content or interactive controls');
});


test('secondary workspaces keep order radar, task/report tables, browser inspector and settings responsive', () => {
  const marker = '/* SKOL 1.27.1 — secondary workspaces:';
  const secondaryCss = withoutDockCss(layoutCss.slice(layoutCss.lastIndexOf(marker)));
  assert.ok(layoutCss.includes(marker), 'secondary workspace polish is in the final CSS layer');
  assert.match(secondaryCss, /#view-prospects \.crawler-panel/);
  assert.match(secondaryCss, /#view-prospects \.order-radar-metrics/);
  assert.match(secondaryCss, /#view-prospects \.radar-queue/);
  assert.match(secondaryCss, /#view-tasks \.task-stats/);
  assert.match(secondaryCss, /#view-reports \.report-stats/);
  assert.match(secondaryCss, /#view-browser \.browser-workspace/);
  assert.match(secondaryCss, /#view-browser \.browser-inspector/);
  assert.match(secondaryCss, /#view-settings \.settings-card:first-child\s*\{\s*grid-column: 1 \/ -1/);
  assert.match(secondaryCss, /@media \(max-width: 1120px\)/);
  assert.match(secondaryCss, /@media \(max-width: 760px\)/);
  assert.match(secondaryCss, /@media \(max-width: 520px\)/);
  assert.doesNotMatch(secondaryCss, /overflow\s*:\s*hidden/, 'secondary workspace polish must not clip text or controls');
});


test('Windows CI includes a real Electron viewport smoke test with isolated profile and screenshot artifacts', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const e2e = fs.readFileSync(path.join(repoRoot, 'tests', 'electron-layout-smoke.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(repoRoot, 'src', 'main.cjs'), 'utf8');
  const workflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'build-windows.yml'), 'utf8');

  assert.equal(packageJson.scripts['test:ui'], 'node tests/electron-layout-smoke.cjs');
  assert.match(e2e, /_electron/);
  assert.match(e2e, /executablePath:\\s*process\\.env\\.SKOL_UI_E2E_EXECUTABLE\\s*\\|\\|\\s*electronExecutable/);
  assert.match(e2e, /args: process\\.env\\.SKOL_UI_E2E_EXECUTABLE \\? \\[\\] : \\[root\\]/);
  assert.match(e2e, /createLicenseToken/);
  assert.match(e2e, /win\\.setContentSize/);
  assert.match(e2e, /nativeWindowViewportMatrix/);
  assert.match(e2e, /console\.log\('\[view\] '/);
  assert.match(e2e, /checkedPairs: geometry\.map/);
  assert.ok(e2e.includes("views: ['dashboard', 'projects', 'production', 'finance', 'engineering']"));
  assert.match(e2e, /1024/);
  assert.match(e2e, /1280/);
  assert.match(e2e, /1440/);
  assert.match(e2e, /1920/);
  assert.match(e2e, /page\.screenshot/);
  assert.match(e2e, /scrollWidth/);
  assert.match(e2e, /SKOL_UI_E2E_OUTPUT/);
  assert.match(main, /SKOL_UI_E2E_USER_DATA/);
  assert.match(main, /app\.setPath\('userData'/);
  assert.match(main, /license-public-key\.pem/);
  assert.match(e2e, /SKOL_UI_E2E_PUBLIC_KEY_B64/);
  assert.match(workflow, /Rebuild native modules for Electron/);
  assert.match(workflow, /electron-builder install-app-deps --platform=win32 --arch=x64/);
  assert.match(workflow, /Install Playwright for Electron UI checks/);
  assert.match(workflow, /Run Electron responsive layout checks/);
  assert.match(workflow, /SKOL-Electron-UI-Screenshots/);
  assert.match(workflow, /Install and smoke-test the packaged Windows app/);
  assert.match(workflow, /SKOL_UI_E2E_EXECUTABLE/);
  assert.match(workflow, /SKOL-Packaged-App-UI-Screenshots/);
  assert.match(workflow, /playwright@1\.64\.1/);
});

test('Dock notification inbox routes each actionable reminder to its real workflow', () => {
  assert.match(html, /id="dockNotificationsDialog"/);
  assert.match(html, /data-notification-filter="shift-report"/);
  assert.match(preload, /getNotificationInbox: \(\) => ipcRenderer\.invoke\('notifications:getInbox'\)/);
  assert.match(main, /ipcMain\.handle\('notifications:getInbox'/);
  assert.match(main, /buildReminders\(\{ tasks, projects, now: new Date\(\), settings: inboxSettings, lastSent: \{\} \}\)/);
  assert.match(renderer, /item\.kind === 'task'[\s\S]*?refreshTasks\(\)\.then/);
  assert.match(renderer, /item\.kind === 'shift-report'[\s\S]*?openProductionShift\(item\.id\)/);
  assert.match(renderer, /item\.kind === 'project'[\s\S]*?refreshProjects\(\)\.then/);
  assert.match(renderer, /showView\('tasks', \{ skipLoad: true \}\)/);
  assert.match(renderer, /showView\('projects', \{ skipLoad: true \}\)/);
  assert.match(renderer, /showView\('production', \{ skipLoad: true \}\)/);
  assert.match(renderer, /Заполнить отчёт смены/);
  assert.match(renderer, /Открыть задачу/);
  assert.match(renderer, /Открыть объект/);
});
