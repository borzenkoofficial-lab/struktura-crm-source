const { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, safeStorage, session, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');
// Keep the existing local database when the visible product name changes.
const legacyDataCandidates = ['Struktura CRM', 'struktura-crm', 'struktura-crm-source'];
const currentUserDataPath = app.getPath('userData');
const legacyDataPath = legacyDataCandidates
  .map(name => path.join(app.getPath('appData'), name))
  .find(candidate => fs.existsSync(path.join(candidate, 'struktura-crm.sqlite')));
if (legacyDataPath && path.resolve(legacyDataPath) !== path.resolve(currentUserDataPath)) {
  app.setPath('userData', legacyDataPath);
}
const { openDatabase } = require('./db.cjs');
const Database = require('better-sqlite3');
const { parseCsv, prospectDuplicateKeys, safeCsvCell } = require('./csv.cjs');
const { crawlSites } = require('./site-crawler.cjs');
const { buildQueries, searchBrave } = require('./web-search.cjs');
const { buildOrderQueries, normalizeOrderResult, deduplicateOrders } = require('./order-radar.cjs');
const { resolveBrowserInput, validateBrowserNavigation, companyNameFromPage } = require('./browser-utils.cjs');
const { normalizeTaskInput } = require('./task-utils.cjs');
const { normalizeContactEmail } = require('./contact-utils.cjs');
const { buildFinanceInsights } = require('./finance-insights.cjs');
const { normalizeProjectInput, validDate } = require('./project-utils.cjs');
const { forecastRemainingWork, buildRateModel } = require('./production-model.cjs');
const { DEFAULT_REMINDER_SETTINGS, normalizeReminderSettings, buildReminders } = require('./reminder-engine.cjs');
const { normalizeProductionPlan, normalizeShiftWorkLines } = require('./production-plan-utils.cjs');
const { buildProductionReportHtml } = require('./production-report.cjs');

let db;
let mainWindow;
let browserView;
let browserIsVisible = false;
let updateStatus = { state: 'idle', currentVersion: app.getVersion(), availableVersion: '', downloadedVersion: '', message: 'Проверка ещё не выполнялась' };
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
function publishUpdateStatus(patch) {
  updateStatus = { ...updateStatus, ...patch, currentVersion: app.getVersion() };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:status', updateStatus);
  return updateStatus;
}
autoUpdater.on('checking-for-update', () => publishUpdateStatus({ state: 'checking', message: 'Проверяем наличие обновлений…' }));
autoUpdater.on('update-available', info => publishUpdateStatus({ state: 'available', availableVersion: info.version, message: `Доступна версия ${info.version}` }));
autoUpdater.on('update-not-available', () => publishUpdateStatus({ state: 'current', availableVersion: '', message: 'Установлена последняя версия' }));
autoUpdater.on('download-progress', progress => publishUpdateStatus({ state: 'downloading', progress: Math.round(progress.percent), message: `Загрузка обновления: ${Math.round(progress.percent)}%` }));
autoUpdater.on('update-downloaded', info => publishUpdateStatus({ state: 'downloaded', downloadedVersion: info.version, availableVersion: info.version, progress: 100, message: `Версия ${info.version} готова к установке` }));
autoUpdater.on('error', error => publishUpdateStatus({ state: 'error', message: `Ошибка обновления: ${String(error.message || error).slice(0, 240)}` }));
const services = ['demolition', 'finishing', 'raised_floor'];
const sources = ['avito', 'phone', 'telegram', 'recommendation', 'website', 'other'];
function clean(value, max = 2000) { return String(value ?? '').trim().slice(0, max); }
const searchKeyPath = () => path.join(app.getPath('userData'), 'brave-search-key.enc');
function hasSearchKey() { return fs.existsSync(searchKeyPath()); }
function readSearchKey() {
  if (!hasSearchKey()) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Защищённое хранение ключа недоступно в этой системе.');
  return safeStorage.decryptString(fs.readFileSync(searchKeyPath()));
}
function amount(value, { allowZero = false } = {}) {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(Math.round(n)) || !Number.isFinite(n) || n < (allowZero ? 0 : 1)) throw new Error(allowZero ? 'Сумма должна быть неотрицательной.' : 'Сумма должна быть больше нуля.');
  return Math.round(n);
}
function browserState() {
  const wc = browserView?.webContents;
  if (!wc || wc.isDestroyed()) return { url: '', title: '', loading: false, canGoBack: false, canGoForward: false };
  return { url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() };
}
function sendBrowserState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:state', browserState());
}
function navigateBrowserInput(raw) {
  if (!browserView || browserView.webContents.isDestroyed()) throw new Error('Браузер ещё запускается. Повтори попытку.');
  const value = clean(raw, 1500);
  if (!value) throw new Error('Введи адрес сайта или поисковый запрос.');
  const target = resolveBrowserInput(value);
  browserView.setVisible(browserIsVisible);
  browserView.webContents.loadURL(target).catch(() => sendBrowserState());
  sendBrowserState();
  return { accepted: true, url: target };
}
function createBrowserView(win) {
  const browserSession = session.fromPartition('persist:struktura-browser');
  browserSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  browserView = new WebContentsView({
    webPreferences: { partition: 'persist:struktura-browser', contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false }
  });
  win.contentView.addChildView(browserView);
  browserView.setBounds({ x: -2000, y: -2000, width: 1, height: 1 });
  browserView.setVisible(false);
  const wc = browserView.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    try { const parsed = new URL(url); if (['http:', 'https:'].includes(parsed.protocol)) shell.openExternal(parsed.toString()); } catch {}
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    try { validateBrowserNavigation(url); }
    catch { event.preventDefault(); }
  });
  wc.on('will-redirect', (event, url) => {
    try { validateBrowserNavigation(url); }
    catch { event.preventDefault(); }
  });
  for (const eventName of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','page-title-updated','did-fail-load']) wc.on(eventName, () => {
    const current = wc.getURL();
    const shouldShow = browserIsVisible && /^https?:\/\//i.test(current);
    browserView.setVisible(shouldShow);
    sendBrowserState();
  });
  wc.on('render-process-gone', sendBrowserState);
  wc.loadURL('about:blank').catch(() => {});
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1020, minHeight: 680,
    title: 'GRUZLI CRM', backgroundColor: '#f5f7fa',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow = win;
  createBrowserView(win);
  win.on('resize', () => { if (browserIsVisible) sendBrowserState(); });
  win.on('closed', () => { mainWindow = null; browserView = null; browserIsVisible = false; });
  win.loadFile(path.join(__dirname, 'index.html'));
}
function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
}
function checkAndSendReminders() {
  if (!db || !Notification.isSupported()) return;
  try {
    const settings = normalizeReminderSettings(getSetting('reminder_settings', DEFAULT_REMINDER_SETTINGS));
    if (!settings.enabled) return;
    const tasks = db.prepare(`SELECT t.id,t.title,t.due_at,t.is_done,t.project_id,p.title project_title FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.is_done=0 AND t.due_at IS NOT NULL AND t.due_at<>''`).all();
    const projects = db.prepare(`SELECT p.id,p.title,p.status,p.start_date,p.end_date,p.created_at,
      (SELECT MAX(ws.shift_date) FROM work_shifts ws WHERE ws.project_id=p.id) last_shift_date
      FROM projects p WHERE p.status='active'`).all();
    const lastSent = getSetting('reminder_last_sent', {});
    const now = new Date();
    const reminders = buildReminders({ tasks, projects, now, settings, lastSent });
    for (const item of reminders) {
      const notice = new Notification({ title: `GRUZLI CRM · ${item.title}`, body: item.body, silent: false });
      notice.on('click', () => { if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
      notice.show();
      lastSent[item.key] = now.toISOString();
    }
    if (reminders.length) setSetting('reminder_last_sent', lastSent);
  } catch (error) {
    console.error('Notification reminder check failed:', error);
  }
}
let reminderInterval;
app.whenReady().then(() => {
  db = openDatabase(app.getPath('userData'));
  if (!getSetting('reminder_settings', null)) setSetting('reminder_settings', DEFAULT_REMINDER_SETTINGS);
  createWindow();
  checkAndSendReminders();
  reminderInterval = setInterval(checkAndSendReminders, 15 * 60 * 1000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { if (reminderInterval) clearInterval(reminderInterval); if (db) db.close(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('notifications:getSettings', () => normalizeReminderSettings(getSetting('reminder_settings', DEFAULT_REMINDER_SETTINGS)));
ipcMain.handle('notifications:saveSettings', (_event, input = {}) => {
  const settings = normalizeReminderSettings(input);
  if (settings.startHour >= settings.endHour) throw new Error('Время начала напоминаний должно быть раньше времени окончания.');
  setSetting('reminder_settings', settings);
  checkAndSendReminders();
  return settings;
});

ipcMain.handle('dashboard:summary', () => {
  const leads = db.prepare("SELECT COUNT(*) count FROM leads WHERE status NOT IN ('won','lost')").get().count;
  const projects = db.prepare("SELECT COUNT(*) count FROM projects WHERE status IN ('planned','active')").get().count;
  const contract = db.prepare("SELECT COALESCE(SUM(contract_rub),0) total FROM projects WHERE status != 'cancelled'").get().total;
  const received = db.prepare("SELECT COALESCE(SUM(CASE WHEN payment_type='refund' THEN -amount_rub ELSE amount_rub END),0) total FROM payments").get().total;
  const expenses = db.prepare('SELECT COALESCE(SUM(amount_rub),0) total FROM expenses WHERE is_paid=1').get().total;
  const clients = db.prepare('SELECT COUNT(*) count FROM clients').get().count;
  return { leads, projects, contract, received, expenses, clients, cash: received - expenses };
});
ipcMain.handle('clients:list', () => db.prepare('SELECT * FROM clients ORDER BY id DESC LIMIT 1000').all());
ipcMain.handle('clients:create', (_event, input = {}) => {
  const name = clean(input.name, 180);
  if (!name) throw new Error('Укажи имя клиента или название компании.');
  const result = db.prepare('INSERT INTO clients(name,phone,email,client_type,notes) VALUES (@name,@phone,@email,@client_type,@notes)').run({
    name, phone: clean(input.phone, 40), email: normalizeContactEmail(input.email),
    client_type: input.client_type === 'company' ? 'company' : 'person', notes: clean(input.notes)
  });
  return db.prepare('SELECT * FROM clients WHERE id=?').get(result.lastInsertRowid);
});
ipcMain.handle('clients:update', (_event, input = {}) => {
  const id = Number(input.id), name = clean(input.name, 180);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Некорректный номер клиента.');
  if (!name) throw new Error('Укажи имя клиента или название компании.');
  if (!db.prepare('SELECT id FROM clients WHERE id=?').get(id)) throw new Error('Клиент не найден. Обнови список и попробуй снова.');
  db.prepare('UPDATE clients SET name=?, phone=?, email=?, client_type=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name, clean(input.phone, 40), normalizeContactEmail(input.email), input.client_type === 'company' ? 'company' : 'person', clean(input.notes), id);
  return db.prepare('SELECT * FROM clients WHERE id=?').get(id);
});
ipcMain.handle('leads:list', () => db.prepare('SELECT l.*, c.name client_name FROM leads l LEFT JOIN clients c ON c.id=l.client_id ORDER BY l.id DESC LIMIT 1000').all());
ipcMain.handle('leads:create', (_event, input = {}) => {
  const title = clean(input.title, 180);
  if (!title) throw new Error('Укажи название заявки.');
  const service = services.includes(input.service) ? input.service : 'demolition';
  const source = sources.includes(input.source) ? input.source : 'phone';
  const budget = amount(input.budget_rub, { allowZero: true });
  const result = db.prepare('INSERT INTO leads(title,service,source,budget_rub,address,notes) VALUES (?,?,?,?,?,?)').run(title,service,source,budget,clean(input.address,250),clean(input.notes));
  return db.prepare('SELECT * FROM leads WHERE id=?').get(result.lastInsertRowid);
});
ipcMain.handle('leads:update', (_event, input = {}) => {
  const id = Number(input.id), title = clean(input.title, 180);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Некорректный номер заявки.');
  if (!title) throw new Error('Укажи название заявки.');
  if (!db.prepare('SELECT id FROM leads WHERE id=?').get(id)) throw new Error('Заявка не найдена. Обнови список и попробуй снова.');
  const service = services.includes(input.service) ? input.service : 'demolition';
  const source = sources.includes(input.source) ? input.source : 'phone';
  const budget = amount(input.budget_rub, { allowZero: true });
  db.prepare('UPDATE leads SET title=?, service=?, source=?, budget_rub=?, address=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(title, service, source, budget, clean(input.address,250), clean(input.notes), id);
  return db.prepare('SELECT * FROM leads WHERE id=?').get(id);
});
ipcMain.handle('leads:updateStatus', (_event, input = {}) => {
  const id = Number(input.id);
  const status = String(input.status || '');
  const allowedStatuses = ['new', 'contacted', 'measurement', 'estimate', 'negotiation', 'won', 'lost'];
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Некорректный номер заявки.');
  if (!allowedStatuses.includes(status)) throw new Error('Выбери допустимый статус заявки.');
  const existing = db.prepare('SELECT id FROM leads WHERE id=?').get(id);
  if (!existing) throw new Error('Заявка не найдена. Обнови список и попробуй снова.');
  db.prepare('UPDATE leads SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, id);
  return db.prepare('SELECT * FROM leads WHERE id=?').get(id);
});
ipcMain.handle('projects:list', () => db.prepare(`SELECT p.*, c.name client_name, l.title lead_title,
  COALESCE((SELECT SUM(CASE WHEN payment_type='refund' THEN -amount_rub ELSE amount_rub END) FROM payments WHERE project_id=p.id),0) received_rub,
  COALESCE((SELECT SUM(amount_rub) FROM expenses WHERE project_id=p.id AND is_paid=1),0) paid_expenses_rub,
  COALESCE((SELECT SUM(amount_rub) FROM expenses WHERE project_id=p.id AND is_paid=0),0) planned_expenses_rub
  FROM projects p LEFT JOIN clients c ON c.id=p.client_id LEFT JOIN leads l ON l.id=p.lead_id ORDER BY p.id DESC LIMIT 1000`).all());
ipcMain.handle('projects:create', (_event, input = {}) => {
  const project = normalizeProjectInput(input);
  const contract = amount(project.contract_rub, { allowZero: true });
  const result = db.prepare(`INSERT INTO projects(title,service,status,contract_rub,address,start_date,end_date,planned_people,complexity_factor,notes)
    VALUES (@title,@service,@status,@contract_rub,@address,@start_date,@end_date,@planned_people,@complexity_factor,@notes)`).run({ ...project, contract_rub: contract });
  return db.prepare('SELECT * FROM projects WHERE id=?').get(result.lastInsertRowid);
});
ipcMain.handle('projects:update', (_event, input = {}) => {
  const id = Number(input.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Некорректный номер объекта.');
  if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw new Error('Объект не найден. Обнови список и попробуй снова.');
  const project = normalizeProjectInput(input);
  const contract = amount(project.contract_rub, { allowZero: true });
  db.prepare(`UPDATE projects SET title=@title, service=@service, status=@status, contract_rub=@contract_rub,
    address=@address, start_date=@start_date, end_date=@end_date, planned_people=@planned_people,
    complexity_factor=@complexity_factor, notes=@notes, updated_at=CURRENT_TIMESTAMP WHERE id=@id`)
    .run({ ...project, contract_rub: contract, id });
  return db.prepare('SELECT * FROM projects WHERE id=?').get(id);
});
ipcMain.handle('projects:updateStatus', (_event, input = {}) => {
  const id = Number(input.id), status = String(input.status || '');
  const allowedStatuses = ['planned', 'active', 'completed', 'cancelled'];
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Некорректный номер объекта.');
  if (!allowedStatuses.includes(status)) throw new Error('Выбери допустимый статус объекта.');
  if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw new Error('Объект не найден. Обнови список и попробуй снова.');
  db.prepare('UPDATE projects SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, id);
  return db.prepare('SELECT * FROM projects WHERE id=?').get(id);
});
ipcMain.handle('projects:createWithPlan', (_event, input = {}) => {
  const plan = normalizeProductionPlan(input.plan || {});
  const project = normalizeProjectInput({ ...(input.project || {}), planned_people: plan.planned_people, complexity_factor: plan.complexity_factor });
  const contract = amount(project.contract_rub, { allowZero: true });
  const create = db.transaction(() => {
    const result = db.prepare(`INSERT INTO projects(title,service,status,contract_rub,address,start_date,end_date,planned_people,complexity_factor,notes)
      VALUES (@title,@service,@status,@contract_rub,@address,@start_date,@end_date,@planned_people,@complexity_factor,@notes)`).run({ ...project, contract_rub: contract });
    const projectId = Number(result.lastInsertRowid);
    const insert = db.prepare(`INSERT INTO production_plans(project_id,catalog_id,work_name,unit,planned_quantity,baseline_productivity)
      VALUES (@project_id,@catalog_id,@work_name,@unit,@planned_quantity,@baseline_productivity)`);
    for (const line of plan.lines) insert.run({ project_id: projectId, ...line });
    return db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  });
  return create();
});
ipcMain.handle('production:overview', () => {
  const projects = db.prepare("SELECT * FROM projects WHERE status='active' ORDER BY start_date, id DESC").all();
  const plansByProject = new Map();
  const planRows = db.prepare('SELECT * FROM production_plans ORDER BY id').all();
  for (const row of planRows) {
    if (!plansByProject.has(row.project_id)) plansByProject.set(row.project_id, []);
    plansByProject.get(row.project_id).push(row);
  }
  const actualRows = db.prepare(`SELECT ws.project_id, wsi.catalog_id, SUM(wsi.quantity_done) actual_quantity
    FROM work_shift_items wsi JOIN work_shifts ws ON ws.id=wsi.shift_id GROUP BY ws.project_id,wsi.catalog_id`).all();
  const actualByProject = new Map();
  for (const row of actualRows) {
    if (!actualByProject.has(row.project_id)) actualByProject.set(row.project_id, {});
    actualByProject.get(row.project_id)[row.catalog_id] = Number(row.actual_quantity || 0);
  }
  const observations = db.prepare(`SELECT wsi.catalog_id, wsi.quantity_done, wsi.workers_count, wsi.hours,
    wsi.baseline_productivity, ws.complexity_factor, ws.shift_date, ws.id shift_id
    FROM work_shift_items wsi JOIN work_shifts ws ON ws.id=wsi.shift_id ORDER BY ws.shift_date DESC, ws.id DESC`).all();
  const observationsByCatalog = {};
  for (const row of observations) (observationsByCatalog[row.catalog_id] ||= []).push(row);
  const resultProjects = projects.map(project => {
    const plan = plansByProject.get(project.id) || [];
    const forecast = forecastRemainingWork({
      planItems: plan,
      actualByCatalog: actualByProject.get(project.id) || {},
      observationsByCatalog,
      targetDifficulty: Number(project.complexity_factor || 1),
      crewSize: Number(project.planned_people || 5)
    });
    const shiftStats = db.prepare('SELECT COUNT(*) count, COALESCE(SUM(workers_count*shift_hours/8.0),0) person_shifts, MAX(shift_date) last_date FROM work_shifts WHERE project_id=?').get(project.id);
    return { ...project, planCount: plan.length, forecast, shiftCount: shiftStats.count, personShifts: Number(shiftStats.person_shifts || 0), lastShiftDate: shiftStats.last_date || null };
  });
  const historyRows = db.prepare(`SELECT ws.id, ws.project_id, p.title project_title, ws.shift_date, ws.workers_count,
    ws.shift_hours, ws.downtime_hours, ws.complexity_factor, ws.notes,
    COUNT(wsi.id) work_count, COALESCE(SUM(wsi.quantity_done),0) quantity_total,
    GROUP_CONCAT(wsi.work_name || ': ' || CAST(ROUND(wsi.quantity_done,2) AS TEXT) || ' ' || wsi.unit, ' · ') work_summary
    FROM work_shifts ws JOIN projects p ON p.id=ws.project_id
    LEFT JOIN work_shift_items wsi ON wsi.shift_id=ws.id
    GROUP BY ws.id ORDER BY ws.shift_date DESC, ws.id DESC LIMIT 50`).all();
  const getPerformance = db.prepare(`SELECT work_name,unit,quantity_done,workers_count,hours,baseline_productivity
    FROM work_shift_items WHERE shift_id=? ORDER BY id`);
  const history = historyRows.map(shift => ({ ...shift, performance: getPerformance.all(shift.id).map(item => {
    const actualRate = Number(item.quantity_done) / (Number(item.workers_count) * Number(item.hours) / 8);
    const expectedRate = Number(item.baseline_productivity) / Number(shift.complexity_factor || 1);
    const deviation = expectedRate > 0 ? (actualRate / expectedRate - 1) * 100 : 0;
    return { ...item, actualRate: Math.round(actualRate * 100) / 100, expectedRate: Math.round(expectedRate * 100) / 100, deviationPct: Math.round(deviation) };
  }) }));
  const totals = db.prepare(`SELECT COUNT(*) shifts, COALESCE(SUM(workers_count*shift_hours/8.0),0) person_shifts,
    (SELECT COUNT(*) FROM work_shift_items) work_records FROM work_shifts`).get();
  return { projects: resultProjects, history, totals: { ...totals, person_shifts: Number(totals.person_shifts || 0) }, modelItems: observations.length };
});

ipcMain.handle('production:exportReportPdf', async (_event, input = {}) => {
  const projectId = Number(input.project_id);
  const documentType = input.document_type === 'act' ? 'act' : 'report';
  const startDate = String(input.start_date || '');
  const endDate = String(input.end_date || '');
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  if (!Number.isInteger(projectId) || projectId < 1) throw new Error('Выбери объект для отчёта.');
  if (!valid(startDate) || !valid(endDate) || startDate > endDate) throw new Error('Проверь даты отчёта: начало должно быть не позже окончания.');
  const project = db.prepare(`SELECT p.*, c.name client_name FROM projects p LEFT JOIN clients c ON c.id=p.client_id WHERE p.id=?`).get(projectId);
  if (!project) throw new Error('Объект не найден.');
  const plan = db.prepare(`SELECT pp.work_name, pp.unit, pp.planned_quantity,
    COALESCE((SELECT SUM(wsi.quantity_done) FROM work_shift_items wsi JOIN work_shifts ws ON ws.id=wsi.shift_id WHERE ws.project_id=pp.project_id AND wsi.catalog_id=pp.catalog_id AND ws.shift_date<=?),0) actual_quantity
    FROM production_plans pp WHERE pp.project_id=? ORDER BY pp.id`).all(endDate, projectId).map(row => ({ ...row, remaining_quantity: Math.max(0, Number(row.planned_quantity) - Number(row.actual_quantity)) }));
  const shifts = db.prepare(`SELECT ws.*, COALESCE(GROUP_CONCAT(wsi.work_name || ': ' || ROUND(wsi.quantity_done,2) || ' ' || wsi.unit, ' · '),'') work_summary
    FROM work_shifts ws LEFT JOIN work_shift_items wsi ON wsi.shift_id=ws.id
    WHERE ws.project_id=? AND ws.shift_date BETWEEN ? AND ? GROUP BY ws.id ORDER BY ws.shift_date, ws.id`).all(projectId, startDate, endDate);
  const actualByPeriod = documentType === 'act' ? db.prepare(`SELECT wsi.work_name, wsi.unit, SUM(wsi.quantity_done) quantity_done FROM work_shift_items wsi JOIN work_shifts ws ON ws.id=wsi.shift_id WHERE ws.project_id=? AND ws.shift_date BETWEEN ? AND ? GROUP BY wsi.work_name,wsi.unit ORDER BY wsi.work_name`).all(projectId, startDate, endDate) : [];
  const payments = input.internal === true && documentType === 'report' ? db.prepare('SELECT payment_date, payment_type, amount_rub, note FROM payments WHERE project_id=? AND payment_date BETWEEN ? AND ? ORDER BY payment_date, id').all(projectId, startDate, endDate) : [];
  const expenses = input.internal === true && documentType === 'report' ? db.prepare('SELECT expense_date, description, category, amount_rub, is_paid FROM expenses WHERE project_id=? AND expense_date BETWEEN ? AND ? ORDER BY expense_date, id').all(projectId, startDate, endDate) : [];
  const html = buildProductionReportHtml({ project, startDate, endDate, documentType, internal: input.internal === true, plan, shifts, actualByPeriod, payments, expenses });
  const defaultName = `GRUZLI-${documentType === 'act' ? 'Акт-работ' : 'Отчёт'}-${project.title.replace(/[^a-zа-яё0-9_-]+/gi,'_').slice(0,50)}-${startDate}-${endDate}.pdf`;
  const { canceled, filePath } = await dialog.showSaveDialog({ title: documentType === 'act' ? 'Сохранить акт фиксации работ в PDF' : 'Сохранить производственный отчёт в PDF', defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled || !filePath) return { canceled: true };
  const pdfWindow = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try { await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); const data = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } }); fs.writeFileSync(filePath, data); return { canceled: false, filePath }; }
  finally { if (!pdfWindow.isDestroyed()) pdfWindow.destroy(); }
});

ipcMain.handle('production:rateModels', (_event, input = {}) => {
  if (!Array.isArray(input.catalog_ids) || input.catalog_ids.length > 500) throw new Error('Некорректный список работ для производственной модели.');
  const targetCrewSize = Number(input.target_crew_size ?? 5);
  if (!Number.isInteger(targetCrewSize) || targetCrewSize < 1 || targetCrewSize > 200) throw new Error('Размер расчётной бригады должен быть от 1 до 200 человек.');
  const ids = [...new Set(input.catalog_ids.map(id => clean(id, 120)).filter(Boolean))];
  if (!ids.length) return [];
  const observationsByCatalog = {};
  const observations = db.prepare(`SELECT wsi.catalog_id, wsi.quantity_done, wsi.workers_count, wsi.hours, ws.complexity_factor
    FROM work_shift_items wsi JOIN work_shifts ws ON ws.id=wsi.shift_id
    ORDER BY ws.shift_date DESC, ws.id DESC`).all();
  for (const row of observations) (observationsByCatalog[row.catalog_id] ||= []).push(row);
  return ids.map(catalogId => {
    const model = buildRateModel({ baselineProductivity: 1, observations: observationsByCatalog[catalogId] || [], targetCrewSize });
    return { catalog_id: catalogId, observations: model.observations, observedMedian: model.observedMedian, confidence: model.confidence, crewScalingApplied: model.crewScalingApplied, referenceCrewSize: model.referenceCrewSize, targetCrewSize };
  });
});

ipcMain.handle('production:getPlan', (_event, projectIdValue) => {
  const projectId = Number(projectIdValue);
  const project = db.prepare('SELECT id,title,status,planned_people,complexity_factor FROM projects WHERE id=?').get(projectId);
  if (!project) throw new Error('Объект не найден.');
  const lines = db.prepare('SELECT catalog_id,work_name,unit,planned_quantity,baseline_productivity FROM production_plans WHERE project_id=? ORDER BY id').all(projectId);
  return { project, lines };
});

ipcMain.handle('production:savePlan', (_event, input = {}) => {
  const projectId = Number(input.project_id);
  const project = db.prepare('SELECT id,status FROM projects WHERE id=?').get(projectId);
  if (!Number.isInteger(projectId) || !project || ['completed','cancelled'].includes(project.status)) throw new Error('Выбери существующий незавершённый объект.');
  const plan = normalizeProductionPlan(input);
  const save = db.transaction(() => {
    db.prepare('UPDATE projects SET planned_people=?, complexity_factor=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(plan.planned_people, plan.complexity_factor, projectId);
    db.prepare('DELETE FROM production_plans WHERE project_id=?').run(projectId);
    const insert = db.prepare(`INSERT INTO production_plans(project_id,catalog_id,work_name,unit,planned_quantity,baseline_productivity)
      VALUES (@project_id,@catalog_id,@work_name,@unit,@planned_quantity,@baseline_productivity)`);
    for (const line of plan.lines) insert.run({ project_id: projectId, ...line });
  });
  save();
  return { saved: true, lineCount: plan.lines.length };
});

ipcMain.handle('production:saveShift', (_event, input = {}) => {
  const projectId = Number(input.project_id);
  const project = db.prepare('SELECT id,status,complexity_factor FROM projects WHERE id=?').get(projectId);
  if (!Number.isInteger(projectId) || !project || project.status !== 'active') throw new Error('Отчёт за смену можно сохранить только для объекта со статусом «В работе».');
  const date = clean(input.shift_date, 10);
  if (!validDate(date) || !date) throw new Error('Укажи корректную дату смены.');
  const workers = Number(input.workers_count);
  const shiftHours = Number(input.shift_hours);
  const downtime = Number(input.downtime_hours || 0);
  const factor = Number(input.complexity_factor ?? project.complexity_factor ?? 1);
  if (!Number.isInteger(workers) || workers < 1 || workers > 200) throw new Error('Численность на смене должна быть от 1 до 200 человек.');
  if (!Number.isFinite(shiftHours) || shiftHours < 0.5 || shiftHours > 24) throw new Error('Длительность смены должна быть от 0,5 до 24 часов.');
  if (!Number.isFinite(downtime) || downtime < 0 || downtime > shiftHours) throw new Error('Простой должен быть от 0 до длительности смены.');
  if (![0.7,1,1.25,1.5,2].includes(factor)) throw new Error('Выбери допустимый коэффициент сложности.');
  const notes = clean(input.notes, 3000);
  const lines = normalizeShiftWorkLines({ lines: input.lines, workers, shiftHours, downtimeHours: downtime });
  if (!lines.length && !notes) throw new Error('Если за смену ничего не сделано, укажи причину простоя в примечании.');
  const save = db.transaction(() => {
    const result = db.prepare(`INSERT INTO work_shifts(project_id,shift_date,workers_count,shift_hours,downtime_hours,complexity_factor,notes)
      VALUES (?,?,?,?,?,?,?)`).run(projectId,date,workers,shiftHours,downtime,factor,notes);
    const insert = db.prepare(`INSERT INTO work_shift_items(shift_id,catalog_id,work_name,unit,quantity_done,workers_count,hours,baseline_productivity)
      VALUES (@shift_id,@catalog_id,@work_name,@unit,@quantity_done,@workers_count,@hours,@baseline_productivity)`);
    for (const line of lines) insert.run({ shift_id: result.lastInsertRowid, ...line });
    return Number(result.lastInsertRowid);
  });
  const id = save();
  return { saved: true, shift_id: id, itemCount: lines.length };
});

ipcMain.handle('production:getShift', (_event, shiftIdValue) => {
  const shiftId = Number(shiftIdValue);
  if (!Number.isSafeInteger(shiftId) || shiftId < 1) throw new Error('Некорректный номер смены.');
  const shift = db.prepare('SELECT * FROM work_shifts WHERE id=?').get(shiftId);
  if (!shift) throw new Error('Отчёт смены не найден.');
  const lines = db.prepare('SELECT catalog_id,work_name,unit,quantity_done,workers_count,hours,baseline_productivity FROM work_shift_items WHERE shift_id=? ORDER BY id').all(shiftId);
  return { ...shift, lines };
});
ipcMain.handle('production:updateShift', (_event, input = {}) => {
  const shiftId = Number(input.id);
  if (!Number.isSafeInteger(shiftId) || shiftId < 1 || !db.prepare('SELECT id FROM work_shifts WHERE id=?').get(shiftId)) throw new Error('Отчёт смены не найден.');
  const projectId = Number(input.project_id);
  const project = db.prepare('SELECT id,status,complexity_factor FROM projects WHERE id=?').get(projectId);
  if (!Number.isSafeInteger(projectId) || !project || project.status !== 'active') throw new Error('Выбери объект со статусом «В работе».');
  const date = clean(input.shift_date, 10);
  if (!validDate(date) || !date) throw new Error('Укажи корректную дату смены.');
  const workers = Number(input.workers_count), shiftHours = Number(input.shift_hours), downtime = Number(input.downtime_hours || 0);
  const factor = Number(input.complexity_factor ?? project.complexity_factor ?? 1);
  if (!Number.isInteger(workers) || workers < 1 || workers > 200) throw new Error('Численность на смене должна быть от 1 до 200 человек.');
  if (!Number.isFinite(shiftHours) || shiftHours < 0.5 || shiftHours > 24) throw new Error('Длительность смены должна быть от 0,5 до 24 часов.');
  if (!Number.isFinite(downtime) || downtime < 0 || downtime > shiftHours) throw new Error('Простой должен быть от 0 до длительности смены.');
  if (![0.7,1,1.25,1.5,2].includes(factor)) throw new Error('Выбери допустимый коэффициент сложности.');
  const notes = clean(input.notes, 3000);
  const lines = normalizeShiftWorkLines({ lines: input.lines, workers, shiftHours, downtimeHours: downtime });
  if (!lines.length && !notes) throw new Error('Если за смену ничего не сделано, укажи причину простоя в примечании.');
  const update = db.transaction(() => {
    db.prepare('UPDATE work_shifts SET project_id=?,shift_date=?,workers_count=?,shift_hours=?,downtime_hours=?,complexity_factor=?,notes=? WHERE id=?')
      .run(projectId,date,workers,shiftHours,downtime,factor,notes,shiftId);
    db.prepare('DELETE FROM work_shift_items WHERE shift_id=?').run(shiftId);
    const insert = db.prepare('INSERT INTO work_shift_items(shift_id,catalog_id,work_name,unit,quantity_done,workers_count,hours,baseline_productivity) VALUES (@shift_id,@catalog_id,@work_name,@unit,@quantity_done,@workers_count,@hours,@baseline_productivity)');
    for (const line of lines) insert.run({ shift_id: shiftId, ...line });
  });
  update();
  return { saved: true, shift_id: shiftId, itemCount: lines.length };
});
ipcMain.handle('production:deleteShift', (_event, shiftIdValue) => {
  const shiftId = Number(shiftIdValue);
  if (!Number.isInteger(shiftId) || shiftId < 1) throw new Error('Некорректный номер смены.');
  const result = db.prepare('DELETE FROM work_shifts WHERE id=?').run(shiftId);
  if (!result.changes) throw new Error('Отчёт смены уже удалён или не найден.');
  return { deleted: true, shift_id: shiftId };
});

ipcMain.handle('payments:list', () => db.prepare(`SELECT py.*, p.title project_title FROM payments py JOIN projects p ON p.id=py.project_id ORDER BY py.payment_date DESC, py.id DESC LIMIT 2000`).all());
ipcMain.handle('payments:create', (_event, input = {}) => {
  const projectId = Number(input.project_id);
  if (!Number.isInteger(projectId) || !db.prepare('SELECT id FROM projects WHERE id=?').get(projectId)) throw new Error('Выбери существующий объект.');
  const amountRub = amount(input.amount_rub);
  const date = clean(input.payment_date,10);
  if (!validDate(date) || !date) throw new Error('Укажи корректную календарную дату платежа.');
  const type = input.payment_type === 'refund' ? 'refund' : 'incoming';
  const method = ['cash','bank','transfer','other'].includes(input.method) ? input.method : 'other';
  const result = db.prepare('INSERT INTO payments(project_id,amount_rub,payment_date,payment_type,method,note) VALUES (?,?,?,?,?,?)').run(projectId,amountRub,date,type,method,clean(input.note,500));
  return db.prepare('SELECT * FROM payments WHERE id=?').get(result.lastInsertRowid);
});
ipcMain.handle('payments:update', (_event, input = {}) => {
  const id = Number(input.id), projectId = Number(input.project_id);
  if (!Number.isSafeInteger(id) || id < 1 || !db.prepare('SELECT id FROM payments WHERE id=?').get(id)) throw new Error('Платёж не найден. Обнови список и попробуй снова.');
  if (!Number.isSafeInteger(projectId) || projectId < 1 || !db.prepare('SELECT id FROM projects WHERE id=?').get(projectId)) throw new Error('Выбери существующий объект.');
  const amountRub = amount(input.amount_rub), date = clean(input.payment_date,10);
  if (!validDate(date) || !date) throw new Error('Укажи корректную календарную дату платежа.');
  const type = input.payment_type === 'refund' ? 'refund' : 'incoming';
  const method = ['cash','bank','transfer','other'].includes(input.method) ? input.method : 'other';
  db.prepare('UPDATE payments SET project_id=?, amount_rub=?, payment_date=?, payment_type=?, method=?, note=? WHERE id=?')
    .run(projectId, amountRub, date, type, method, clean(input.note,500), id);
  return db.prepare('SELECT * FROM payments WHERE id=?').get(id);
});
ipcMain.handle('expenses:list', () => db.prepare(`SELECT e.*, p.title project_title FROM expenses e LEFT JOIN projects p ON p.id=e.project_id ORDER BY e.expense_date DESC, e.id DESC LIMIT 2000`).all());
ipcMain.handle('finance:insights', () => {
  const projects = db.prepare(`SELECT p.*, COALESCE((SELECT SUM(CASE WHEN payment_type='refund' THEN -amount_rub ELSE amount_rub END) FROM payments WHERE project_id=p.id),0) received_rub, COALESCE((SELECT SUM(amount_rub) FROM expenses WHERE project_id=p.id AND is_paid=1),0) paid_expenses_rub, COALESCE((SELECT SUM(amount_rub) FROM expenses WHERE project_id=p.id AND is_paid=0),0) planned_expenses_rub FROM projects p WHERE p.status != 'cancelled'`).all();
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY expense_date ASC').all();
  const received = db.prepare("SELECT COALESCE(SUM(CASE WHEN payment_type='refund' THEN -amount_rub ELSE amount_rub END),0) total FROM payments").get().total;
  const paid = db.prepare('SELECT COALESCE(SUM(amount_rub),0) total FROM expenses WHERE is_paid=1').get().total;
  const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return buildFinanceInsights({ today, cash: received - paid, projects, expenses });
});
ipcMain.handle('expenses:create', (_event, input = {}) => {
  const description = clean(input.description,180);
  if (!description) throw new Error('Укажи назначение расхода.');
  const amountRub = amount(input.amount_rub);
  const date = clean(input.expense_date,10);
  if (!validDate(date) || !date) throw new Error('Укажи корректную календарную дату расхода.');
  let projectId = input.project_id ? Number(input.project_id) : null;
  if (projectId !== null && (!Number.isInteger(projectId) || !db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))) throw new Error('Выбранный объект не найден.');
  const category = ['materials','workers','transport','rent','tools','tax','other'].includes(input.category) ? input.category : 'other';
  const isPaid = input.is_paid === '0' || input.is_paid === false ? 0 : 1;
  const result = db.prepare('INSERT INTO expenses(project_id,amount_rub,expense_date,category,description,is_paid) VALUES (?,?,?,?,?,?)').run(projectId,amountRub,date,category,description,isPaid);
  return db.prepare('SELECT * FROM expenses WHERE id=?').get(result.lastInsertRowid);
});
ipcMain.handle('expenses:update', (_event, input = {}) => {
  const id = Number(input.id);
  if (!Number.isSafeInteger(id) || id < 1 || !db.prepare('SELECT id FROM expenses WHERE id=?').get(id)) throw new Error('Расход не найден. Обнови список и попробуй снова.');
  const description = clean(input.description,180);
  if (!description) throw new Error('Укажи назначение расхода.');
  const amountRub = amount(input.amount_rub), date = clean(input.expense_date,10);
  if (!validDate(date) || !date) throw new Error('Укажи корректную календарную дату расхода.');
  const projectId = input.project_id ? Number(input.project_id) : null;
  if (projectId !== null && (!Number.isSafeInteger(projectId) || projectId < 1 || !db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))) throw new Error('Выбранный объект не найден.');
  const category = ['materials','workers','transport','rent','tools','tax','other'].includes(input.category) ? input.category : 'other';
  const isPaid = input.is_paid === '0' || input.is_paid === false ? 0 : 1;
  db.prepare('UPDATE expenses SET project_id=?, amount_rub=?, expense_date=?, category=?, description=?, is_paid=? WHERE id=?')
    .run(projectId, amountRub, date, category, description, isPaid, id);
  return db.prepare('SELECT * FROM expenses WHERE id=?').get(id);
});
ipcMain.handle('tasks:list', (_event, input = {}) => {
  const filter = ['open','done','all'].includes(input.filter) ? input.filter : 'open';
  const where = filter === 'open' ? 'WHERE t.is_done=0' : filter === 'done' ? 'WHERE t.is_done=1' : '';
  return db.prepare(`SELECT t.*, l.title lead_title, p.title project_title,
    CASE WHEN t.is_done=1 THEN 'done' WHEN t.due_at IS NULL OR t.due_at='' THEN 'unscheduled' WHEN date(t.due_at) < date('now','localtime') THEN 'overdue' WHEN date(t.due_at)=date('now','localtime') THEN 'today' ELSE 'upcoming' END urgency
    FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id LEFT JOIN projects p ON p.id=t.project_id ${where}
    ORDER BY CASE WHEN t.is_done=1 THEN 3 WHEN t.due_at IS NULL OR t.due_at='' THEN 2 WHEN date(t.due_at)<date('now','localtime') THEN 0 ELSE 1 END, t.due_at ASC, t.id DESC LIMIT 2000`).all();
});
ipcMain.handle('tasks:create', (_event, input = {}) => {
  const normalized = normalizeTaskInput(input);
  const title = normalized.title;
  let leadId = input.lead_id ? Number(input.lead_id) : null;
  let projectId = input.project_id ? Number(input.project_id) : null;
  if (leadId !== null && (!Number.isInteger(leadId) || !db.prepare('SELECT id FROM leads WHERE id=?').get(leadId))) throw new Error('Выбранная заявка не найдена.');
  if (projectId !== null && (!Number.isInteger(projectId) || !db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))) throw new Error('Выбранный объект не найден.');
  const dueAt = normalized.dueAt;
  const result = db.prepare('INSERT INTO tasks(lead_id,project_id,title,due_at) VALUES (?,?,?,?)').run(leadId, projectId, title, dueAt);
  return db.prepare('SELECT * FROM tasks WHERE id=?').get(result.lastInsertRowid);
});
ipcMain.handle('tasks:update', (_event, input = {}) => {
  const id = Number(input.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Некорректная задача.');
  if (!db.prepare('SELECT id FROM tasks WHERE id=?').get(id)) throw new Error('Задача не найдена. Обнови список и попробуй снова.');
  const normalized = normalizeTaskInput(input);
  const leadId = input.lead_id ? Number(input.lead_id) : null;
  const projectId = input.project_id ? Number(input.project_id) : null;
  if (leadId !== null && (!Number.isSafeInteger(leadId) || leadId < 1 || !db.prepare('SELECT id FROM leads WHERE id=?').get(leadId))) throw new Error('Выбранная заявка не найдена.');
  if (projectId !== null && (!Number.isSafeInteger(projectId) || projectId < 1 || !db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))) throw new Error('Выбранный объект не найден.');
  db.prepare('UPDATE tasks SET title=?, due_at=?, lead_id=?, project_id=? WHERE id=?').run(normalized.title, normalized.dueAt, leadId, projectId, id);
  return db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
});
ipcMain.handle('tasks:complete', (_event, input = {}) => {
  const id = Number(input.id);
  if (!Number.isInteger(id) || id < 1) throw new Error('Некорректная задача.');
  const current = db.prepare('SELECT id,is_done FROM tasks WHERE id=?').get(id);
  if (!current) throw new Error('Задача не найдена.');
  const isDone = input.is_done === true || input.is_done === 1 ? 1 : 0;
  db.prepare('UPDATE tasks SET is_done=? WHERE id=?').run(isDone, id);
  return db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
});
ipcMain.handle('prospects:list', () => db.prepare('SELECT * FROM prospects ORDER BY id DESC LIMIT 5000').all());
ipcMain.handle('search:status', () => ({ provider: 'Brave Search API', configured: hasSearchKey() }));
ipcMain.handle('search:saveKey', (_event, input = {}) => {
  const key = clean(input.apiKey, 500);
  if (!key) throw new Error('Вставь API-ключ Brave Search. Пустое поле не изменяет сохранённый ключ.');
  if (key.length < 12 || /\s/.test(key)) throw new Error('Похоже, API-ключ введён некорректно.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Система не предоставляет защищённое хранение ключа. На этой машине ключ не сохранён.');
  fs.mkdirSync(path.dirname(searchKeyPath()), { recursive: true });
  fs.writeFileSync(searchKeyPath(), safeStorage.encryptString(key), { mode: 0o600 });
  return { configured: true };
});
ipcMain.handle('search:run', async (_event, input = {}) => {
  const apiKey = readSearchKey();
  if (!apiKey) throw new Error('Сначала сохрани API-ключ Brave Search.');
  const service = services.includes(input.service) ? input.service : 'demolition';
  const region = clean(input.region, 120) || 'Москва и Московская область';
  const queries = buildQueries(service, region);
  const allResults = [], errors = [];
  for (const query of queries) {
    try { allResults.push(...(await searchBrave(query, apiKey, { count: 10 } )).map(item => ({ ...item, query }))); }
    catch (error) { errors.push({ query, error: clean(error.message, 300) }); }
  }
  if (!allResults.length && errors.length) throw new Error(`Не удалось получить результаты. ${errors.map(e => e.error).join(' | ')}`);
  const insert = db.prepare(`INSERT INTO prospects(company_name,category,service,region,phone,email,website,source_url,source_name,notes,status) VALUES (@company_name,@category,@service,@region,'','',@website,@source_url,'Brave Search API',@notes,'new')`);
  const duplicateKeys = new Set();
  for (const row of db.prepare('SELECT company_name,region,phone,email,website,source_url FROM prospects').all()) for (const key of prospectDuplicateKeys(row)) duplicateKeys.add(key);
  let imported = 0, skipped = 0;
  const tx = db.transaction(items => {
    for (const item of items) {
      const row = { company_name: item.company_name, category: 'Компания из поисковой выдачи — проверить', service, region, website: item.website, source_url: item.source_url };
      const keys = prospectDuplicateKeys(row);
      if (keys.some(key => duplicateKeys.has(key))) { skipped++; continue; }
      const notes = [`Поисковый запрос: ${item.query}`, item.snippet ? `Фрагмент выдачи: ${item.snippet}` : '', 'Контакты и соответствие услуге не проверены. Проверь сайт перед обращением.'].filter(Boolean).join('\n').slice(0, 2000);
      insert.run({ ...row, notes });
      for (const key of keys) duplicateKeys.add(key);
      imported++;
    }
    db.prepare(`INSERT INTO import_jobs(source_name,file_name,imported_count,skipped_count,details) VALUES (?,?,?,?,?)`).run('Brave Search API','web-search',imported,skipped,`Получено результатов: ${items.length}; поисковых запросов: ${queries.length}; ошибок запросов: ${errors.length}.`);
  });
  tx(allResults);
  return { queries, received: allResults.length, imported, skipped, errors };
});
ipcMain.handle('orders:list', (_event,input={})=>{
 const status=['new','opened','relevant','rejected'].includes(input.status)?input.status:'';
 const service=services.includes(input.service)?input.service:'';
 const terms=clean(input.search,180).toLowerCase();const where=[],params=[];
 if(status){where.push('status=?');params.push(status)}if(service){where.push('service=?');params.push(service)}
 if(terms){where.push('(LOWER(title) LIKE ? OR LOWER(snippet) LIKE ? OR LOWER(source_name) LIKE ?)');params.push('%'+terms+'%','%'+terms+'%','%'+terms+'%')}
 return db.prepare(`SELECT * FROM commercial_orders ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'opened' THEN 1 WHEN 'relevant' THEN 2 ELSE 3 END,signal_score DESC,last_seen_at DESC LIMIT 500`).all(...params).map(r=>({...r,signal_labels:String(r.signal_labels||'').split('|').filter(Boolean)}));
});
ipcMain.handle('orders:search',async(_event,input={})=>{
 const apiKey=readSearchKey();if(!apiKey)throw new Error('Для автоматического поиска заказов нужен сохранённый API-ключ Brave Search. Без ключа можно пользоваться ручным поиском и добавлять ссылки.');
 const service=services.includes(input.service)?input.service:'demolition';const region=clean(input.region,120)||'Москва и Московская область';const queries=buildOrderQueries(service,region);const found=[],errors=[];
 for(const query of queries){try{const results=await searchBrave(query,apiKey,{count:10});found.push(...results.map(x=>normalizeOrderResult({title:x.company_name,url:x.source_url,description:x.snippet},query,service,region)).filter(Boolean))}catch(e){errors.push({query,error:clean(e.message,240)})}}
 const unique=deduplicateOrders(found);
 const upsert=db.prepare(`INSERT INTO commercial_orders(title,source_url,source_name,snippet,search_query,service,region,signal_score,signal_labels,relevance,status) VALUES (@title,@source_url,@source_name,@snippet,@search_query,@service,@region,@signal_score,@signal_labels,@relevance,'new') ON CONFLICT(source_url) DO UPDATE SET title=excluded.title,source_name=excluded.source_name,snippet=excluded.snippet,search_query=excluded.search_query,service=excluded.service,region=excluded.region,signal_score=excluded.signal_score,signal_labels=excluded.signal_labels,relevance=excluded.relevance,last_seen_at=CURRENT_TIMESTAMP WHERE commercial_orders.status NOT IN ('relevant','rejected')`);
 let added=0,refreshed=0;const tx=db.transaction(items=>{for(const item of items){const prior=db.prepare('SELECT id FROM commercial_orders WHERE source_url=?').get(item.source_url);upsert.run({...item,signal_labels:item.signal_labels.join('|')});if(prior)refreshed++;else added++}db.prepare('INSERT INTO import_jobs(source_name,file_name,imported_count,skipped_count,error_count,details) VALUES (?,?,?,?,?,?)').run('Brave Search API','commercial-order-radar',added,refreshed,errors.length,`Получено: ${found.length}; уникальных ссылок: ${unique.length}; запросов: ${queries.length}; ошибок: ${errors.length}`)});
 tx(unique);if(!unique.length&&errors.length===queries.length)throw new Error('Не удалось найти заказы. '+errors.map(x=>x.error).join(' | '));
 return {queries,received:found.length,unique:unique.length,added,refreshed,errors};
});
ipcMain.handle('orders:updateStatus',(_event,input={})=>{
 const id=Number(input.id),status=['new','opened','relevant','rejected'].includes(input.status)?input.status:'';
 if(!Number.isSafeInteger(id)||id<1||!status)throw new Error('Некорректный заказ или статус.');
 const r=db.prepare('UPDATE commercial_orders SET status=? WHERE id=?').run(status,id);if(!r.changes)throw new Error('Заказ не найден.');
 return db.prepare('SELECT * FROM commercial_orders WHERE id=?').get(id);
});
ipcMain.handle('prospects:crawlWebsites', async (_event, input = {}) => {
  const rawUrls = String(input.urls || '').split(/[\r\n,;]+/).map(x => x.trim()).filter(Boolean);
  if (!rawUrls.length) throw new Error('Добавь хотя бы один публичный сайт компании.');
  if (rawUrls.length > 8) throw new Error('За один запуск можно проверить не более 8 сайтов.');
  const service = services.includes(input.service) ? input.service : 'demolition';
  const region = clean(input.region, 120) || 'Москва и Московская область';
  const result = await crawlSites(rawUrls, { maxPages: input.maxPages, service, region });
  const insert = db.prepare(`INSERT INTO prospects(company_name,category,service,region,phone,email,website,source_url,source_name,notes,status) VALUES (@company_name,@category,@service,@region,@phone,@email,@website,@source_url,@source_name,@notes,'new')`);
  let imported = 0, skipped = 0;
  const duplicateKeys = new Set();
  for (const existing of db.prepare('SELECT company_name,region,phone,email,website,source_url FROM prospects').all()) for (const key of prospectDuplicateKeys(existing)) duplicateKeys.add(key);
  const tx = db.transaction(rows => {
    for (const prospect of rows) {
      const row = { company_name: clean(prospect.company_name,180), category: clean(prospect.category,120), service, region, phone: clean(prospect.phone,60), email: clean(prospect.email,180), website: clean(prospect.website,250), source_url: clean(prospect.source_url,500), source_name: 'Веб-парсер', notes: clean(prospect.notes,2000) };
      if (!row.company_name) { skipped++; continue; }
      const keys = prospectDuplicateKeys(row);
      if (keys.some(key => duplicateKeys.has(key))) { skipped++; continue; }
      insert.run(row); for (const key of keys) duplicateKeys.add(key); imported++;
    }
    db.prepare('INSERT INTO import_jobs(source_name,file_name,imported_count,skipped_count,error_count,details) VALUES (?,?,?,?,?,?)').run('Веб-парсер', rawUrls.join(', ').slice(0,240), imported, skipped, result.errors.length, `Проверено страниц: ${result.pagesChecked}; ошибок: ${result.errors.length}; сайты: ${rawUrls.join(', ').slice(0,400)}`);
  });
  tx(result.prospects);
  return { imported, skipped, pagesChecked: result.pagesChecked, errors: result.errors.slice(0,10), discovered: result.prospects.length };
});
ipcMain.handle('prospects:create', (_event, input = {}) => {
  const companyName = clean(input.company_name, 180);
  if (!companyName) throw new Error('Укажи название компании.');
  const service = services.includes(input.service) ? input.service : 'demolition';
  const sourceUrl = clean(input.source_url, 500);
  const row = { company_name: companyName, category: clean(input.category, 120), region: clean(input.region, 120), phone: clean(input.phone, 60), email: normalizeContactEmail(input.email), website: clean(input.website, 250), source_url: sourceUrl };
  const keys = prospectDuplicateKeys(row);
  const existing = db.prepare('SELECT company_name,region,phone,email,website,source_url FROM prospects').all();
  if (existing.some(item => prospectDuplicateKeys(item).some(key => keys.includes(key)))) throw new Error('Похожая компания уже есть в базе. Проверь поиск перед повторным добавлением.');
  const status = ['new','reviewed','contacted','converted','rejected'].includes(input.status) ? input.status : 'new';
  const result = db.prepare(`INSERT INTO prospects(company_name,category,service,region,phone,email,website,source_url,source_name,notes,status)
    VALUES (@company_name,@category,@service,@region,@phone,@email,@website,@source_url,@source_name,@notes,@status)`).run({
      ...row, service, status, source_name: clean(input.source_name, 120), notes: clean(input.notes)
    });
  return db.prepare('SELECT * FROM prospects WHERE id=?').get(result.lastInsertRowid);
});
ipcMain.handle('prospects:update', (_event, input = {}) => {
  const id = Number(input.id);
  if (!Number.isInteger(id) || !db.prepare('SELECT id FROM prospects WHERE id=?').get(id)) throw new Error('Потенциальный клиент не найден.');
  const companyName = clean(input.company_name, 180);
  if (!companyName) throw new Error('Укажи название компании.');
  const service = services.includes(input.service) ? input.service : 'demolition';
  const status = ['new','reviewed','contacted','converted','rejected'].includes(input.status) ? input.status : 'new';
  const sourceUrl = clean(input.source_url, 500);
  const row = { company_name: companyName, category: clean(input.category,120), region: clean(input.region,120), phone: clean(input.phone,60), email: normalizeContactEmail(input.email), website: clean(input.website,250), source_url: sourceUrl };
  const keys = prospectDuplicateKeys(row);
  const existing = db.prepare('SELECT id,company_name,region,phone,email,website,source_url FROM prospects WHERE id<>?').all(id);
  if (existing.some(item => prospectDuplicateKeys(item).some(key => keys.includes(key)))) throw new Error('Такая компания или контакт уже есть в базе. Изменения не сохранены.');
  db.prepare(`UPDATE prospects SET company_name=@company_name,category=@category,service=@service,region=@region,phone=@phone,email=@email,
    website=@website,source_url=@source_url,source_name=@source_name,notes=@notes,status=@status WHERE id=@id`).run({
      ...row, id, service, status, source_name: clean(input.source_name,120), notes: clean(input.notes)
    });
  return db.prepare('SELECT * FROM prospects WHERE id=?').get(id);
});
ipcMain.handle('prospects:convertLead', (_event, prospectId) => {
  const id = Number(prospectId);
  const prospect = db.prepare('SELECT * FROM prospects WHERE id=?').get(id);
  if (!prospect) throw new Error('Потенциальный клиент не найден.');
  if (prospect.status === 'converted') throw new Error('Эта компания уже отмечена как превращённая в заявку.');
  const sourceText = `${prospect.source_name} ${prospect.source_url}`.toLowerCase();
  const serviceLabel = { demolition: 'Демонтаж', finishing: 'Отделочные работы', raised_floor: 'Фальшполы' }[prospect.service] || 'Демонтаж';
  const source = sourceText.includes('avito') || sourceText.includes('авито') ? 'avito'
    : sourceText.includes('telegram') || sourceText.includes('телеграм') ? 'telegram'
    : sourceText.includes('site') || sourceText.includes('сайт') || prospect.website ? 'website' : 'other';
  const create = db.transaction(() => {
    let client = db.prepare(`SELECT id FROM clients WHERE lower(name)=lower(?) OR (? <> '' AND phone=?) ORDER BY id LIMIT 1`).get(prospect.company_name, prospect.phone || '', prospect.phone || '');
    if (!client) {
      const clientResult = db.prepare(`INSERT INTO clients(name,phone,email,client_type,notes) VALUES (?,?,?,'company',?)`).run(
        prospect.company_name, prospect.phone || '', prospect.email || '', [prospect.website ? `Сайт: ${prospect.website}` : '', prospect.source_url ? `Источник: ${prospect.source_url}` : '', prospect.notes || ''].filter(Boolean).join('\n').slice(0,2000)
      );
      client = { id: clientResult.lastInsertRowid };
    }
    const result = db.prepare(`INSERT INTO leads(client_id,title,service,source,status,address,notes)
      VALUES (@client_id,@title,@service,@source,'new','',@notes)`).run({
        client_id: client.id, title: `${serviceLabel} — ${prospect.company_name}`.slice(0,180), service: prospect.service || 'demolition', source,
        notes: [`Компания: ${prospect.company_name}`, prospect.phone ? `Телефон: ${prospect.phone}` : '', prospect.email ? `Email: ${prospect.email}` : '', prospect.website ? `Сайт: ${prospect.website}` : '', prospect.source_url ? `Источник: ${prospect.source_url}` : '', prospect.notes].filter(Boolean).join('\n').slice(0,2000)
      });
    db.prepare("UPDATE prospects SET status='converted' WHERE id=?").run(id);
    return result.lastInsertRowid;
  });
  const leadId = create();
  return { leadId, lead: db.prepare('SELECT * FROM leads WHERE id=?').get(leadId) };
});
ipcMain.handle('prospects:importCsv', async () => {
  const picked = await dialog.showOpenDialog({ title: 'Выбрать CSV с потенциальными клиентами', properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv','txt'] }] });
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
  const filePath = picked.filePaths[0];
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('В файле нет строк для импорта. Нужна первая строка с заголовками и данные ниже.');
  const insert = db.prepare(`INSERT INTO prospects(company_name,category,service,region,phone,email,website,source_url,source_name,notes,status)
    VALUES (@company_name,@category,@service,@region,@phone,@email,@website,@source_url,@source_name,@notes,@status)`);
  let imported = 0, skipped = 0;
  const duplicateKeys = new Set();
  for (const existing of db.prepare('SELECT company_name,region,phone,email,website,source_url FROM prospects').all()) {
    for (const key of prospectDuplicateKeys(existing)) duplicateKeys.add(key);
  }
  const tx = db.transaction(items => {
    for (const item of items) {
      const row = {
        company_name: clean(item.company_name,180), category: clean(item.category,120),
        service: services.includes(item.service) ? item.service : /отдел|finishing/i.test(item.service) ? 'finishing' : /фальш|raised/i.test(item.service) ? 'raised_floor' : 'demolition',
        region: clean(item.region,120) || 'Москва и Московская область', phone: clean(item.phone,60), email: normalizeContactEmail(item.email),
        website: clean(item.website,250), source_url: clean(item.source_url,500),
        source_name: clean(item.source_name || path.basename(filePath),120), notes: clean(item.notes),
        status: ['new','reviewed','contacted','converted','rejected'].includes(item.status) ? item.status : 'new'
      };
      const keys = prospectDuplicateKeys(row);
      if (keys.some(key => duplicateKeys.has(key))) { skipped++; continue; }
      insert.run(row);
      for (const key of keys) duplicateKeys.add(key);
      imported++;
    }
    db.prepare('INSERT INTO import_jobs(source_name,file_name,imported_count,skipped_count,details) VALUES (?,?,?,?,?)').run('CSV',path.basename(filePath),imported,skipped,`Всего строк: ${items.length}; дубликаты проверены по ссылке, телефону, email, сайту и названию компании с регионом.`);
  });
  tx(rows);
  return { canceled: false, imported, skipped, total: rows.length };
});
ipcMain.handle('data:exportCsv', async (_event, kind) => {
  const allowed = {
    clients: ['clients', 'SELECT name,phone,email,client_type,notes,created_at FROM clients ORDER BY id', 'clients'],
    leads: ['leads', 'SELECT title,service,source,status,budget_rub,address,notes,created_at FROM leads ORDER BY id', 'leads'],
    prospects: ['prospects', 'SELECT company_name,category,service,region,phone,email,website,source_url,source_name,notes,status FROM prospects ORDER BY id', 'prospects']
  };
  if (!allowed[kind]) throw new Error('Неизвестный тип экспорта.');
  const [label, sql, file] = allowed[kind];
  const { canceled, filePath } = await dialog.showSaveDialog({ title: `GRUZLI CRM · Экспорт: ${label}`, defaultPath: `gruzli-${file}-${new Date().toISOString().slice(0,10)}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (canceled || !filePath) return { canceled: true };
  const rows = db.prepare(sql).all();
  const columns = rows.length ? Object.keys(rows[0]) : sql.match(/SELECT (.+?) FROM/)[1].split(',').map(s=>s.trim());
  const quote = value => `"${safeCsvCell(value).replace(/"/g,'""')}"`;
  fs.writeFileSync(filePath, '\uFEFF' + [columns.map(quote).join(';'), ...rows.map(row => columns.map(col => quote(row[col])).join(';'))].join('\r\n'), 'utf8');
  return { canceled: false, filePath, count: rows.length };
});
ipcMain.handle('backup:create', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Сохранить резервную копию', defaultPath: `GRUZLI-CRM-backup-${new Date().toISOString().slice(0,10)}.sqlite`, filters: [{ name: 'SQLite database', extensions: ['sqlite','db'] }] });
  if (canceled || !filePath) return { canceled: true };
  db.pragma('wal_checkpoint(FULL)');
  await db.backup(filePath);
  return { canceled: false, filePath };
});

// Restore only validated SQLite backups. Before replacement, preserve the current database
// as an automatic rollback copy and reopen the live connection after the file swap.
ipcMain.handle('backup:restore', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Выберите резервную копию GRUZLI CRM',
    properties: ['openFile'],
    filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }]
  });
  if (canceled || !filePaths?.[0]) return { canceled: true };
  const sourcePath = path.resolve(filePaths[0]);
  const livePath = path.join(app.getPath('userData'), 'struktura-crm.sqlite');
  if (sourcePath === path.resolve(livePath)) throw new Error('Нельзя восстановить базу из файла, который CRM использует прямо сейчас. Выберите отдельную резервную копию.');

  let candidate;
  try {
    candidate = new Database(sourcePath, { readonly: true, fileMustExist: true });
    const integrity = candidate.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`Проверка целостности копии не пройдена: ${integrity}`);
    const tables = new Set(candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    const required = ['clients', 'leads', 'projects', 'payments', 'expenses', 'settings'];
    const missing = required.filter(name => !tables.has(name));
    if (missing.length) throw new Error(`Это не резервная копия GRUZLI CRM: отсутствуют таблицы ${missing.join(', ')}.`);
    candidate.close(); candidate = null;
  } catch (error) {
    if (candidate) { try { candidate.close(); } catch {} }
    throw new Error(`Копия не прошла проверку. Действующая база не изменена. ${error.message}`);
  }

  const answer = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['Отмена', 'Восстановить'], defaultId: 0, cancelId: 0,
    title: 'Подтверждение восстановления',
    message: 'Текущие данные будут заменены данными выбранной копии.',
    detail: 'Перед заменой CRM автоматически сохранит текущую базу в отдельный файл. После восстановления окно программы перезагрузится.'
  });
  if (answer.response !== 1) return { canceled: true };

  const userDataPath = app.getPath('userData');
  const safetyPath = path.join(userDataPath, `GRUZLI-CRM-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  const walPath = `${livePath}-wal`, shmPath = `${livePath}-shm`;
  db.pragma('wal_checkpoint(FULL)');
  await db.backup(safetyPath);
  db.close();
  try {
    for (const sidecar of [walPath, shmPath]) if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
    fs.copyFileSync(sourcePath, livePath);
    db = openDatabase(userDataPath);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
    return { canceled: false, safetyPath };
  } catch (error) {
    try { if (db && db.open) db.close(); } catch {}
    try {
      fs.copyFileSync(safetyPath, livePath);
      db = openDatabase(userDataPath);
    } catch (rollbackError) {
      throw new Error(`Восстановление не завершено: ${error.message}. Автоматический откат также не удался: ${rollbackError.message}. Сохранённая копия: ${safetyPath}`);
    }
    throw new Error(`Восстановление не удалось; прежняя база возвращена. ${error.message}`);
  }
});
ipcMain.handle('browser:state', () => browserState());
ipcMain.handle('browser:visibility', (_event, input = {}) => {
  browserIsVisible = Boolean(input.visible);
  if (!browserView || browserView.webContents.isDestroyed()) return { visible: false };
  if (browserIsVisible) {
    browserView.setVisible(/^https?:\/\//i.test(browserView.webContents.getURL()));
    if (input.bounds) {
      const b = input.bounds;
      const x = Math.max(0, Math.round(Number(b.x) || 0));
      const y = Math.max(0, Math.round(Number(b.y) || 0));
      const width = Math.max(1, Math.min(5000, Math.round(Number(b.width) || 1)));
      const height = Math.max(1, Math.min(5000, Math.round(Number(b.height) || 1)));
      browserView.setBounds({ x, y, width, height });
    }
  } else {
    browserView.setVisible(false);
    browserView.setBounds({ x: -2000, y: -2000, width: 1, height: 1 });
  }
  return { visible: browserIsVisible };
});
ipcMain.handle('browser:setBounds', (_event, input = {}) => {
  if (!browserIsVisible || !browserView || browserView.webContents.isDestroyed()) return false;
  const b = input.bounds || {};
  const x = Math.max(0, Math.round(Number(b.x) || 0)); const y = Math.max(0, Math.round(Number(b.y) || 0));
  const width = Math.max(1, Math.min(5000, Math.round(Number(b.width) || 1))); const height = Math.max(1, Math.min(5000, Math.round(Number(b.height) || 1)));
  browserView.setBounds({ x, y, width, height }); return true;
});
ipcMain.handle('browser:navigate', (_event, input = {}) => navigateBrowserInput(input.value));
ipcMain.handle('browser:back', () => { if (browserView?.webContents.navigationHistory.canGoBack()) browserView.webContents.navigationHistory.goBack(); return browserState(); });
ipcMain.handle('browser:forward', () => { if (browserView?.webContents.navigationHistory.canGoForward()) browserView.webContents.navigationHistory.goForward(); return browserState(); });
ipcMain.handle('browser:reload', () => { browserView?.webContents.reload(); return { accepted: true }; });
ipcMain.handle('browser:saveSite', () => {
  const wc = browserView?.webContents;
  if (!wc || wc.isDestroyed()) throw new Error('Браузер недоступен.');
  const url = wc.getURL();
  const title = clean(wc.getTitle(), 180);
  let parsed; try { parsed = new URL(url); } catch { throw new Error('Открой сайт компании перед сохранением.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error('Эту страницу нельзя сохранить как компанию. Открой публичный сайт.');
  const existing = db.prepare('SELECT id FROM prospects WHERE website=? OR source_url=? LIMIT 1').get(parsed.origin, url);
  if (existing) throw new Error(`Этот сайт уже сохранён в CRM (запись №${existing.id}).`);
  const companyName = companyNameFromPage(title, parsed.hostname);
  const result = db.prepare(`INSERT INTO prospects(company_name,category,service,region,website,source_url,source_name,status,notes)
    VALUES (?,?,?,?,?,?,?,'new',?)`).run(companyName, 'Сохранено из браузера', 'demolition', 'Москва и Московская область', parsed.origin, url, 'Встроенный браузер', `Страница: ${title || parsed.hostname}`);
  return { id: result.lastInsertRowid, company_name: companyName, website: parsed.origin, source_url: url };
});
ipcMain.handle('browser:saveAndScan', async (_event, input = {}) => {
  const wc = browserView?.webContents;
  if (!wc || wc.isDestroyed()) throw new Error('Браузер недоступен.');
  const url = wc.getURL(); const title = clean(wc.getTitle(), 180);
  let parsed; try { parsed = new URL(url); } catch { throw new Error('Открой сайт компании перед сохранением.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error('Открой публичный сайт компании, а не страницу поиска.');
  const service = services.includes(input.service) ? input.service : 'demolition';
  let prospect = db.prepare('SELECT * FROM prospects WHERE website=? OR source_url=? LIMIT 1').get(parsed.origin, url);
  if (!prospect) {
    const companyName = companyNameFromPage(title, parsed.hostname);
    const result = db.prepare(`INSERT INTO prospects(company_name,category,service,region,website,source_url,source_name,status,notes)
      VALUES (?,?,?,?,?,?,?,'new',?)`).run(companyName, 'Сохранено из браузера', service, 'Москва и Московская область', parsed.origin, url, 'Встроенный браузер', `Страница: ${title || parsed.hostname}`);
    prospect = db.prepare('SELECT * FROM prospects WHERE id=?').get(result.lastInsertRowid);
  }
  const report = await crawlSites([url], { maxPages: 5, service, region: prospect.region || 'Москва и Московская область' });
  const discovered = report.prospects.find(item => {
    try { return new URL(item.website).hostname.replace(/^www\./,'') === parsed.hostname.replace(/^www\./,''); } catch { return false; }
  }) || report.prospects[0];
  if (discovered) {
    const mergedNotes = [prospect.notes, discovered.notes].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join('\n').slice(0, 1800);
    db.prepare(`UPDATE prospects SET phone=CASE WHEN @phone<>'' THEN @phone ELSE phone END,
      email=CASE WHEN @email<>'' THEN @email ELSE email END,
      company_name=CASE WHEN length(@company_name)>length(company_name) AND @company_name<>'' THEN @company_name ELSE company_name END,
      category=CASE WHEN category='' OR category='Сохранено из браузера' THEN @category ELSE category END,
      service=@service, source_url=@source_url, source_name='Встроенный браузер', notes=@notes WHERE id=@id`).run({
      id: prospect.id, phone: discovered.phone || '', email: discovered.email || '', company_name: discovered.company_name || '',
      category: discovered.category || 'Компания с публичными контактами', service, source_url: discovered.source_url || url, notes: mergedNotes
    });
  } else {
    db.prepare("UPDATE prospects SET service=?, source_name='Встроенный браузер' WHERE id=?").run(service, prospect.id);
  }
  const saved = db.prepare('SELECT * FROM prospects WHERE id=?').get(prospect.id);
  return { id: saved.id, company_name: saved.company_name, phone: saved.phone, email: saved.email, contactsFound: Boolean((saved.phone || saved.email)), pagesChecked: report.pagesChecked, errors: report.errors.slice(0,5), website: saved.website, source_url: saved.source_url };
});
ipcMain.handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('app:openExternal', async (_event, value) => {
  let url; try { url = new URL(String(value ?? '')); } catch { throw new Error('Некорректная ссылка.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Разрешены только ссылки http и https.');
  await shell.openExternal(url.toString());
  return true;
});

function quoteEscape(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function quoteMoney(value) { return `${Math.round(Number(value) || 0).toLocaleString('ru-RU')} ₽`; }
ipcMain.handle('estimate:exportQuotePdf', async (_event, input = {}) => {
  const lines = Array.isArray(input.lines) ? input.lines.slice(0, 500) : [];
  if (!lines.length) throw new Error('Добавь в смету хотя бы одну работу перед созданием КП.');
  const title = clean(input.title || 'Коммерческое предложение', 180);
  const customer = clean(input.customer, 180); const address = clean(input.address, 240);
  const contact = clean(input.contact, 120); const validity = clean(input.validity || '7 календарных дней', 80);
  const total = Math.max(0, Number(input.revenue) || 0);
  const rows = lines.map((line, i) => `<tr><td class="num">${i + 1}</td><td><strong>${quoteEscape(clean(line.name,180))}</strong>${line.note ? `<small>${quoteEscape(clean(line.note,300))}</small>` : ''}</td><td>${quoteEscape(clean(line.unit,24))}</td><td class="num">${Number(line.quantity || 0).toLocaleString('ru-RU')}</td><td class="num">${quoteMoney(line.price)}</td><td class="num">${quoteMoney(Number(line.quantity || 0) * Number(line.price || 0))}</td></tr>`).join('');
  const discount = Math.max(0, Number(input.discount) || 0);
  const preparedDate = new Date().toLocaleDateString('ru-RU');
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${quoteEscape(title)}</title><style>
  @page{size:A4;margin:13mm 13mm 15mm}*{box-sizing:border-box}body{font-family:Arial,'DejaVu Sans',sans-serif;color:#202a35;font-size:9pt;line-height:1.48;margin:0;background:#fff}header{position:relative;overflow:hidden;background:#172b3a;color:#fff;padding:21px 23px 20px;border-radius:2px;margin-bottom:18px;min-height:168px}header:after{content:"";position:absolute;right:-26px;top:-42px;width:205px;height:205px;border:1px solid rgba(255,255,255,.18);border-radius:50%;box-shadow:0 0 0 22px rgba(255,255,255,.035),0 0 0 45px rgba(255,255,255,.025)}.brand{font-size:23pt;letter-spacing:2.5px;font-weight:800;color:#fff;position:relative;z-index:1}.tag{font-size:7.2pt;letter-spacing:1.5px;color:#f1a36e;font-weight:bold;margin-top:4px;position:relative;z-index:1}.doctype{font-size:8pt;color:#c8d5dc;letter-spacing:1.4px;margin-top:22px;position:relative;z-index:1}.title{font-size:19pt;line-height:1.2;margin:5px 0 0;color:#fff;max-width:82%;position:relative;z-index:1}.hero-mark{position:absolute;right:19px;bottom:18px;width:95px;height:76px;border:1px solid rgba(255,255,255,.26);z-index:1;transform:skewY(-8deg)}.hero-mark:before,.hero-mark:after{content:"";position:absolute;border:1px solid rgba(241,163,110,.8)}.hero-mark:before{inset:12px -10px -10px 12px}.hero-mark:after{left:30px;top:-1px;bottom:-1px;border-width:0 0 0 1px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:7px 17px;margin:0 0 17px}.meta div{padding:7px 9px;background:#f4f6f7;border-left:2px solid #e38b55;min-height:43px}.label{display:block;font-size:7pt;letter-spacing:.65px;color:#687985;margin-bottom:2px;font-weight:700;text-transform:uppercase}.meta-value{overflow-wrap:anywhere}.section{font-size:10pt;font-weight:800;margin:17px 0 8px;color:#203747;display:flex;align-items:center;gap:8px}.section:before{content:"";width:4px;height:15px;background:#e38b55;display:inline-block}table{width:100%;border-collapse:collapse;font-size:8pt}thead{display:table-header-group}th{background:#203747;color:white;text-align:left;padding:8px 6px;font-weight:700}th:first-child{border-radius:2px 0 0 0}td{padding:7px 6px;border-bottom:1px solid #e4e9ec;vertical-align:top}tbody tr:nth-child(even){background:#f6f8f9}.num{text-align:right;white-space:nowrap}small{display:block;color:#6e7d87;font-size:7.3pt;margin-top:3px}.totals{margin:17px 0 0 auto;width:53%;background:#f3f6f7;padding:12px 14px;border-top:3px solid #e38b55}.total-label{color:#687985;font-size:7.5pt;font-weight:700;letter-spacing:.6px}.total{font-size:21pt;line-height:1.25;font-weight:800;color:#203747;margin-top:3px}.discount{font-size:8pt;color:#637079;margin-top:5px}.terms{margin-top:18px;padding:11px 12px;background:#f7f8f8;border-left:2px solid #cbd6dc;color:#596974;font-size:7.8pt}.terms strong{color:#203747}.signatures{display:grid;grid-template-columns:1.2fr .8fr;gap:15px;margin-top:19px;break-inside:avoid;page-break-inside:avoid}.sign-main{padding-top:8px}.sign-title{font-size:8pt;font-weight:800;color:#203747;margin-bottom:8px}.executor{font-size:9pt;font-weight:700;margin-bottom:18px}.signature-line{display:flex;align-items:end;gap:8px;margin-top:10px}.line{border-bottom:1px solid #667782;flex:1;height:22px}.line-label{font-size:7pt;color:#687985;white-space:nowrap}.stamp-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center}.stamp{width:100px;height:100px;border:1.5px dashed #9aaab3;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;color:#8b9ba4;font-size:7pt;line-height:1.4;padding:12px;position:relative}.stamp:before{content:"";position:absolute;inset:5px;border:1px dashed #c0cbd1;border-radius:50%}.stamp-label{font-size:7pt;color:#687985;margin-top:5px}.footer{margin-top:17px;color:#82909a;font-size:6.8pt;border-top:1px solid #e2e7ea;padding-top:8px;display:flex;justify-content:space-between;gap:10px}tr{break-inside:avoid;page-break-inside:avoid}.terms,.totals{break-inside:avoid;page-break-inside:avoid}@media print{header{print-color-adjust:exact;-webkit-print-color-adjust:exact}.meta div,.totals,.terms,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><header><div class="brand">GRUZLI</div><div class="tag">ДЕМОНТАЖ · ОТДЕЛКА · ФАЛЬШПОЛЫ</div><div class="doctype">КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</div><div class="title">${quoteEscape(title)}</div><div class="hero-mark" aria-hidden="true"></div></header><div class="meta"><div><span class="label">Заказчик</span><span class="meta-value">${quoteEscape(customer || 'Не указан')}</span></div><div><span class="label">Контакт заказчика</span><span class="meta-value">${quoteEscape(contact || 'Не указан')}</span></div><div><span class="label">Адрес объекта</span><span class="meta-value">${quoteEscape(address || 'Будет уточнён')}</span></div><div><span class="label">Дата подготовки</span><span class="meta-value">${quoteEscape(preparedDate)}</span></div></div><div class="section">Состав и стоимость работ</div><table><thead><tr><th style="width:5%">№</th><th>Наименование работ</th><th>Ед.</th><th class="num">Кол-во</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="total-label">ИТОГО ПО ПРЕДЛОЖЕНИЮ</div><div class="total">${quoteMoney(total)}</div>${discount ? `<div class="discount">Скидка учтена в расчёте: ${quoteMoney(discount)}</div>` : ''}</div><div class="terms"><strong>Условия предложения</strong><br>Срок действия: ${quoteEscape(validity)}. Сроки выполнения, порядок оплаты и окончательный объём работ согласовываются сторонами до начала работ. Стоимость может быть уточнена после осмотра объекта и подтверждения объёмов. Дополнительные работы, не указанные в таблице, согласовываются отдельно. Настоящее коммерческое предложение не является договором подряда.</div><div class="signatures"><div class="sign-main"><div class="sign-title">ИСПОЛНИТЕЛЬ</div><div class="executor">ИП Борзенко Семен Сергеевич</div><div class="signature-line"><span class="line-label">Подпись</span><span class="line"></span></div><div class="signature-line"><span class="line-label">Ф. И. О.</span><span class="line"></span></div><div class="signature-line"><span class="line-label">Дата</span><span class="line"></span></div></div><div class="stamp-wrap"><div class="stamp">МЕСТО<br>ДЛЯ ПЕЧАТИ<br><span style="font-size:6pt">при наличии</span></div><div class="stamp-label">М. П.</div></div></div><div class="footer"><span>Сформировано в GRUZLI CRM</span><span>Демонтаж · Отделка · Фальшполы</span></div></body></html>`;
  const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Сохранить коммерческое предложение в PDF', defaultPath: `${title.replace(/[^a-zа-яё0-9_-]+/gi,'_').slice(0,80)}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled || !filePath) return { canceled: true };
  const pdfWindow = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try { await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); const data = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } }); fs.writeFileSync(filePath, data); return { canceled: false, filePath }; }
  finally { if (!pdfWindow.isDestroyed()) pdfWindow.destroy(); }
});

ipcMain.handle('updates:status', () => updateStatus);
ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged) {
    return publishUpdateStatus({ state: 'development', message: 'Проверка обновлений доступна в установленной версии CRM.' });
  }
  try {
    publishUpdateStatus({ state: 'checking', message: 'Проверяем наличие обновлений…' });
    await autoUpdater.checkForUpdates();
    return updateStatus;
  } catch (error) {
    return publishUpdateStatus({ state: 'error', message: `Не удалось проверить обновления: ${String(error.message || error).slice(0, 220)}` });
  }
});
ipcMain.handle('updates:download', async () => {
  if (!app.isPackaged) throw new Error('Скачивание обновлений доступно только в установленной версии CRM.');
  if (updateStatus.state !== 'available') throw new Error('Сначала проверь наличие обновления.');
  try {
    publishUpdateStatus({ state: 'downloading', progress: 0, message: 'Начинаем загрузку обновления…' });
    await autoUpdater.downloadUpdate();
    return updateStatus;
  } catch (error) {
    publishUpdateStatus({ state: 'error', message: `Не удалось скачать обновление: ${String(error.message || error).slice(0, 220)}` });
    throw error;
  }
});
ipcMain.handle('updates:install', () => {
  if (!app.isPackaged || updateStatus.state !== 'downloaded') throw new Error('Сначала скачай обновление.');
  autoUpdater.quitAndInstall(false, true);
  return { accepted: true };
});
ipcMain.handle('app:version', () => app.getVersion());
