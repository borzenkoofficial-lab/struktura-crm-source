const $ = (id) => document.getElementById(id);
const serviceLabels = { demolition: 'Демонтаж', finishing: 'Отделочные работы', raised_floor: 'Фальшполы' };
const sourceLabels = { avito: 'Авито', phone: 'Телефон', telegram: 'Telegram', recommendation: 'Рекомендация', website: 'Сайт', other: 'Другое' };
const statusLabels = { new: 'Новая', contacted: 'Связались', measurement: 'Замер', estimate: 'Смета', negotiation: 'Переговоры', won: 'Выиграна', lost: 'Отказ' };
const projectStatusLabels = { planned: 'Запланирован', active: 'В работе', completed: 'Завершён', cancelled: 'Отменён' };
const taskUrgencyLabels = { overdue: 'Просрочена', today: 'Сегодня', upcoming: 'Запланирована', unscheduled: 'Без срока', done: 'Выполнена' };
const expenseLabels = { materials: 'Материалы', workers: 'Рабочие', transport: 'Транспорт', rent: 'Аренда', tools: 'Инструменты', tax: 'Налоги', other: 'Другое' };
const fmt = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n || 0));
let toastTimer;
function toast(message, error = false) { const node = $('toast'); node.textContent = message; node.className = `toast show${error ? ' error' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => node.className = 'toast', 3500); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dateToday() { return new Date().toISOString().slice(0,10); }
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.nav-item[data-view]').forEach(b => { const active = b.dataset.view === name; b.classList.toggle('active', active); if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const titles = { dashboard: 'Обзор бизнеса', leads: 'Заявки', clients: 'Клиенты', projects: 'Объекты', finance: 'Финансы', production: 'Производство · План / факт', browser: 'Браузер и поиск заказчиков', prospects: 'Поиск клиентов', tasks: 'План действий', reports: 'Отчёты', plans: 'Тариф и интеграции' };
  $('pageTitle').textContent = titles[name] || 'GRUZLI CRM';
  const loaders = { dashboard: refreshDashboard, leads: refreshLeads, clients: refreshClients, projects: refreshProjects, production: refreshProduction, finance: refreshFinance, prospects: refreshProspects, tasks: refreshTasks, reports: refreshReports };
  const view = $(`view-${name}`);
  if (loaders[name] && view) {
    view.setAttribute('aria-busy', 'true');
    loaders[name]()
      .catch(error => {
        renderSectionLoadError(name);
        toast(`Ошибка загрузки: ${error.message}`, true);
      })
      .finally(() => view.removeAttribute('aria-busy'));
  }
  if (name === 'projects') refreshEstimateLearningRates().catch(e => toast(`Не удалось обновить нормы по практике: ${e.message}`, true));
  if (name === 'browser') { showIntegratedBrowser().catch(e => toast(`Не удалось открыть браузер: ${e.message}`, true)); }
  else { window.crm.setBrowserVisibility({ visible: false }).catch(() => {}); }
}
function renderSectionLoadError(name) {
  const targets = {
    dashboard: ['recentLeads'],
    leads: ['leadsTable'],
    clients: ['clientsTable'],
    projects: ['projectsTable'],
    production: ['productionProjectCards'],
    finance: ['paymentsTable', 'expensesTable'],
    prospects: ['prospectsTable'],
    tasks: ['tasksTable'],
    reports: ['sourceReport']
  };
  const targetIds = targets[name] || [];
  for (const id of targetIds) {
    const target = $(id);
    if (!target) continue;
    target.innerHTML = `<div class="section-load-error" role="alert"><span class="section-load-error-icon" aria-hidden="true">!</span><div><strong>Не удалось загрузить раздел</strong><p>Данные не удалены. Проверь локальную базу и повтори загрузку.</p><button class="button subtle" type="button" data-retry-view="${esc(name)}">Повторить загрузку</button></div></div>`;
  }
}
document.addEventListener('click', event => {
  const retry = event.target.closest('[data-retry-view]');
  if (retry) showView(retry.dataset.retryView);
});
let browserResizeObserver;
let browserStateCache = { url: '', title: '', loading: false, canGoBack: false, canGoForward: false };
function browserBounds() {
  const node = $('browserPage');
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { x: Math.round(r.left + 1), y: Math.round(r.top + 1), width: Math.max(1, Math.round(r.width - 2)), height: Math.max(1, Math.round(r.height - 2)) };
}
async function syncBrowserBounds() {
  if (!$('view-browser')?.classList.contains('active')) return;
  const bounds = browserBounds(); if (!bounds) return;
  await window.crm.setBrowserBounds({ bounds });
}
async function showIntegratedBrowser() {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const bounds = browserBounds();
  await window.crm.setBrowserVisibility({ visible: true, bounds });
  const state = await window.crm.browserState(); updateBrowserState(state);
  if (browserResizeObserver) browserResizeObserver.disconnect();
  browserResizeObserver = new ResizeObserver(() => syncBrowserBounds().catch(() => {}));
  browserResizeObserver.observe($('browserPage'));
  browserResizeObserver.observe($('view-browser'));
  window.addEventListener('resize', syncBrowserBounds);
}
function updateBrowserState(state = {}) {
  browserStateCache = { ...browserStateCache, ...state };
  const url = browserStateCache.url || '';
  const isHttp = /^https?:\/\//i.test(url);
  if (isHttp && document.activeElement !== $('browserAddress')) $('browserAddress').value = url;
  $('browserPageTitle').textContent = browserStateCache.title || (browserStateCache.loading ? 'Загрузка страницы…' : 'Стартовая страница');
  $('browserStatusText').textContent = browserStateCache.loading ? 'Загрузка сайта…' : (isHttp ? 'Страница открыта' : 'Готов к работе');
  $('browserStatusDot').className = `browser-status-dot${browserStateCache.loading ? ' loading' : ''}`;
  $('browserBackBtn').disabled = !browserStateCache.canGoBack;
  $('browserForwardBtn').disabled = !browserStateCache.canGoForward;
  if (isHttp) {
    $('browserInspectorEmpty').hidden = true; $('browserInspectorContent').hidden = false;
    $('browserInspectorTitle').textContent = browserStateCache.title || new URL(url).hostname;
    $('browserInspectorUrl').textContent = new URL(url).hostname;
  } else {
    $('browserInspectorEmpty').hidden = false; $('browserInspectorContent').hidden = true;
  }
  const placeholder = $('browserPage');
  if (isHttp) placeholder.classList.add('has-web-content'); else placeholder.classList.remove('has-web-content');
}
function navigateBrowser(value) {
  return window.crm.navigateBrowser({ value }).then(() => {
    $('browserPage').classList.add('navigating');
    $('browserStatusText').textContent = 'Открываем страницу…';
    $('browserStatusDot').className = 'browser-status-dot loading';
  }).catch(error => toast(error.message, true));
}
window.crm.onBrowserState(updateBrowserState);
$('browserAddressForm').addEventListener('submit', e => { e.preventDefault(); navigateBrowser($('browserAddress').value); });
$('browserBackBtn').addEventListener('click', () => window.crm.browserBack().then(updateBrowserState).catch(e => toast(e.message,true)));
$('browserForwardBtn').addEventListener('click', () => window.crm.browserForward().then(updateBrowserState).catch(e => toast(e.message,true)));
$('browserReloadBtn').addEventListener('click', () => window.crm.browserReload().catch(e => toast(e.message,true)));
$('browserHomeBtn').addEventListener('click', () => { $('browserAddress').value = ''; window.crm.navigateBrowser({ value: 'https://yandex.ru' }).catch(e => toast(e.message,true)); });
document.querySelectorAll('[data-browser-query]').forEach(button => button.addEventListener('click', () => { $('browserAddress').value = button.dataset.browserQuery; navigateBrowser(button.dataset.browserQuery); }));
async function saveCurrentBrowserSite() {
  const buttons = [$('browserSaveSiteBtn'), $('browserInspectorSaveBtn')];
  buttons.forEach(button => { button.disabled = true; });
  buttons.forEach(button => { button.textContent = 'Проверяем сайт…'; });
  try {
    const saved = await window.crm.saveAndScanBrowserSite({ service: $('browserServiceSelect').value });
    const contactSummary = saved.contactsFound ? `Контакты: ${[saved.phone, saved.email].filter(Boolean).join(' · ')}.` : 'Контакты автоматически не обнаружены — можно проверить страницу контактов вручную.';
    const scanSummary = `Проверено страниц: ${saved.pagesChecked}. ${contactSummary}`;
    toast(`Компания сохранена: ${saved.company_name}. ${scanSummary}`, !saved.contactsFound);
    await refreshProspects();
    updateBrowserState({ ...browserStateCache, url: saved.source_url, title: saved.company_name });
  } catch (error) { toast(error.message, true); }
  finally {
    buttons.forEach(button => { button.disabled = false; });
    $('browserSaveSiteBtn').textContent = '＋ Сохранить и найти контакты';
    $('browserInspectorSaveBtn').textContent = 'Сохранить и найти контакты';
  }
}
$('browserSaveSiteBtn').addEventListener('click', saveCurrentBrowserSite);
$('browserInspectorSaveBtn').addEventListener('click', saveCurrentBrowserSite);
$('browserOpenProspectsBtn').addEventListener('click', () => showView('prospects'));

async function refreshTasks() {
  const filter = $('taskFilter')?.value || 'open';
  const [rows, allRows, leads, projects] = await Promise.all([window.crm.listTasks({ filter }), window.crm.listTasks({ filter: 'all' }), window.crm.listLeads(), window.crm.listProjects()]);
  const today = dateToday();
  const overdue = allRows.filter(t => !t.is_done && t.due_at && String(t.due_at).slice(0,10) < today).length;
  const dueToday = allRows.filter(t => !t.is_done && t.due_at && String(t.due_at).slice(0,10) === today).length;
  const unscheduled = allRows.filter(t => !t.is_done && !t.due_at).length;
  const done = allRows.filter(t => t.is_done).length;
  $('taskOverdueCount').textContent = overdue; $('taskTodayCount').textContent = dueToday; $('taskUnscheduledCount').textContent = unscheduled; $('taskDoneCount').textContent = done;
  $('taskNavCount').textContent = allRows.filter(t => !t.is_done).length;
  const q = ($('taskSearch')?.value || '').toLowerCase();
  const filtered = rows.filter(t => `${t.title} ${t.lead_title || ''} ${t.project_title || ''}`.toLowerCase().includes(q));
  $('tasksTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Задача</th><th>Связано с</th><th>Срок</th><th>Статус</th><th>Действие</th></tr></thead><tbody>${filtered.map(t => { const due = t.due_at ? new Date(t.due_at).toLocaleString('ru-RU', { dateStyle:'medium', timeStyle: String(t.due_at).includes('T') ? 'short' : undefined }) : 'Не назначен'; const related = [t.lead_title && `Заявка: ${t.lead_title}`, t.project_title && `Объект: ${t.project_title}`].filter(Boolean).join(' · ') || '—'; return `<tr><td>${esc(t.title)}</td><td>${esc(related)}</td><td>${esc(due)}</td><td><span class="pill ${t.urgency === 'overdue' ? 'lost' : t.urgency === 'done' ? 'won' : t.urgency === 'today' ? 'new' : 'contacted'}">${esc(taskUrgencyLabels[t.urgency] || 'Активна')}</span></td><td>${t.is_done ? `<button class="button subtle task-toggle" data-task-id="${t.id}" data-task-done="0">Вернуть</button>` : `<button class="button subtle task-toggle" data-task-id="${t.id}" data-task-done="1">Выполнено</button>`}</td></tr>`; }).join('')}</tbody></table>` : empty('Задач пока нет','Создай следующий шаг по заявке или объекту.');
  $('taskLeadSelect').innerHTML = `<option value="">Без заявки</option>${leads.filter(l => !['won','lost'].includes(l.status)).map(l => `<option value="${l.id}">${esc(l.title)}</option>`).join('')}`;
  $('taskProjectSelect').innerHTML = `<option value="">Без объекта</option>${projects.filter(p => !['completed','cancelled'].includes(p.status)).map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}`;
  document.querySelectorAll('.task-toggle').forEach(button => button.addEventListener('click', async () => { try { await window.crm.completeTask({ id: Number(button.dataset.taskId), is_done: button.dataset.taskDone === '1' }); toast(button.dataset.taskDone === '1' ? 'Задача закрыта.' : 'Задача возвращена в работу.'); await refreshTasks(); } catch (e) { toast(e.message, true); } }));
}
function renderProductionIntelligence(data, summaryId, alertsId) {
  const builder = window.StrukturaProductionIntelligence?.buildProductionIntelligence;
  if (typeof builder !== 'function') return;
  const result = builder(data);
  const summary = $(summaryId), alerts = $(alertsId);
  if (summary) summary.textContent = result.summary;
  if (!alerts) return;
  alerts.innerHTML = result.alerts.length
    ? result.alerts.slice(0, 5).map(alert => `<article class="pi-alert ${alert.level === 'danger' ? 'danger' : 'warning'}"><strong>${esc(alert.title)}</strong><span>${esc(alert.message)}</span></article>`).join('')
    : '<div class="pi-no-alerts">По введённым данным явных отклонений не найдено. Это не гарантия отсутствия проблем — полнота учёта важна.</div>';
}
async function refreshNotificationSettings() {
  const settings = await window.crm.getNotificationSettings();
  const form = $('notificationSettingsForm');
  for (const key of ['enabled','taskDeadlines','missingShiftReports','overdueProjects','weekdaysOnly']) form.elements[key].checked = Boolean(settings[key]);
  for (const key of ['startHour','endHour','staleShiftDays','repeatEveryHours']) form.elements[key].value = settings[key];
  $('notificationStatus').textContent = settings.enabled ? `Включены · ${String(settings.startHour).padStart(2,'0')}:00–${String(settings.endHour).padStart(2,'0')}:00 · проверка каждые 15 мин.` : 'Уведомления выключены';
}
async function refreshDashboard() {
  const s = await window.crm.summary();
  $('statLeads').textContent = s.leads; $('statProjects').textContent = s.projects;
  $('statReceived').textContent = fmt(s.received); $('statCash').textContent = fmt(s.cash);
  $('leadNavCount').textContent = s.leads;
  const leads = await window.crm.listLeads();
  $('recentLeads').innerHTML = leads.length ? `<table class="data-table"><thead><tr><th>Заявка</th><th>Услуга</th><th>Источник</th><th>Статус</th><th>Бюджет</th></tr></thead><tbody>${leads.slice(0,5).map(l => `<tr><td>${esc(l.title)}</td><td>${esc(serviceLabels[l.service] || l.service)}</td><td>${esc(sourceLabels[l.source] || l.source)}</td><td><span class="pill ${esc(l.status)}">${esc(statusLabels[l.status] || l.status)}</span></td><td>${fmt(l.budget_rub)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty-state"><div class="empty-icon">◉</div><strong>Пока нет заявок</strong><span>Добавь первое обращение — оно появится здесь.</span><button class="button primary" data-goto="leads">Добавить заявку</button></div>`;
  try { const production = await window.crm.productionOverview(); renderProductionIntelligence(production, 'piHomeSummary', 'piHomeAlerts'); } catch (error) { $('piHomeSummary').textContent = 'Не удалось загрузить данные производства.'; $('piHomeAlerts').innerHTML = `<div class="pi-no-alerts">${esc(error.message)}</div>`; }
}
async function refreshLeads() {
  const rows = await window.crm.listLeads(); const q = ($('leadSearch')?.value || '').toLowerCase(); const status = $('leadStatusFilter')?.value || '';
  const filtered = rows.filter(l => `${l.title} ${l.address} ${l.notes} ${sourceLabels[l.source]}`.toLowerCase().includes(q) && (!status || l.status === status));
  $('leadsTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Заявка</th><th>Услуга</th><th>Источник</th><th>Статус</th><th>Бюджет</th><th>Адрес</th><th>Создана</th></tr></thead><tbody>${filtered.map(l => `<tr><td>${esc(l.title)}</td><td>${esc(serviceLabels[l.service] || l.service)}</td><td>${esc(sourceLabels[l.source] || l.source)}</td><td><select class="lead-status-select" data-lead-status="${l.id}" aria-label="Статус заявки: ${esc(l.title)}">${Object.entries(statusLabels).map(([value,label]) => `<option value="${value}" ${l.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td>${fmt(l.budget_rub)}</td><td>${esc(l.address || '—')}</td><td>${esc(String(l.created_at).slice(0,10))}</td></tr>`).join('')}</tbody></table>` : empty('Заявок не найдено','Создай заявку или измени фильтр.');
}
async function refreshClients() {
  const rows = await window.crm.listClients(); const q = ($('clientSearch')?.value || '').toLowerCase();
  const filtered = rows.filter(c => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q));
  $('clientsTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Клиент</th><th>Телефон</th><th>Email</th><th>Тип</th><th>Добавлен</th></tr></thead><tbody>${filtered.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.phone || '—')}</td><td>${esc(c.email || '—')}</td><td>${c.client_type === 'company' ? 'Компания' : 'Частное лицо'}</td><td>${esc(String(c.created_at).slice(0,10))}</td></tr>`).join('')}</tbody></table>` : empty('Клиентов пока нет','Добавь первый контакт в свою базу.');
}
async function refreshProjects() {
  const rows = await window.crm.listProjects(); const q = ($('projectSearch')?.value || '').toLowerCase();
  const filtered = rows.filter(p => `${p.title} ${p.address} ${p.client_name || ''}`.toLowerCase().includes(q));
  $('projectsTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Объект</th><th>Услуга</th><th>Статус</th><th>Договор</th><th>Получено</th><th>Оплачено расходов</th><th>Долг клиента</th></tr></thead><tbody>${filtered.map(p => `<tr><td>${esc(p.title)}<small class="table-sub">${esc(p.address || 'Адрес не указан')}</small></td><td>${esc(serviceLabels[p.service] || p.service)}</td><td><span class="pill ${esc(p.status)}">${esc(projectStatusLabels[p.status] || p.status)}</span></td><td>${fmt(p.contract_rub)}</td><td>${fmt(p.received_rub)}</td><td>${fmt(p.paid_expenses_rub)}</td><td>${fmt(Math.max(0,Number(p.contract_rub)-Number(p.received_rub)))}</td></tr>`).join('')}</tbody></table>` : empty('Объектов пока нет','Добавь объект, чтобы учитывать договоры, платежи и расходы.');
  const options = rows.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('');
  $('paymentProject').innerHTML = `<option value="">Выбери объект</option>${options}`;
  $('expenseProject').innerHTML = `<option value="">Общий расход без объекта</option>${options}`;
}
function renderFinanceInsights(data) {
  const f7 = data.forecasts.find(f => f.days === 7) || { projectedCash: data.cash, expectedReceipts: 0, plannedOutflow: 0 };
  const f30 = data.forecasts.find(f => f.days === 30) || { projectedCash: data.cash, expectedReceipts: 0, plannedOutflow: 0 };
  $('cashForecast7').textContent = fmt(f7.projectedCash);
  $('cashForecast30').textContent = fmt(f30.projectedCash);
  $('cashForecast7Detail').textContent = `+${fmt(f7.expectedReceipts)} ожидается · −${fmt(f7.plannedOutflow)} расходов`;
  $('cashForecast30Detail').textContent = `+${fmt(f30.expectedReceipts)} ожидается · −${fmt(f30.plannedOutflow)} расходов`;
  $('receivablesTotal').textContent = fmt(data.receivablesTotal);
  $('receivablesDetail').textContent = `${data.unscheduledReceivables.length} объектов без даты окончания`;
  $('unpaidExpensesTotal').textContent = fmt(data.unpaidTotal);
  $('unpaidExpensesDetail').textContent = `${data.overdueExpensesCount} просроченных · ${fmt(data.overdueExpensesTotal)}`;
  const alerts = [];
  if (Number(data.cash) < 0) alerts.push({ level: 'danger', title: 'Отрицательный расчётный остаток', body: `Учтённые поступления минус оплаченные расходы: ${fmt(data.cash)}. Проверь, не пропущены ли платежи или расходы.` });
  if (data.overdueExpensesCount) alerts.push({ level: 'warning', title: 'Есть просроченные расходы', body: `${data.overdueExpensesCount} неоплаченных записей на ${fmt(data.overdueExpensesTotal)} с датой раньше сегодняшней.` });
  for (const p of data.risks.slice(0, 5)) alerts.push({ level: p.level === 'over' ? 'danger' : 'warning', title: `${p.level === 'over' ? 'Расходы превышают договор' : 'Расходы близки к сумме договора'}: ${p.title}`, body: `Оплачено и запланировано ${fmt(p.paidExpensesRub + p.plannedExpensesRub)} при договоре ${fmt(p.contractRub)} (${Math.round(p.costRatio * 100)}%). Это сигнал для проверки, не расчёт прибыли.` });
  if (data.unscheduledReceivablesTotal > 0) alerts.push({ level: 'neutral', title: 'Поступления без даты в прогнозе', body: `${fmt(data.unscheduledReceivablesTotal)} остатка по договорам не включено в прогноз по дням, потому что у объектов не указана дата окончания.` });
  for (const warning of (data.dataWarnings || [])) alerts.push({ level: 'warning', title: 'Проверь данные финансового прогноза', body: warning });
  $('financeAlerts').innerHTML = alerts.length ? alerts.map(a => `<article class="finance-alert ${a.level}"><strong>${esc(a.title)}</strong><span>${esc(a.body)}</span></article>`).join('') : '<div class="empty-state compact-empty"><strong>Критичных сигналов по введённым данным нет</strong><span>Это не гарантия платёжеспособности: проверь полноту учёта.</span></div>';
}
async function refreshFinance() {
  const [summary, payments, expenses, insights] = await Promise.all([window.crm.summary(), window.crm.listPayments(), window.crm.listExpenses(), window.crm.financeInsights()]);
  renderFinanceInsights(insights);
  $('financeReceived').textContent = fmt(summary.received); $('financeExpenses').textContent = fmt(summary.expenses); $('financeCash').textContent = fmt(summary.cash);
  $('paymentsTable').innerHTML = payments.length ? `<table class="data-table"><thead><tr><th>Дата</th><th>Объект</th><th>Операция</th><th>Сумма</th><th>Способ</th><th>Комментарий</th></tr></thead><tbody>${payments.map(p => `<tr><td>${esc(p.payment_date)}</td><td>${esc(p.project_title)}</td><td>${p.payment_type === 'refund' ? '<span class="pill lost">Возврат</span>' : '<span class="pill won">Поступление</span>'}</td><td>${p.payment_type === 'refund' ? '−' : '+'}${fmt(p.amount_rub)}</td><td>${esc(({cash:'Наличные',bank:'На счёт',transfer:'Перевод',other:'Другое'})[p.method] || p.method)}</td><td>${esc(p.note || '—')}</td></tr>`).join('')}</tbody></table>` : empty('Платежей пока нет','Добавь объект, затем записывай авансы и окончательные расчёты.');
  $('expensesTable').innerHTML = expenses.length ? `<table class="data-table"><thead><tr><th>Дата</th><th>Расход</th><th>Объект</th><th>Категория</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>${expenses.map(e => `<tr><td>${esc(e.expense_date)}</td><td>${esc(e.description)}</td><td>${esc(e.project_title || 'Общий')}</td><td>${esc(expenseLabels[e.category] || e.category)}</td><td>${fmt(e.amount_rub)}</td><td><span class="pill ${e.is_paid ? 'won' : 'estimate'}">${e.is_paid ? 'Оплачено' : 'Запланировано'}</span></td></tr>`).join('')}</tbody></table>` : empty('Расходов пока нет','Записывай материалы, рабочих, транспорт и другие расходы.');
  await refreshProjects();
}
let estimateCatalog = window.StrukturaEstimateCalculator.getCatalog();
let estimateLines = [];
let estimateLineSequence = 1;
let pendingProjectPlan = null;
let learnedProductivityModels = {};
let learningRatesRequestId = 0;
function money(n) { return fmt(Math.round(Number(n || 0))); }
function estimateReadInputs() {
  return {
    workArea: $('estimateWorkArea').value,
    lines: estimateLines,
    crew: { people: $('estimateCrewPeople').value, mode: $('estimateCrewMode').value, rate: $('estimateCrewRate').value, hoursPerDay: $('estimateCrewHours').value, days: $('estimateCrewAutoDays')?.checked ? Math.max(0, Math.ceil(estimateGetDurationForecast().daysForCrew || 0)) : $('estimateCrewDays').value },
    materialsCost: $('estimateMaterialsCost').value, disposalCost: $('estimateDisposalCost').value,
    transportCost: $('estimateTransportCost').value, equipmentCost: $('estimateEquipmentCost').value,
    otherCost: $('estimateOtherCost').value, overheadPercent: $('estimateOverheadPercent').value,
    taxPercent: $('estimateTaxPercent').value, discountPercent: $('estimateDiscountPercent').value,
    marginPercent: $('estimateTargetMargin').value, difficulty: $('estimateDifficulty').value, targetDays: $('estimateTargetDays').value, efficiencyPercent: $('estimateEfficiency')?.value || 85
  };
}
function estimateGetDurationForecast() {
  const durationLines = estimateLines.filter(line => Number(line.quantity) > 0).map(line => {
    const learned = learnedProductivityModels[String(line.catalogId)];
    return { ...line, productivity: estimateEffectiveProductivity(line), learningObservations: Number(learned?.observations || 0), baselineProductivity: Number(line.productivity || 0) };
  });
  return window.StrukturaEstimateCalculator.calculateDuration({ lines: durationLines, crew: { people: $('estimateCrewPeople').value, hoursPerDay: $('estimateCrewHours').value }, difficulty: $('estimateDifficulty').value, targetDays: $('estimateTargetDays').value, reservePercent: $('estimateScheduleReserve').value, efficiencyPercent: $('estimateEfficiency')?.value || 85 });
}
function estimateReadActualInputs(plannedCost = 0) {
  return {
    contractRevenue: $('actualContractRevenue').value,
    received: $('actualReceived').value,
    wagesPaid: $('actualWagesPaid').value,
    materialsPaid: $('actualMaterialsPaid').value,
    disposalPaid: $('actualDisposalPaid').value,
    transportPaid: $('actualTransportPaid').value,
    equipmentPaid: $('actualEquipmentPaid').value,
    otherPaid: $('actualOtherPaid').value,
    plannedCost
  };
}
function estimateRefreshActuals(plannedCost = 0) {
  try {
    const r = window.StrukturaEstimateCalculator.calculateActuals(estimateReadActualInputs(plannedCost));
    $('actualTotalCosts').textContent = money(r.actualCosts);
    $('actualProfit').textContent = money(r.actualProfit);
    $('actualProfit').style.color = r.actualProfit < 0 ? '#b42318' : '#147d54';
    $('actualMargin').textContent = `Маржа ${r.actualMargin.toFixed(1).replace('.', ',')}%`;
    $('actualReceivable').textContent = money(r.receivable);
    $('actualCashBalance').textContent = money(r.cashBalance);
    $('actualCashBalance').style.color = r.cashBalance < 0 ? '#b42318' : '#147d54';
    $('actualOverrun').textContent = `${r.overrun > 0 ? '+' : ''}${money(r.overrun)}`;
    $('actualOverrun').style.color = r.overrun > 0 ? '#b42318' : '#147d54';
    $('actualOverrunLabel').textContent = plannedCost > 0 ? `План: ${money(plannedCost)} · факт: ${money(r.actualCosts)}` : 'Сначала рассчитай плановую смету';
    $('estimateActualAlerts').innerHTML = r.warnings.map(w => `<article class="estimate-risk-alert ${esc(w.level)}"><strong>${esc(w.title)}</strong><span>${esc(w.message)}</span></article>`).join('');
    return r;
  } catch (_) { return null; }
}
function estimateSaveDraft() {
  try { window.StrukturaEstimateCalculator.saveDraft({ title: $('estimateTitle').value, service: $('estimateService').value, inputs: estimateReadInputs(), lines: estimateLines, actuals: estimateReadActualInputs() }); } catch (_) {}
}
function estimatePayrollFormula(result) {
  const c = estimateReadInputs().crew;
  const p = Number(c.people || 0), rate = Number(c.rate || 0), days = Number(c.days || 0), hours = Number(c.hoursPerDay || 0);
  if (c.mode === 'hourly') return `${p} чел. × ${money(rate)}/час × ${hours} ч × ${days} дн.`;
  if (c.mode === 'shift') return `${p} чел. × ${money(rate)}/смена × ${days} смен${$('estimateCrewAutoDays')?.checked ? ' · смены из прогноза срока' : ' · смены заданы вручную'} · ${hours > 0 ? money(rate / hours) + ' ₽/ч на человека' : 'часы не указаны'}`;
  if (c.mode === 'per_m2') return `${Number($('estimateWorkArea').value || 0).toLocaleString('ru-RU')} м² × ${money(rate)}/м² за бригаду`;
  if (c.mode === 'percent') return `${rate}% от стоимости работ по прайсу`;
  return `Фиксированная оплата за весь объект`;
}
function estimateRenderLineRows() {
  $('estimateLinesBody').innerHTML = estimateLines.map(line => `<tr data-estimate-line="${esc(line.lineId)}"><td><strong>${esc(line.name)}</strong><small>${esc(line.category || '')}</small></td><td>${esc(line.unit)}</td><td><input aria-label="Количество ${esc(line.name)}" data-line-field="quantity" type="number" min="0" step="0.1" value="${line.quantity}"></td><td><input aria-label="Цена клиенту ${esc(line.name)}" data-line-field="price" type="number" min="0" step="50" value="${line.price}"></td><td><input aria-label="Себестоимость ${esc(line.name)}" data-line-field="cost" type="number" min="0" step="50" value="${line.cost}"></td><td><input aria-label="Производительность ${esc(line.name)}" data-line-field="productivity" type="number" min="0" step="0.5" value="${Number(line.productivity || 0)}" title="Единиц этой работы на одного рабочего за смену"></td><td class="estimate-line-total" data-line-total>${money(Number(line.quantity)*Number(line.price))}</td><td><button class="estimate-remove-line" type="button" data-remove-estimate-line="${esc(line.lineId)}" aria-label="Удалить работу">×</button></td></tr>`).join('');
  $('estimateLinesEmpty').hidden = estimateLines.length > 0;
}
function estimateRefreshCatalogSelect() {
  const q = ($('estimateCatalogSearch').value || '').trim().toLowerCase();
  const filtered = estimateCatalog.filter(item => `${item.name} ${item.category}`.toLowerCase().includes(q));
  $('estimateCatalogSelect').innerHTML = filtered.map(item => `<option value="${esc(item.id)}">${esc(item.category)} · ${esc(item.name)} — ${money(item.price)}/${esc(item.unit)}</option>`).join('');
  $('estimateAddLineBtn').disabled = !filtered.length;
}
function estimateRenderCatalogManager() {
  const q = ($('estimateCatalogManagerSearch').value || '').trim().toLowerCase();
  const category = $('estimateCatalogCategory').value;
  const cats = [...new Set(estimateCatalog.map(x => x.category))].sort((a,b)=>a.localeCompare(b,'ru'));
  const current = category;
  $('estimateCatalogCategory').innerHTML = '<option value="">Все категории</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('estimateCatalogCategory').value = current;
  const items = estimateCatalog.filter(item => (!category || item.category === category) && `${item.name} ${item.category} ${item.note || ''}`.toLowerCase().includes(q));
  $('estimateCatalogBody').innerHTML = items.map(item => `<tr data-catalog-id="${esc(item.id)}"><td>${esc(item.category)}</td><td><strong>${esc(item.name)}</strong><small>${esc(item.note || '')}</small></td><td>${esc(item.unit)}</td><td><input data-catalog-field="price" aria-label="Цена ${esc(item.name)}" type="number" min="0" step="50" value="${Number(item.price || 0)}"></td><td><input data-catalog-field="cost" aria-label="Себестоимость ${esc(item.name)}" type="number" min="0" step="50" value="${Number(item.cost || 0)}"></td><td><input data-catalog-field="productivity" aria-label="Производительность ${esc(item.name)}" type="number" min="0" step="0.5" value="${Number(item.productivity || 0)}" title="Единиц на одного рабочего за смену"></td><td><button type="button" class="text-button" data-delete-catalog="${esc(item.id)}">Удалить</button></td></tr>`).join('');
}
function estimatePersistCatalog() { window.StrukturaEstimateCalculator.saveCatalog(estimateCatalog); estimateRefreshCatalogSelect(); estimateRefreshCalibrationSelect(); }
function estimateAddCatalogLine() {
  const item = estimateCatalog.find(x => x.id === $('estimateCatalogSelect').value);
  if (!item) return;
  const existing = estimateLines.find(x => x.catalogId === item.id);
  if (existing) { existing.quantity = Number(existing.quantity || 0) + (item.unit === 'м²' ? Number($('estimateWorkArea').value || 0) : 1); existing.autoQuantity = false; }
  else estimateLines.push({ lineId: `line-${estimateLineSequence++}`, catalogId: item.id, name: item.name, category: item.category, unit: item.unit, quantity: item.unit === 'м²' ? Number($('estimateWorkArea').value || 0) : 1, autoQuantity: item.unit === 'м²', price: Number(item.price || 0), cost: Number(item.cost || 0), productivity: Number(item.productivity || 0) });
  estimateRenderLineRows(); refreshEstimate();
}
function estimateEffectiveProductivity(line) {
  const baseline = Number(line.productivity || 0);
  const observed = learnedProductivityModels[String(line.catalogId)];
  if (!(baseline > 0) || !observed || !(observed.observations > 0) || !(Number(observed.observedMedian) > 0)) return baseline;
  const count = Number(observed.observations);
  const weight = count >= 5 ? 0.75 : count >= 3 ? 0.5 : 0.25;
  return Math.round((baseline * (1 - weight) + Number(observed.observedMedian) * weight) * 1000) / 1000;
}
async function refreshEstimateLearningRates() {
  const requestId = ++learningRatesRequestId;
  const ids = [...new Set(estimateCatalog.map(item => String(item.id)).filter(Boolean))];
  const targetCrewSize = Math.max(1, Math.min(200, Math.round(Number($('estimateCrewPeople').value || 5))));
  const models = await window.crm.productionRateModels(ids, targetCrewSize);
  if (requestId !== learningRatesRequestId) return;
  learnedProductivityModels = Object.fromEntries(models.map(model => [String(model.catalog_id), model]));
  const trained = Object.values(learnedProductivityModels).filter(model => Number(model.observations) > 0);
  const observations = trained.reduce((sum, model) => sum + Number(model.observations || 0), 0);
  const crewAdjusted = trained.filter(model => model.crewScalingApplied).length;
  $('estimateLearningStatus').textContent = trained.length
    ? `Нормы по практике подключены: ${observations} наблюдений по ${trained.length} видам работ для бригады ${targetCrewSize} чел. Вес практики: 1–2 наблюдения — 25%, 3–4 — 50%, 5+ — 75%. Учёт размера бригады включён для ${crewAdjusted} видов работ, где накоплены повторные наблюдения на разных составах.`
    : 'Пока используются стартовые нормы из прайса. По мере закрытия смен фактическая выработка начнёт влиять и на этот калькулятор.';
  try {
    const production = await window.crm.productionOverview();
    renderProductionIntelligence(production, 'estimatePiSummary', 'estimatePiAlerts');
  } catch (error) {
    $('estimatePiSummary').textContent = 'Не удалось загрузить фактические данные производства.';
    $('estimatePiAlerts').innerHTML = `<div class="pi-no-alerts">${esc(error.message)}</div>`;
  }
  estimateRefreshDuration();
}
function estimateRefreshDuration() {
  const durationLines = estimateLines.filter(line => Number(line.quantity) > 0).map(line => {
    const learned = learnedProductivityModels[String(line.catalogId)];
    return { ...line, productivity: estimateEffectiveProductivity(line), learningObservations: Number(learned?.observations || 0), baselineProductivity: Number(line.productivity || 0) };
  });
  const result = window.StrukturaEstimateCalculator.calculateDuration({ lines: durationLines, crew: { people: $('estimateCrewPeople').value, hoursPerDay: $('estimateCrewHours').value }, difficulty: $('estimateDifficulty').value, targetDays: $('estimateTargetDays').value, reservePercent: $('estimateScheduleReserve').value, efficiencyPercent: $('estimateEfficiency')?.value || 85 });
  const fmtDays = value => value === null || !Number.isFinite(value) ? 'Укажи бригаду' : `${value.toLocaleString('ru-RU',{maximumFractionDigits:1})} смен`;
  $('estimatePersonShifts').textContent = `${result.personShifts.toLocaleString('ru-RU',{maximumFractionDigits:1})}${result.missingRates ? ' + неучтённые работы' : ''}`;
  $('estimateDurationDays').textContent = result.missingRates ? 'Нужны нормы по всем работам' : fmtDays(result.daysForCrew);
  $('estimateDurationHours').textContent = result.missingRates ? `Частичный расчёт: учтено ${result.lines.length - result.missingRates} из ${result.lines.length} позиций. Срок всего объекта не рассчитан.` : result.daysForCrew === null ? 'Укажи бригаду и длительность смены больше нуля' : `≈ ${result.calendarHours.toLocaleString('ru-RU',{maximumFractionDigits:1})} часов по графику · ориентир ${fmtDays(result.lowDaysForCrew)}–${fmtDays(result.highDaysForCrew)}`;
  $('estimateDurationFive').textContent = result.missingRates ? 'Недостаточно норм' : fmtDays(result.hoursPerDay > 0 ? result.personShifts * 8 / (5 * result.hoursPerDay) * (1 + result.reservePercent / 100) : null);
  $('estimateDurationTen').textContent = result.missingRates ? 'Недостаточно норм' : fmtDays(result.hoursPerDay > 0 ? result.personShifts * 8 / (10 * result.hoursPerDay) * (1 + result.reservePercent / 100) : null);
  $('estimateRequiredPeople').textContent = result.requiredPeople === null ? '—' : `${result.requiredPeople} чел.`;
  $('estimateRequiredPeopleDetail').textContent = result.requiredPeople === null ? (result.missingRates ? 'Сначала задай нормы по всем работам' : 'Укажи длительность смены больше нуля') : `на ${Number(result.targetDays).toLocaleString('ru-RU')} смен · резерв ${result.reservePercent}%`;
  if (result.reservePercent > 0) $('estimateDurationHours').textContent += ` · резерв ${result.reservePercent}% включён`;
  if ($('estimateCrewAutoDays')?.checked && result.isComplete && result.daysForCrew !== null) $('estimateCrewDays').value = String(Math.max(1, Math.ceil(result.daysForCrew)));

  $('estimateDurationBreakdown').innerHTML = result.lines.length ? `<div class="estimate-duration-table"><div class="estimate-duration-row header"><span>Работа</span><span>Объём</span><span>Норма / чел.-смену</span><span>Трудоёмкость</span></div>${result.lines.map((line, index) => { const source = durationLines[index]; const normDetail = source?.learningObservations ? `Практика: ${source.learningObservations} наблюдений · старт ${source.baselineProductivity.toLocaleString('ru-RU',{maximumFractionDigits:2})}` : 'Стартовая норма из прайса'; return `<div class="estimate-duration-row"><span>${esc(line.name)}</span><span>${line.quantity.toLocaleString('ru-RU')} ${esc(line.unit)}</span><span>${line.missingRate ? 'Не задана' : `${line.productivity.toLocaleString('ru-RU')} ${esc(line.unit)} / чел.`}<small>${esc(normDetail)}</small></span><strong>${line.missingRate ? '—' : `${line.personShifts.toLocaleString('ru-RU',{maximumFractionDigits:1})} чел.-смен`}</strong></div>`; }).join('')}</div>` : '<p class="estimate-duration-empty">Добавь работы в смету, чтобы рассчитать трудоёмкость.</p>';
  if (result.missingRates) $('estimateDurationBreakdown').insertAdjacentHTML('afterbegin', `<p class="notice inline-notice">Для ${result.missingRates} позиций не задана норма производительности; они не включены в итог трудоёмкости.</p>`);
  return result;
}
function estimateRefreshCalibrationSelect() {
  const select = $('calibrationCatalogItem');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = estimateCatalog.map(item => `<option value="${esc(item.id)}">${esc(item.category)} · ${esc(item.name)} (${esc(item.unit)})</option>`).join('');
  if (estimateCatalog.some(item => item.id === previous)) select.value = previous;
  estimateRefreshCalibrationPreview();
}
function estimateRefreshCalibrationPreview() {
  const item = estimateCatalog.find(x => x.id === $('calibrationCatalogItem')?.value);
  if (!item) return;
  const quantity = Number($('calibrationQuantity').value || 0);
  const people = Number($('calibrationPeople').value || 0);
  const shifts = Number($('calibrationShifts').value || 0);
  const hoursPerShift = Number($('calibrationHours').value || 0);
  let measured = 0;
  try { measured = window.StrukturaEstimateCalculator.calculateObservedProductivity({quantity, people, shifts, hoursPerShift}); } catch (_) { measured = 0; }
  const current = Number(item.productivity || 0);
  $('calibrationMeasuredRate').textContent = measured > 0 ? `${measured.toLocaleString('ru-RU',{maximumFractionDigits:2})} ${item.unit}/чел.-8 ч.` : 'Проверь ввод';
  $('calibrationFormula').textContent = measured > 0 ? `${quantity.toLocaleString('ru-RU')} ${item.unit} ÷ (${people} чел. × ${shifts} смен × ${hoursPerShift}/8 ч.)` : 'Объём, рабочие, смены и часы должны быть больше нуля';
  $('calibrationCurrentRate').textContent = `${current.toLocaleString('ru-RU',{maximumFractionDigits:2})} ${item.unit}/чел.-8 ч.`;
  const deviation = current > 0 && measured > 0 ? (measured / current - 1) * 100 : null;
  $('calibrationDeviation').textContent = deviation === null ? '—' : `${deviation > 0 ? '+' : ''}${deviation.toLocaleString('ru-RU',{maximumFractionDigits:1})}%`;
  $('calibrationDeviationNote').textContent = deviation === null ? 'Нет данных для сравнения' : deviation > 0 ? 'Фактическая выработка выше текущей нормы' : deviation < 0 ? 'Фактическая выработка ниже текущей нормы' : 'Совпадает с текущей нормой';
  $('calibrationApplyBtn').disabled = measured <= 0 || !Number.isFinite(measured);
  return {item, measured};
}
function estimateApplyCalibration() {
  const preview = estimateRefreshCalibrationPreview();
  if (!preview || !(preview.measured > 0)) { toast('Проверь объём, количество рабочих и смен.', true); return; }
  const {item, measured} = preview;
  const oldRate = Number(item.productivity || 0);
  item.productivity = Math.round(measured * 100) / 100;
  item.productivitySource = 'fact';
  item.productivityUpdatedAt = new Date().toISOString();
  estimatePersistCatalog();
  estimateLines.forEach(line => { if (line.catalogId === item.id) line.productivity = item.productivity; });
  estimateRenderLineRows();
  estimateRefreshDuration();
  estimateRenderCatalogManager();
  estimateRefreshCalibrationPreview();
  try { window.StrukturaEstimateCalculator.saveDraft({ ...(window.StrukturaEstimateCalculator.getDraft() || {}), lines: estimateLines, calibration: { catalogId: item.id, oldRate, newRate: item.productivity, updatedAt: item.productivityUpdatedAt } }); } catch (_) {}
  toast(`Норма сохранена: ${item.name} — ${item.productivity} ${item.unit}/чел.-смену.`);
}

function refreshEstimate() {
  try {
    const result = window.StrukturaEstimateCalculator.calculateDetailed(estimateReadInputs());
    estimateRefreshDuration();
    $('estimateListRevenue').textContent = money(result.listRevenue);
    $('estimateDiscountLabel').textContent = result.discount > 0 ? `Скидка −${money(result.discount)}` : 'Без скидки';
    $('estimateFullCost').textContent = money(result.totalCost);
    $('estimateFinalPrice').textContent = money(result.revenue);
    const area = Number($('estimateWorkArea').value || 0);
    $('estimatePricePerM2').textContent = area > 0 ? `${money(result.revenue / area)} за м² площади объекта` : 'Укажи площадь объекта';
    $('estimateNetProfit').textContent = money(result.profit);
    $('estimateNetProfit').style.color = result.profit < 0 ? '#b42318' : '#147d54';
    $('estimateActualMargin').textContent = `Маржа ${result.actualMargin.toFixed(1).replace('.', ',')}%`;
    $('estimateTargetPrice').textContent = result.targetPrice === null ? 'Невозможно рассчитать' : money(result.targetPrice);
    $('estimateTargetGap').textContent = result.gapToTarget === null ? 'Проверь сумму налога и целевой маржи' : result.gapToTarget > 0 ? `Нужно добавить ${money(result.gapToTarget)}` : `Запас к целевой цене ${money(Math.abs(result.gapToTarget))}`;
    $('estimateTargetListPrice').textContent = result.targetListPrice === null ? 'Цена до скидки: невозможно рассчитать' : `Цена до скидки ${money(result.targetListPrice)}`;
    $('estimateRiskAlerts').innerHTML = result.warnings.map(w => `<article class="estimate-risk-alert ${esc(w.level)}"><strong>${esc(w.title)}</strong><span>${esc(w.message)}</span></article>`).join('');
    const advice = [];
    if (result.revenue <= 0) advice.push({level:'danger',title:'Добавь оплачиваемые работы',message:'Без выручки невозможно оценить прибыль. Добавь позиции из прайса и проверь объёмы.'});
    if (result.profit < 0) advice.push({level:'danger',title:'Не отправляй смету в текущем виде',message:`Расчётный убыток ${money(Math.abs(result.profit))}. Подними цену, пересмотри состав работ или снизь реальные затраты — не скрывай их из расчёта.`});
    else if (result.targetPrice !== null && result.actualMargin < result.marginPercent) advice.push({level:'warning',title:'Цена ниже цели',message:`Для целевой маржи ${result.marginPercent}% ориентир цены после скидки — ${money(result.targetPrice)}. Сейчас разница составляет ${money(Math.max(0,result.gapToTarget))}.`});
    if (result.discountPercent > 0) {
      const nextDiscount = Math.min(100, result.discountPercent + 5);
      const nextRevenue = result.listRevenue * (1-nextDiscount/100);
      const nextProfit = nextRevenue - result.costBeforeTax - nextRevenue * (Number($('estimateTaxPercent').value || 0)/100);
      advice.push({level: nextProfit < 0 ? 'danger' : 'neutral',title:`Проверь дополнительную скидку до ${nextDiscount}%`,message:`Если скидка вырастет с ${result.discountPercent}% до ${nextDiscount}%, расчётная прибыль изменится с ${money(result.profit)} до ${money(nextProfit)}. Согласовывай скидку только после проверки этой суммы.`});
    } else if (result.listRevenue > 0) {
      const nextRevenue = result.listRevenue * 0.95;
      const nextProfit = nextRevenue - result.costBeforeTax - nextRevenue * (Number($('estimateTaxPercent').value || 0)/100);
      advice.push({level: nextProfit < 0 ? 'danger' : 'neutral',title:'Проверь сценарий скидки 5%',message:`При скидке 5% прибыль ориентировочно составит ${money(nextProfit)} вместо ${money(result.profit)}. Это сценарий для переговоров, не автоматическая рекомендация давать скидку.`});
    }
    const thinLines = result.lineItems.filter(x => Number(x.price) > 0 && Number(x.cost) >= Number(x.price));
    if (thinLines.length) advice.push({level:'warning',title:'Есть позиции без запаса по прямым затратам',message:`Проверь: ${thinLines.slice(0,4).map(x=>x.name).join(', ')}. В этих строках прямые затраты на единицу не ниже клиентской цены; зарплата, накладные и налоги могут сделать их убыточными.`});
    if (result.lineCosts > 0 && result.payroll > 0) advice.push({level:'neutral',title:'Проверь двойной учёт оплаты бригады',message:'Затраты по строкам и отдельная оплата бригады складываются. Убедись, что зарплата не включена в обе суммы.'});
    $('estimateAdviceList').innerHTML = advice.map(a => `<article class="estimate-advice ${esc(a.level)}"><strong>${esc(a.title)}</strong><span>${esc(a.message)}</span></article>`).join('');
    $('estimatePdfBtn').disabled = result.revenue <= 0 || !result.lineItems.length;
    $('estimatePayrollPreview').textContent = money(result.payroll);
    $('estimatePayrollFormula').textContent = estimatePayrollFormula(result);
    document.querySelectorAll('[data-estimate-line]').forEach(row => { const line = estimateLines.find(x => x.lineId === row.dataset.estimateLine); if (line) row.querySelector('[data-line-total]').textContent = money(Number(line.quantity || 0) * Number(line.price || 0)); });
    $('estimateCreateProjectBtn').disabled = result.revenue <= 0 && result.targetPrice <= 0;
    estimateRefreshActuals(result.totalCost);
    estimateSaveDraft();
    return result;
  } catch (error) {
    ['estimateListRevenue','estimateFullCost','estimateFinalPrice','estimatePricePerM2','estimateNetProfit','estimateActualMargin','estimateTargetPrice','estimateTargetGap','estimateTargetListPrice','estimatePayrollPreview','estimatePayrollFormula'].forEach(id => $(id).textContent = 'Проверь значения');
    $('estimateCreateProjectBtn').disabled = true;
    return null;
  }
}
function estimateDownloadCsv() {
  const result = refreshEstimate(); if (!result) return;
  const rows = [['Наименование','Категория','Ед.','Количество','Цена клиенту','Себестоимость за ед.','Сумма клиенту','Себестоимость строки'], ...result.lineItems.map(x => [x.name,x.category,x.unit,x.quantity,x.price,x.cost,x.revenue,x.costTotal])];
  rows.push([],['Показатель','Сумма'],['Работы по прайсу',result.listRevenue],['Скидка',result.discount],['Бригада',result.payroll],['Материалы',result.materials],['Вывоз',result.disposal],['Транспорт',result.transport],['Техника',result.equipment],['Прочие расходы',result.other],['Накладные',result.overhead],['Резерв на налоги',result.taxReserve],['Цена клиенту',result.revenue],['Полная себестоимость',result.totalCost],['Расчётная прибыль',result.profit],['Маржа, %',result.actualMargin],['Цена для целевой маржи после скидки',result.targetPrice],['Цена до скидки для целевой маржи',result.targetListPrice ?? 'не рассчитывается']);
  const actual = estimateRefreshActuals(result.totalCost);
  if (actual) rows.push([],['ФАКТ ПО ОБЪЕКТУ','Сумма'],['Цена договора',actual.actualRevenue],['Получено от клиента',actual.received],['Выплачено рабочим',actual.wagesPaid],['Фактические расходы',actual.actualCosts],['Фактическая прибыль',actual.actualProfit],['Осталось получить',actual.receivable],['Денежный остаток',actual.cashBalance],['Отклонение от плана',actual.overrun]);
  const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = `${($('estimateTitle').value || 'smeta').replace(/[^a-zа-яё0-9_-]+/gi,'_')}.csv`; a.click(); URL.revokeObjectURL(url); toast('Смета экспортирована в CSV.');
}
async function estimateCopySummary() {
  const r = refreshEstimate(); if (!r) return;
  const text = [`${$('estimateTitle').value || 'Смета'}`, `Услуга: ${$('estimateService').selectedOptions[0].text}`, ...r.lineItems.map(x => `${x.name}: ${x.quantity} ${x.unit} × ${money(x.price)} = ${money(x.revenue)}`), `Работы по прайсу: ${money(r.listRevenue)}`, `Скидка: ${money(r.discount)}`, `ИТОГО КЛИЕНТУ: ${money(r.revenue)}`, `Расчётная себестоимость: ${money(r.totalCost)}`, `Расчётная прибыль: ${money(r.profit)}`, `Цена после скидки для маржи ${r.marginPercent}%: ${r.targetPrice === null ? 'невозможно рассчитать' : money(r.targetPrice)}`, `Цена до скидки: ${r.targetListPrice === null ? 'не рассчитывается' : money(r.targetListPrice)}`, '', 'Предварительный расчёт. Итоговая смета после уточнения объёмов, материалов, доступа и состава работ.'].join('\n');
  try { await navigator.clipboard.writeText(text); toast('Расчёт скопирован.'); } catch (_) { const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); const ok=document.execCommand('copy'); ta.remove(); toast(ok ? 'Расчёт скопирован.' : 'Не удалось скопировать — используй экспорт CSV.', !ok); }
}
function estimateLoadDraft() {
  const draft = window.StrukturaEstimateCalculator.getDraft();
  if (!draft) { estimateRenderLineRows(); estimateRefreshCatalogSelect(); estimateRefreshCalibrationSelect(); estimateRenderCatalogManager(); refreshEstimate(); return; }
  try {
    if (draft.title) $('estimateTitle').value = draft.title;
    ['customer','address','contact','validity'].forEach(key => { const el = $('estimate' + key[0].toUpperCase() + key.slice(1)); if (el && draft[key] !== undefined) el.value = draft[key]; });
    if (draft.service) $('estimateService').value = draft.service;
    const inputs = draft.inputs || {};
    const map = { workArea:'estimateWorkArea', materialsCost:'estimateMaterialsCost', disposalCost:'estimateDisposalCost', transportCost:'estimateTransportCost', equipmentCost:'estimateEquipmentCost', otherCost:'estimateOtherCost', overheadPercent:'estimateOverheadPercent', taxPercent:'estimateTaxPercent', discountPercent:'estimateDiscountPercent', marginPercent:'estimateTargetMargin', difficulty:'estimateDifficulty', targetDays:'estimateTargetDays', efficiencyPercent:'estimateEfficiency' };
    Object.entries(map).forEach(([key,id]) => { if (inputs[key] !== undefined) $(id).value = inputs[key]; });
    if (inputs.crew) { const crewMap={people:'estimateCrewPeople',mode:'estimateCrewMode',rate:'estimateCrewRate',hoursPerDay:'estimateCrewHours',days:'estimateCrewDays'}; Object.entries(crewMap).forEach(([key,id])=>{ if(inputs.crew[key]!==undefined) $(id).value=inputs.crew[key]; }); }
    if (Array.isArray(draft.lines)) estimateLines = draft.lines.map(line => { const catalogItem = estimateCatalog.find(item => item.id === line.catalogId); return { ...line, productivity: Number(line.productivity || catalogItem?.productivity || 0) }; });
    if (draft.actuals) {
      const actualMap = { contractRevenue:'actualContractRevenue', received:'actualReceived', wagesPaid:'actualWagesPaid', materialsPaid:'actualMaterialsPaid', disposalPaid:'actualDisposalPaid', transportPaid:'actualTransportPaid', equipmentPaid:'actualEquipmentPaid', otherPaid:'actualOtherPaid' };
      Object.entries(actualMap).forEach(([key,id]) => { if (draft.actuals[key] !== undefined) $(id).value = draft.actuals[key]; });
    }
  } catch (_) { estimateLines = []; }
  estimateRenderLineRows(); estimateRefreshCatalogSelect(); estimateRefreshCalibrationSelect(); estimateRenderCatalogManager(); refreshEstimate();
}
function prospectPriority(p) {
  return window.StrukturaProspectScoring.evaluate(p);
}
async function refreshSearchApiStatus() {
  const status = $('searchApiStatus');
  try {
    const result = await window.crm.searchStatus();
    status.textContent = result.configured
      ? 'API-ключ сохранён. Можно запускать автоматический поиск.'
      : 'API-ключ не настроен. Сначала сохрани ключ Brave Search.';
    status.className = `search-api-status${result.configured ? ' ready' : ''}`;
    $('runWebSearchBtn').disabled = !result.configured;
  } catch (error) {
    status.textContent = `Не удалось проверить настройки: ${error.message}`;
    status.className = 'search-api-status error';
  }
}
function refreshDomainSearchLinks() {
  const service = $('domainSearchService').value;
  const region = $('domainSearchRegion').value.trim() || 'Москва Московская область';
  const topics = {
    demolition: ['демонтаж офисов коммерческих помещений подрядчик', 'генподрядчик строительство коммерческих объектов', 'управляющая компания бизнес-центр эксплуатация ремонт'],
    finishing: ['отделка офисов fit-out подрядчик', 'генподрядчик отделочные работы коммерческих помещений', 'девелопер коммерческая недвижимость строительство офисов'],
    raised_floor: ['фальшполы монтаж офис серверная подрядчик', 'поставщик фальшполов коммерческие объекты', 'генподрядчик инженерные системы дата-центр офис']
  };
  const queries = topics[service] || topics.demolition;
  $('domainSearchLinks').innerHTML = queries.map((topic, i) => {
    const query = `${topic} ${region}`;
    const yandex = `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;
    const google = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return `<div class="domain-query"><strong>${i + 1}. ${esc(topic)}</strong><div><a href="#" class="local-link" data-external="${esc(yandex)}">Яндекс ↗</a><a href="#" class="local-link" data-external="${esc(google)}">Google ↗</a></div></div>`;
  }).join('');
}
function renderOpportunityRadar(rows) {
  const radar = window.StrukturaProspectRadar.summarize(rows);
  $('radarSignalCount').textContent = radar.signalCount;
  $('radarContactCount').textContent = radar.contactCount;
  $('radarMissingCount').textContent = radar.missingCount;
  $('radarQueue').innerHTML = radar.queue.length ? radar.queue.map(p => {
    const tags = p.radar.signals.map(signal => `<span class="radar-tag">${esc(signal.label)}</span>`).join('');
    const score = p.radar.signalScore;
    return `<article class="radar-item"><div class="radar-item-main"><div class="radar-company-line"><strong>${esc(p.company_name)}</strong><span class="radar-score ${score >= 30 ? 'hot' : score >= 18 ? 'warm' : ''}">${score ? `Сигнал ${score}/100` : 'Без сигнала спроса'}</span></div><div class="radar-tags">${tags || '<span class="radar-tag muted-tag">Сигнал спроса не найден</span>'}</div><p>${esc(p.radar.nextAction)}</p><small>${esc(p.phone || p.email || (p.website ? 'Контакт не найден — есть сайт' : 'Нет контактов и сайта'))}</small></div><div class="radar-actions"><button class="button small-button" data-prospect-edit="${p.id}">Карточка</button>${p.website ? `<button class="button small-button" data-external="${esc(p.website)}">Открыть сайт</button>` : ''}</div></article>`;
  }).join('') : empty('Пока нечего анализировать','Добавь компании или запусти поиск — радар разберёт заметки и фрагменты выдачи.');
}
async function refreshProspects() {
  const rows = await window.crm.listProspects();
  renderOpportunityRadar(rows); const q = ($('prospectSearch')?.value || '').trim().toLowerCase(); const status = $('prospectStatusFilter')?.value || '';
  const labels = { new: 'Новый', reviewed: 'Проверен', contacted: 'Связались', converted: 'В заявках', rejected: 'Не подходит' };
  const scored = rows.map(p => { const priority = prospectPriority(p); return { ...p, priority, fitScore: priority.score }; });
  const filtered = scored.filter(p => `${p.company_name} ${p.category} ${p.region} ${p.phone} ${p.email} ${p.website} ${p.source_name} ${p.notes}`.toLowerCase().includes(q) && (!status || p.status === status)).sort((a,b) => b.fitScore - a.fitScore || a.company_name.localeCompare(b.company_name, 'ru'));
  $('prospectsTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Компания</th><th>Приоритет</th><th>Услуга / категория</th><th>Регион</th><th>Контакты</th><th>Источник</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${filtered.map(p => `<tr><td>${esc(p.company_name)}<small class="table-sub">${esc(p.notes || '')}</small></td><td><span class="fit-score ${p.fitScore >= 70 ? 'high' : p.fitScore >= 40 ? 'medium' : 'low'}">${p.fitScore}/100</span><small class="table-sub">${esc(p.priority.reasons.slice(0,2).join(' · ') || 'Нет подтверждённых сигналов')}</small></td><td>${esc(serviceLabels[p.service] || 'Демонтаж')}<small class="table-sub">${esc(p.category || 'Категория не указана')}</small></td><td>${esc(p.region || '—')}</td><td>${esc(p.phone || '—')}<small class="table-sub">${esc(p.email || '')}</small>${p.website ? `<small><a href="#" class="local-link" data-external="${esc(p.website)}">Сайт</a></small>` : ''}</td><td>${esc(p.source_name || '—')}${p.source_url ? `<small><a href="#" class="local-link" data-external="${esc(p.source_url)}">Открыть источник ↗</a></small>` : ''}</td><td><span class="pill ${p.status === 'converted' ? 'won' : p.status === 'rejected' ? 'lost' : p.status === 'contacted' ? 'contacted' : 'new'}">${esc(labels[p.status] || p.status || 'Новый')}</span></td><td><div class="row-actions"><button class="button small-button" data-prospect-edit="${p.id}">Изменить</button>${p.status !== 'converted' && p.status !== 'rejected' ? `<button class="button small-button primary" data-prospect-convert="${p.id}">В заявку</button>` : ''}</div></td></tr>`).join('')}</tbody></table>` : empty('Подходящих компаний нет','Добавь компанию вручную, импортируй CSV или измени фильтр.');
}
function openProspectEditor(prospect) {
  const form = $('prospectForm'); form.reset();
  form.elements.id.value = prospect?.id || '';
  $('prospectDialogTitle').textContent = prospect ? 'Редактировать компанию' : 'Новая компания';
  const defaults = { service: 'demolition', region: 'Москва и Московская область', source_name: 'manual', status: 'new' };
  for (const [key, value] of Object.entries({ ...defaults, ...(prospect || {}) })) if (form.elements[key]) form.elements[key].value = value ?? '';
  openDialog('prospectDialog');
}
async function refreshReports() {
  const [clients, leads] = await Promise.all([window.crm.listClients(), window.crm.listLeads()]);
  const won = leads.filter(l => l.status === 'won').length;
  $('reportClients').textContent = clients.length; $('reportLeads').textContent = leads.length; $('reportWon').textContent = won;
  $('reportConversion').textContent = `${leads.length ? Math.round(won / leads.length * 100) : 0}%`;
  const groups = {};
  for (const lead of leads) { const key = lead.source || 'other'; if (!groups[key]) groups[key] = { count: 0, budget: 0, won: 0 }; groups[key].count++; groups[key].budget += Number(lead.budget_rub || 0); if (lead.status === 'won') groups[key].won++; }
  const sorted = Object.entries(groups).sort((a,b) => b[1].count - a[1].count);
  $('sourceReport').innerHTML = sorted.length ? `<table class="data-table"><thead><tr><th>Источник</th><th>Заявок</th><th>Выиграно</th><th>Ожидаемый бюджет</th></tr></thead><tbody>${sorted.map(([source,v]) => `<tr><td>${esc(sourceLabels[source] || source)}</td><td>${v.count}</td><td>${v.won}</td><td>${fmt(v.budget)}</td></tr>`).join('')}</tbody></table>` : empty('Пока нет данных','После добавления заявок здесь появится разбивка по источникам.');
}
function empty(title, detail) { return `<div class="empty-state"><div class="empty-icon">◉</div><strong>${esc(title)}</strong><span>${esc(detail)}</span></div>`; }
function openDialog(id) { $(id).showModal(); }
function closeDialog(id) { $(id).close(); }
async function exportCsv(kind) { try { const r = await window.crm.exportDataCsv(kind); if (!r.canceled) toast(`Экспорт завершён: строк ${r.count}.`); } catch (e) { toast(e.message, true); } }
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
const commandPalette = $('commandPaletteDialog');
const commandSearch = $('commandPaletteSearch');
$('openCommandPaletteBtn')?.addEventListener('click', openCommandPalette);
function openCommandPalette() {
  if (!commandPalette) return;
  commandPalette.showModal();
  commandSearch.value = '';
  filterCommandPalette('');
  requestAnimationFrame(() => commandSearch.focus());
}
function filterCommandPalette(query) {
  const q = String(query || '').trim().toLocaleLowerCase('ru-RU');
  let firstFound = false;
  document.querySelectorAll('.command-item').forEach(item => {
    const visible = !q || item.textContent.toLocaleLowerCase('ru-RU').includes(q);
    item.hidden = !visible;
    const firstMatch = visible && !firstFound;
    item.classList.toggle('command-first-match', firstMatch);
    if (firstMatch) firstFound = true;
  });
}
commandSearch?.addEventListener('input', () => filterCommandPalette(commandSearch.value));
commandPalette?.addEventListener('click', event => {
  const item = event.target.closest('[data-command-view]');
  if (!item) return;
  commandPalette.close();
  showView(item.dataset.commandView);
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (commandPalette?.open) commandPalette.close(); else openCommandPalette();
  }
  if (event.key === 'Escape' && commandPalette?.open) commandPalette.close();
});
const sidebarToggle = $('toggleSidebarBtn');
function setSidebarCollapsed(collapsed) {
  const shell = document.querySelector('.app-shell');
  shell.classList.toggle('sidebar-collapsed', collapsed);
  sidebarToggle?.setAttribute('aria-pressed', String(collapsed));
  sidebarToggle?.setAttribute('aria-label', collapsed ? 'Развернуть меню' : 'Свернуть меню');
  document.querySelectorAll('.nav-item[data-view]').forEach(button => {
    if (collapsed) button.title = button.textContent.trim();
    else button.removeAttribute('title');
  });
  try { localStorage.setItem('gruzli.sidebarCollapsed', collapsed ? '1' : '0'); } catch (_) {}
}
try { setSidebarCollapsed(localStorage.getItem('gruzli.sidebarCollapsed') === '1'); } catch (_) { setSidebarCollapsed(false); }
sidebarToggle?.addEventListener('click', () => setSidebarCollapsed(!document.querySelector('.app-shell').classList.contains('sidebar-collapsed')));
document.querySelectorAll('[data-plan-action]').forEach(button => button.addEventListener('click', () => { const plan = button.dataset.planAction; const labels = { subscription: 'Подписка', lifetime: 'Покупка навсегда', pro: 'Профессиональный тариф' }; toast(`${labels[plan] || 'Тариф'}: оформление ещё не подключено. Никаких списаний не выполняется.`); }));
document.addEventListener('click', e => {
  const goto = e.target.closest('[data-goto]'); if (goto) showView(goto.dataset.goto);
  const close = e.target.closest('[data-close]'); if (close) { if (close.dataset.close === 'projectDialog') pendingProjectPlan = null; closeDialog(close.dataset.close); }
  const external = e.target.closest('[data-external]'); if (external) { e.preventDefault(); window.crm.openExternal(external.dataset.external).catch(err => toast(err.message, true)); }
  const editProspect = e.target.closest('[data-prospect-edit]'); if (editProspect) window.crm.listProspects().then(rows => openProspectEditor(rows.find(p => p.id === Number(editProspect.dataset.prospectEdit)))).catch(err => toast(err.message,true));
  const convertProspect = e.target.closest('[data-prospect-convert]'); if (convertProspect) window.crm.convertProspectToLead(Number(convertProspect.dataset.prospectConvert)).then(async r => { toast(`Создана заявка №${r.leadId}.`); await Promise.all([refreshProspects(),refreshLeads(),refreshDashboard()]); }).catch(err => toast(err.message,true));
});
$('quickLead').addEventListener('click', () => { showView('leads'); openDialog('leadDialog'); });
$('addLeadBtn').addEventListener('click', () => openDialog('leadDialog'));
$('addClientBtn').addEventListener('click', () => openDialog('clientDialog'));
$('addProjectBtn').addEventListener('click', () => { pendingProjectPlan = null; $('projectForm').reset(); $('projectForm').elements.planned_people.value = '5'; openDialog('projectDialog'); });
$('projectForm').elements.start_date.addEventListener('change', e => { $('projectForm').elements.end_date.min = e.target.value || ''; if ($('projectForm').elements.end_date.value && e.target.value && $('projectForm').elements.end_date.value < e.target.value) $('projectForm').elements.end_date.value = ''; $('projectForm').elements.end_date.setCustomValidity(''); });
$('projectForm').elements.end_date.addEventListener('change', e => { const start = $('projectForm').elements.start_date.value; if (start && e.target.value && e.target.value < start) { e.target.setCustomValidity('Дата окончания не может быть раньше даты начала.'); e.target.reportValidity(); } else e.target.setCustomValidity(''); });
const estimateInputIds = ['estimateTitle','estimateCustomer','estimateAddress','estimateContact','estimateValidity','estimateService','estimateWorkArea','estimateCrewPeople','estimateCrewMode','estimateCrewRate','estimateCrewHours','estimateCrewDays','estimateMaterialsCost','estimateDisposalCost','estimateTransportCost','estimateEquipmentCost','estimateOtherCost','estimateOverheadPercent','estimateTaxPercent','estimateDiscountPercent','estimateTargetMargin','estimateDifficulty','estimateTargetDays','estimateScheduleReserve','estimateEfficiency'];
$('estimateCrewAutoDays')?.addEventListener('change', () => { $('estimateCrewDays').disabled = $('estimateCrewAutoDays').checked; refreshEstimate(); });
$('estimateCrewDays')?.addEventListener('input', () => { if (!$('estimateCrewAutoDays')?.checked) refreshEstimate(); });
estimateInputIds.forEach(id => $(id).addEventListener('input', () => {
  if (id === 'estimateWorkArea') { estimateLines.forEach(line => { if (line.autoQuantity) line.quantity = Number($('estimateWorkArea').value || 0); }); estimateRenderLineRows(); }
  refreshEstimate(); estimateSaveDraft();
}));
$('estimateCrewPeople').addEventListener('change', () => refreshEstimateLearningRates().catch(error => { $('estimateLearningStatus').textContent = `Не удалось обновить фактические нормы: ${error.message}`; }));
$('estimateCatalogSearch').addEventListener('input', estimateRefreshCatalogSelect);
['calibrationCatalogItem','calibrationQuantity','calibrationPeople','calibrationShifts','calibrationHours'].forEach(id => $(id)?.addEventListener('input', estimateRefreshCalibrationPreview));
$('calibrationCatalogItem')?.addEventListener('change', estimateRefreshCalibrationPreview);
$('calibrationApplyBtn')?.addEventListener('click', estimateApplyCalibration);
$('estimateAddLineBtn').addEventListener('click', estimateAddCatalogLine);
$('estimateClearLinesBtn').addEventListener('click', () => { if (!estimateLines.length) return; estimateLines = []; estimateRenderLineRows(); refreshEstimate(); });
$('estimateLinesBody').addEventListener('input', e => {
  const input = e.target.closest('[data-line-field]'); if (!input) return;
  const row = input.closest('[data-estimate-line]'); const line = estimateLines.find(x => x.lineId === row.dataset.estimateLine); if (!line) return;
  line[input.dataset.lineField] = Math.max(0, Number(input.value || 0));
  if (input.dataset.lineField === 'quantity') line.autoQuantity = false;
  refreshEstimate(); estimateSaveDraft();
});
$('estimateLinesBody').addEventListener('click', e => {
  const button = e.target.closest('[data-remove-estimate-line]'); if (!button) return;
  estimateLines = estimateLines.filter(x => x.lineId !== button.dataset.removeEstimateLine); estimateRenderLineRows(); refreshEstimate();
});
$('toggleCatalogBtn').addEventListener('click', () => { $('estimateCatalogPanel').hidden = !$('estimateCatalogPanel').hidden; if (!$('estimateCatalogPanel').hidden) estimateRenderCatalogManager(); });
$('estimateCloseCatalogBtn').addEventListener('click', () => $('estimateCatalogPanel').hidden = true);
$('estimateCatalogManagerSearch').addEventListener('input', estimateRenderCatalogManager);
$('estimateCatalogCategory').addEventListener('change', estimateRenderCatalogManager);
$('estimateCatalogBody').addEventListener('input', e => {
  const input = e.target.closest('[data-catalog-field]'); if (!input) return;
  const row = input.closest('[data-catalog-id]'); const item = estimateCatalog.find(x => x.id === row.dataset.catalogId); if (!item) return;
  item[input.dataset.catalogField] = Math.max(0, Number(input.value || 0)); if (input.dataset.catalogField === 'productivity') estimateLines.filter(line => line.catalogId === item.id).forEach(line => { line.productivity = item.productivity; }); estimatePersistCatalog(); if (input.dataset.catalogField === 'productivity') { estimateRenderLineRows(); refreshEstimate(); }
});
$('estimateCatalogBody').addEventListener('click', e => {
  const button = e.target.closest('[data-delete-catalog]'); if (!button) return;
  estimateCatalog = estimateCatalog.filter(x => x.id !== button.dataset.deleteCatalog); estimatePersistCatalog(); estimateRenderCatalogManager();
});
$('estimateResetCatalogBtn').addEventListener('click', () => {
  if (!confirm('Вернуть стартовый прайс? Твои изменения цен и себестоимости в каталоге будут заменены.')) return;
  estimateCatalog = window.StrukturaEstimateCalculator.resetCatalog(); estimateRefreshCatalogSelect(); estimateRefreshCalibrationSelect(); estimateRenderCatalogManager(); toast('Стартовый прайс восстановлен.');
});
$('estimateAddCustomCatalogBtn').addEventListener('click', () => {
  const name = prompt('Название работы:'); if (!name || !name.trim()) return;
  const unit = prompt('Единица измерения (например, м², п.м., шт., смена, объект):', 'м²'); if (!unit || !unit.trim()) return;
  const price = Number(prompt('Цена для клиента за единицу, ₽:', '0') || 0); if (!Number.isFinite(price) || price < 0) { toast('Цена должна быть неотрицательным числом.', true); return; }
  const cost = Number(prompt('Себестоимость за единицу, ₽ (можно 0 и заполнить позже):', '0') || 0); if (!Number.isFinite(cost) || cost < 0) { toast('Себестоимость должна быть неотрицательным числом.', true); return; }
  const category = prompt('Категория:', 'Мои работы') || 'Мои работы';
  const productivity = Number(prompt(`Производительность: сколько ${unit.trim()} один рабочий делает за 8-часовую смену?`, unit.trim() === 'м²' ? '10' : '8') || 0); if (!Number.isFinite(productivity) || productivity < 0) { toast('Производительность должна быть неотрицательным числом.', true); return; }
  estimateCatalog.push({ id:`custom-${Date.now()}`, name:name.trim(), category:category.trim(), unit:unit.trim(), price, cost, productivity, note:'Пользовательская расценка' });
  estimatePersistCatalog(); estimateRenderCatalogManager(); toast('Своя расценка добавлена.');
});
$('estimateCopyBtn').addEventListener('click', estimateCopySummary);
$('estimateCsvBtn').addEventListener('click', estimateDownloadCsv);
$('estimatePdfBtn').addEventListener('click', async () => {
  const r = refreshEstimate(); if (!r) return;
  try { const saved = await window.crm.exportQuotePdf({ title: $('estimateTitle').value, customer: $('estimateCustomer').value, address: $('estimateAddress').value, contact: $('estimateContact').value, validity: $('estimateValidity').value, lines: r.lineItems.map(x => ({name:x.name,unit:x.unit,quantity:x.quantity,price:x.price})), revenue: r.revenue, discount: r.discount }); if (saved?.canceled) return; toast('КП в PDF сохранено.'); } catch (error) { toast(`Не удалось сформировать PDF: ${error.message}`, true); }
});
$('estimateCreateProjectBtn').addEventListener('click', () => {
  const result = refreshEstimate(); if (!result) return;
  const form = $('projectForm'); form.reset();
  form.elements.title.value = $('estimateTitle').value || 'Предварительная смета';
  form.elements.service.value = $('estimateService').value;
  form.elements.contract_rub.value = String(Math.ceil(result.revenue / 100) * 100);
  form.elements.planned_people.value = String(Math.max(1, Number($('estimateCrewPeople').value || 5)));
  form.elements.complexity_factor.value = $('estimateDifficulty').value;
  form.elements.notes.value = `Смета PRO: работы ${money(result.listRevenue)}; скидка ${money(result.discount)}; себестоимость ${money(result.totalCost)}; расчётная прибыль ${money(result.profit)}. Подробная смета экспортируется отдельно в CSV.`;
  const planMap = new Map();
  for (const line of estimateLines.filter(line => Number(line.quantity) > 0 && Number(line.productivity) > 0 && line.catalogId)) {
    const saved = planMap.get(line.catalogId);
    if (saved) saved.planned_quantity += Number(line.quantity);
    else planMap.set(line.catalogId, { catalog_id: line.catalogId, work_name: line.name, unit: line.unit, planned_quantity: Number(line.quantity), baseline_productivity: Number(line.productivity) });
  }
  pendingProjectPlan = { planned_people: Number(form.elements.planned_people.value || 5), complexity_factor: Number(form.elements.complexity_factor.value || 1), lines: [...planMap.values()] };
  openDialog('projectDialog');
  toast(pendingProjectPlan.lines.length ? 'Сумма, состав бригады, сложность и позиции сметы будут перенесены в объект.' : 'Цена перенесена. Для прогноза сроков после сохранения добавь план работ.');
});
const actualInputIds = ['actualContractRevenue','actualReceived','actualWagesPaid','actualMaterialsPaid','actualDisposalPaid','actualTransportPaid','actualEquipmentPaid','actualOtherPaid'];
actualInputIds.forEach(id => $(id).addEventListener('input', () => { const r = refreshEstimate(); if (r) estimateRefreshActuals(r.totalCost); estimateSaveDraft(); }));
$('actualUseEstimatePriceBtn').addEventListener('click', () => { const r = refreshEstimate(); if (!r) return; $('actualContractRevenue').value = Math.round(r.revenue); estimateRefreshActuals(r.totalCost); estimateSaveDraft(); toast('Цена сметы подставлена в план/факт.'); });
estimateLoadDraft();
refreshEstimateLearningRates().catch(error => { $('estimateLearningStatus').textContent = `Не удалось загрузить фактические нормы: ${error.message}`; });
$('addPaymentBtn').addEventListener('click', async () => { await refreshProjects(); if (!(await window.crm.listProjects()).length) { toast('Сначала создай объект, к которому привязать платёж.', true); showView('projects'); return; } $('paymentForm').elements.payment_date.value = dateToday(); openDialog('paymentDialog'); });
$('addExpenseBtn').addEventListener('click', async () => { await refreshProjects(); $('expenseForm').elements.expense_date.value = dateToday(); openDialog('expenseDialog'); });
$('notificationSettingsBtn').addEventListener('click', async () => { try { await refreshNotificationSettings(); openDialog('notificationSettingsDialog'); } catch (error) { toast(`Не удалось загрузить настройки уведомлений: ${error.message}`, true); } });
$('notificationSettingsForm').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); for (const key of ['enabled','taskDeadlines','missingShiftReports','overdueProjects','weekdaysOnly']) data[key] = form.elements[key].checked; for (const key of ['startHour','endHour','staleShiftDays','repeatEveryHours']) data[key] = Number(data[key]); try { const saved = await window.crm.saveNotificationSettings(data); closeDialog('notificationSettingsDialog'); $('notificationStatus').textContent = saved.enabled ? `Включены · ${String(saved.startHour).padStart(2,'0')}:00–${String(saved.endHour).padStart(2,'0')}:00 · проверка каждые 15 мин.` : 'Уведомления выключены'; toast('Настройки уведомлений сохранены.'); } catch (error) { toast(error.message, true); } });
$('refreshBtn').addEventListener('click', () => refreshDashboard().catch(e => toast(e.message,true)));
$('leadSearch').addEventListener('input', () => refreshLeads().catch(e => toast(e.message,true)));
$('leadStatusFilter').addEventListener('change', () => refreshLeads().catch(e => toast(e.message,true)));
$('clientSearch').addEventListener('input', () => refreshClients().catch(e => toast(e.message,true)));
$('projectSearch').addEventListener('input', () => refreshProjects().catch(e => toast(e.message,true)));
$('prospectSearch').addEventListener('input', () => refreshProspects().catch(e => toast(e.message,true)));
$('prospectStatusFilter').addEventListener('change', () => refreshProspects().catch(e => toast(e.message,true)));
$('refreshRadarBtn').addEventListener('click', () => refreshProspects().then(() => toast('Радар пересчитан по текущей базе.')).catch(e => toast(e.message,true)));
$('domainSearchService').addEventListener('change', refreshDomainSearchLinks);
$('domainSearchRegion').addEventListener('input', refreshDomainSearchLinks);
refreshDomainSearchLinks();
$('addTaskBtn').addEventListener('click', async () => { await refreshTasks(); $('taskForm').reset(); $('taskDialog').showModal(); });
$('taskForm').addEventListener('submit', async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); try { await window.crm.createTask(data); closeDialog('taskDialog'); toast('Задача добавлена в план действий.'); await refreshTasks(); } catch (err) { toast(err.message, true); } });
$('taskSearch').addEventListener('input', () => refreshTasks().catch(e => toast(e.message, true)));
$('taskFilter').addEventListener('change', () => refreshTasks().catch(e => toast(e.message, true)));
$('addProspectBtn').addEventListener('click', () => openProspectEditor());
$('prospectForm').addEventListener('submit', async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); try { if (data.id) await window.crm.updateProspect(data); else await window.crm.createProspect(data); closeDialog('prospectDialog'); toast(data.id ? 'Компания обновлена.' : 'Компания добавлена.'); await refreshProspects(); } catch (err) { toast(err.message,true); } });
$('leadsTable').addEventListener('change', async event => {
  const control = event.target.closest('[data-lead-status]');
  if (!control) return;
  const id = Number(control.dataset.leadStatus);
  const status = control.value;
  control.disabled = true;
  try {
    await window.crm.updateLeadStatus({ id, status });
    toast('Статус заявки обновлён.');
    await Promise.all([refreshLeads(), refreshDashboard(), refreshReports()]);
  } catch (error) {
    toast(`Не удалось изменить статус: ${error.message}`, true);
    await refreshLeads().catch(() => {});
  } finally {
    control.disabled = false;
  }
});
$('leadForm').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form)); try { await window.crm.createLead(data); form.reset(); closeDialog('leadDialog'); toast('Заявка сохранена.'); await Promise.all([refreshLeads(),refreshDashboard()]); } catch (err) { toast(err.message, true); } });
$('clientForm').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form)); try { await window.crm.createClient(data); form.reset(); closeDialog('clientDialog'); toast('Клиент сохранён.'); await Promise.all([refreshClients(),refreshDashboard()]); } catch (err) { toast(err.message, true); } });
$('projectForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form));
  const planToAttach = pendingProjectPlan; pendingProjectPlan = null;
  try {
    if (planToAttach?.lines?.length) await window.crm.createProjectWithPlan({ project: data, plan: planToAttach });
    else await window.crm.createProject(data);
  } catch (err) { pendingProjectPlan = planToAttach; toast(err.message,true); return; }
  form.reset(); closeDialog('projectDialog');
  toast(planToAttach?.lines?.length ? 'Объект и производственный план сохранены одной операцией.' : 'Объект сохранён. План работ можно добавить в разделе «Производство».');
  await Promise.all([refreshProjects(),refreshDashboard(),refreshProduction()]).catch(err => toast(`Объект сохранён, но обновление списка завершилось ошибкой: ${err.message}`, true));
});
$('paymentForm').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form)); try { await window.crm.createPayment(data); form.reset(); closeDialog('paymentDialog'); toast('Платёж записан.'); await refreshFinance(); await refreshDashboard(); } catch (err) { toast(err.message,true); } });
$('expenseForm').addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form)); try { await window.crm.createExpense(data); form.reset(); closeDialog('expenseDialog'); toast('Расход сохранён.'); await refreshFinance(); await refreshDashboard(); } catch (err) { toast(err.message,true); } });
$('importProspectsBtn').addEventListener('click', async () => { try { const r = await window.crm.importProspectsCsv(); if (!r.canceled) { toast(`Импортировано: ${r.imported}, пропущено дублей: ${r.skipped}.`); await refreshProspects(); } } catch (e) { toast(e.message,true); } });
$('crawlWebsitesBtn').addEventListener('click', async () => {
  const button = $('crawlWebsitesBtn'), result = $('crawlerResult');
  const urls = $('crawlerUrls').value.trim();
  if (!urls) { toast('Вставь адреса публичных сайтов компаний.', true); return; }
  button.disabled = true; button.textContent = 'Ищем контакты…'; result.hidden = false; result.className = 'crawler-result'; result.textContent = 'Проверяем доступность сайтов и robots.txt. Большие сайты могут обрабатываться несколько минут.';
  try {
    const report = await window.crm.crawlProspectWebsites({ urls, service: $('crawlerService').value, region: $('crawlerRegion').value, maxPages: Number($('crawlerMaxPages').value) });
    const lines = [`Найдено сайтов с контактами: ${report.discovered}`, `Добавлено в базу: ${report.imported}`, `Пропущено дублей: ${report.skipped}`, `Проверено HTML-страниц: ${report.pagesChecked}`, `Ошибок: ${report.errors.length}`];
    if (report.errors.length) lines.push('', 'Первые ошибки:', ...report.errors.slice(0,5).map(e => `• ${e.url}: ${e.error}`));
    result.textContent = lines.join('\n'); await refreshProspects();
    toast(`Парсинг завершён. Добавлено компаний: ${report.imported}.`);
  } catch (error) { result.className = 'crawler-result error'; result.textContent = `Не удалось завершить поиск: ${error.message}`; toast(error.message, true); }
  finally { button.disabled = false; button.textContent = '⌕ Найти контакты'; }
});
$('saveSearchKeyBtn').addEventListener('click', async () => {
  const button = $('saveSearchKeyBtn');
  const apiKey = $('searchApiKey').value.trim();
  if (!apiKey) { toast('Вставь API-ключ Brave Search.', true); return; }
  button.disabled = true; button.textContent = 'Сохраняем…';
  try {
    await window.crm.saveSearchKey({ apiKey });
    $('searchApiKey').value = '';
    toast('API-ключ сохранён в защищённом локальном хранилище.');
    await refreshSearchApiStatus();
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = 'Сохранить ключ'; }
});
$('runWebSearchBtn').addEventListener('click', async () => {
  const button = $('runWebSearchBtn'), result = $('webSearchResult');
  button.disabled = true; button.textContent = 'Ищем…'; result.hidden = false; result.className = 'crawler-result';
  result.textContent = 'Выполняем три поисковых запроса. Это может занять до нескольких десятков секунд.';
  try {
    const report = await window.crm.searchProspects({ service: $('domainSearchService').value, region: $('domainSearchRegion').value });
    const lines = [`Поисковых запросов: ${report.queries.length}`, `Получено результатов: ${report.received}`, `Добавлено сайтов в CRM: ${report.imported}`, `Пропущено дублей: ${report.skipped}`, `Ошибок запросов: ${report.errors.length}`];
    if (report.errors.length) lines.push('', 'Ошибки:', ...report.errors.map(e => `• ${e.query}: ${e.error}`));
    lines.push('', 'Важно: телефоны и email из выдачи не подтверждены. Открой сайт и запусти парсер публичных страниц.');
    result.textContent = lines.join('\n'); await refreshProspects();
    toast(`Поиск завершён. Добавлено сайтов: ${report.imported}.`);
  } catch (error) { result.className = 'crawler-result error'; result.textContent = `Поиск не выполнен: ${error.message}`; toast(error.message, true); }
  finally { button.disabled = false; button.textContent = '⌕ Найти компании'; await refreshSearchApiStatus(); }
});
$('exportProspectsBtn').addEventListener('click', () => exportCsv('prospects'));
$('exportClientsBtn').addEventListener('click', () => exportCsv('clients'));
$('exportLeadsBtn').addEventListener('click', () => exportCsv('leads'));
$('backupBtn').addEventListener('click', async () => { try { const result = await window.crm.createBackup(); if (!result.canceled) toast('Резервная копия сохранена.'); } catch (e) { toast(`Ошибка резервного копирования: ${e.message}`, true); } });
$('restoreBackupBtn').addEventListener('click', async () => { try { const result = await window.crm.restoreBackup(); if (!result.canceled) toast('База восстановлена. Перед восстановлением сохранена автоматическая копия текущих данных.'); } catch (e) { toast(`Восстановление не выполнено: ${e.message}`, true); } });
$('dataFolderBtn').addEventListener('click', async () => { const err = await window.crm.openDataFolder(); if (err) toast(err, true); });
function productionNum(value, digits = 1) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: digits });
}
function productionCatalogItem(id) { return estimateCatalog.find(item => String(item.id) === String(id)); }
function productionCatalogOptions(selectedId, savedLine) {
  const found = estimateCatalog.some(item => String(item.id) === String(selectedId));
  const extra = !found && savedLine?.catalog_id
    ? `<option value="${esc(savedLine.catalog_id)}" selected data-name="${esc(savedLine.work_name)}" data-unit="${esc(savedLine.unit)}" data-productivity="${esc(savedLine.baseline_productivity)}">${esc(savedLine.work_name)} · ${esc(savedLine.unit)} (сохранённая позиция)</option>` : '';
  return extra + estimateCatalog.map(item => `<option value="${esc(item.id)}" data-name="${esc(item.name)}" data-unit="${esc(item.unit)}" data-productivity="${esc(item.productivity)}" ${String(item.id) === String(selectedId) ? 'selected' : ''}>${esc(item.category)} · ${esc(item.name)} (${esc(item.unit)})</option>`).join('');
}
function productionEditRow(mode, saved = {}) {
  const id = saved.catalog_id || saved.catalogId || estimateCatalog[0]?.id;
  const item = productionCatalogItem(id);
  const unit = saved.unit || item?.unit || 'ед.';
  const baseline = Number(saved.baseline_productivity ?? saved.productivity ?? item?.productivity ?? 1);
  const name = saved.work_name || saved.name || item?.name || 'Работа';
  const qtyKey = mode === 'plan' ? 'planned_quantity' : 'quantity_done';
  const qty = saved[qtyKey] ?? saved.quantity ?? '';
  const workers = saved.workers_count ?? Number($('shiftWorkers')?.value || $('planPeople')?.value || 5);
  const hours = saved.hours ?? Number($('shiftHours')?.value || 8);
  const quantityInputRules = mode === 'plan' ? 'min="0.01" required' : 'min="0"';
  return `<div class="production-edit-row" data-production-edit-row data-production-mode="${mode}">
    <label class="production-work-select">Работа<select data-prod-field="catalog_id" required>${productionCatalogOptions(id, saved.catalog_id ? saved : null)}</select></label>
    <label>Объём, <span data-production-unit>${esc(unit)}</span><input data-prod-field="${qtyKey}" type="number" ${quantityInputRules} step="0.01" value="${esc(qty)}" placeholder="${mode === 'plan' ? 'Плановый объём' : 'Пусто, если не выполняли'}"></label>
    ${mode === 'shift' ? `<label>Людей<input data-prod-field="workers_count" type="number" min="1" max="200" step="1" value="${esc(workers)}" required></label><label>Часов на эту работу<input data-prod-field="hours" type="number" min="0.25" max="24" step="0.25" value="${esc(hours)}" required></label>` : `<div class="production-baseline"><span>Стартовая норма</span><strong data-production-rate>${productionNum(baseline,2)} ${esc(unit)} / чел.-смену</strong><small>Уточняется после закрытия смен</small></div>`}
    <input data-prod-field="work_name" type="hidden" value="${esc(name)}"><input data-prod-field="unit" type="hidden" value="${esc(unit)}"><input data-prod-field="baseline_productivity" type="hidden" value="${esc(baseline)}">
    ${mode === 'shift' ? '<div class="production-live-rate" data-production-live-rate>Внеси объём и трудозатраты — появится сравнение с нормой.</div>' : ''}
    <button type="button" class="button subtle production-remove-row" data-remove-production-row aria-label="Удалить строку">×</button>
  </div>`;
}
function productionRenderRows(containerId, mode, rows = []) {
  const container = $(containerId);
  container.innerHTML = (rows.length ? rows : [{}]).map(row => productionEditRow(mode, row)).join('');
  container.querySelectorAll('[data-production-edit-row]').forEach(row => productionSyncRow(row));
  if (mode === 'shift') productionRefreshShiftHint();
}
function productionSyncRow(row) {
  const select = row.querySelector('[data-prod-field="catalog_id"]');
  const option = select?.selectedOptions?.[0];
  const catalog = productionCatalogItem(select?.value);
  const unit = option?.dataset.unit || catalog?.unit || row.querySelector('[data-prod-field="unit"]')?.value || 'ед.';
  const name = catalog?.name || option?.dataset.name || option?.textContent || row.querySelector('[data-prod-field="work_name"]')?.value || 'Работа';
  const productivity = Number(option?.dataset.productivity || catalog?.productivity || row.querySelector('[data-prod-field="baseline_productivity"]')?.value || 0);
  const unitNode = row.querySelector('[data-production-unit]'); if (unitNode) unitNode.textContent = unit;
  const rateNode = row.querySelector('[data-production-rate]'); if (rateNode) rateNode.textContent = `${productionNum(productivity,2)} ${unit} / чел.-смену`;
  const fields = row.querySelectorAll('[data-prod-field]');
  for (const field of fields) {
    if (field.dataset.prodField === 'work_name') field.value = name;
    if (field.dataset.prodField === 'unit') field.value = unit;
    if (field.dataset.prodField === 'baseline_productivity') field.value = productivity;
  }
  if (row.dataset.productionMode === 'shift') productionRefreshShiftHint();
}
function productionCurrentProjectOptions(projects, selectedId = '') {
  return `<option value="">Выбери объект</option>` + projects.map(p => `<option value="${p.id}" ${Number(p.id) === Number(selectedId) ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
}
async function refreshProduction() {
  if (!$('productionProjectCards')) return;
  const data = await window.crm.productionOverview();
  renderProductionIntelligence(data, 'piProductionSummary', 'piProductionAlerts');
  $('productionActiveCount').textContent = data.projects.length;
  $('productionShiftCount').textContent = data.totals.shifts || 0;
  $('productionPersonShifts').textContent = productionNum(data.totals.person_shifts, 1);
  $('productionRecordCount').textContent = data.totals.work_records || 0;
  $('productionProjectCards').innerHTML = data.projects.length ? data.projects.map(project => {
    const forecast = project.forecast;
    const forecastLabel = project.planCount && forecast.estimated
      ? (forecast.teamShiftsRemaining <= 0 ? 'Работы по плану закрыты' : `≈ ${productionNum(forecast.teamShiftsRemaining,1)} смен бригадой ${project.planned_people} чел.`)
      : 'Добавь план работ, чтобы прогнозировать остаток';
    const items = forecast.lines.slice(0,5).map(line => {
      const total = Math.max(Number(line.plannedQuantity || 0), 0.0001);
      const progress = Math.min(100, Math.round(Number(line.actualQuantity || 0) / total * 100));
      const remainingLabel = line.overPlan ? `План превышен на ${productionNum(Number(line.actualQuantity) - Number(line.plannedQuantity),1)} ${line.unit}` : `Осталось ${productionNum(line.remainingQuantity,1)} ${line.unit}`;
      return `<div class="production-work-progress"><div class="production-work-progress-head"><strong>${esc(line.name)}</strong><span>${productionNum(line.actualQuantity,1)} / ${productionNum(line.plannedQuantity,1)} ${esc(line.unit)}</span></div><div class="production-progress-track"><span style="width:${progress}%"></span></div><div class="production-work-progress-meta"><span class="${line.overPlan ? 'production-plan-exceeded' : ''}">${esc(remainingLabel)}</span><span>${esc(line.confidence)}${line.crewScalingApplied ? ' · учтён размер бригады' : ''}</span></div></div>`;
    }).join('');
    return `<article class="production-project-card"><div class="production-card-top"><div><span class="pill active">В работе</span><h4>${esc(project.title)}</h4><p>${esc(project.address || 'Адрес не указан')} · ${esc(serviceLabels[project.service] || project.service)}</p></div><span class="production-card-icon">◷</span></div><div class="production-forecast"><span>ПРОГНОЗ ОСТАТКА</span><strong>${esc(forecastLabel)}</strong><small>${project.planCount ? `Трудоёмкость остатка ≈ ${productionNum(forecast.laborShiftsRemaining,1)} человеко-смен. Норма по практике обновляется после отчётов.` : 'План объёмов пока не указан. Без него остаток работ и срок достоверно не вычислить.'}</small></div><div class="production-card-facts"><span><b>${project.shiftCount}</b> смен записано</span><span><b>${productionNum(project.personShifts,1)}</b> человеко-смен факт</span><span>Последняя: <b>${esc(project.lastShiftDate || 'нет')}</b></span></div>${items ? `<div class="production-work-list">${items}${forecast.lines.length > 5 ? `<div class="production-more-lines">Ещё позиций в плане: ${forecast.lines.length - 5}</div>` : ''}</div>` : `<div class="production-no-plan">План не настроен — сначала внеси все плановые работы и объёмы.</div>`}<div class="production-card-actions"><button class="button subtle" data-production-plan="${project.id}">Настроить план</button><button class="button primary" data-production-shift="${project.id}">＋ Отчёт за смену</button></div></article>`;
  }).join('') : `<div class="panel production-empty"><div class="production-empty-icon">◷</div><h4>Пока нет активных объектов</h4><p>Создай объект в разделе «Объекты» и поставь статус «В работе». После этого здесь появится карточка для плана, прогноза и ежедневных отчётов.</p><button class="button primary" data-goto="projects">Перейти к объектам</button></div>`;
  $('productionHistory').innerHTML = data.history.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Дата</th><th>Объект</th><th>Бригада</th><th>Фактически сделано</th><th>Выработка против нормы</th><th>Простой</th><th>Условия</th><th>Примечание</th><th></th></tr></thead><tbody>${data.history.map(shift => `<tr><td>${esc(shift.shift_date)}</td><td>${esc(shift.project_title)}</td><td>${shift.workers_count} чел. × ${productionNum(shift.shift_hours,1)} ч.</td><td>${esc(shift.work_summary || '—')}<small class="table-sub">${shift.work_count} видов работ</small></td><td><div class="production-history-rates">${shift.performance.map(item => { const deviation = Number(item.deviationPct || 0); const cls = deviation >= 20 ? 'above' : deviation <= -20 ? 'below' : 'normal'; const label = deviation >= 20 ? 'Выше нормы' : deviation <= -20 ? 'Ниже нормы' : 'Близко к норме'; return `<div><span>${esc(item.work_name)}: ${productionNum(item.actualRate,2)} ${esc(item.unit)}/чел.-смену</span><small class="production-deviation ${cls}">${label} ${deviation > 0 ? '+' : ''}${deviation}% · старт ${productionNum(item.expectedRate,2)}</small></div>`; }).join('')}</div></td><td>${productionNum(shift.downtime_hours,1)} ч.</td><td>×${productionNum(shift.complexity_factor,2)}</td><td>${esc(shift.notes || '—')}</td><td><button class="button subtle production-delete-shift" data-delete-production-shift="${shift.id}" title="Удалить ошибочный отчёт">Удалить</button></td></tr>`).join('')}</tbody></table></div>` : empty('Смены пока не закрывались','Заполни первый отчёт — CRM сохранит факт и начнёт уточнять производительность.');
  window._strukturaProductionProjects = data.projects;
}
async function openProductionPlan(projectId = '') {
  const allProjects = (await window.crm.listProjects()).filter(project => !['completed','cancelled'].includes(project.status));
  if (!allProjects.length) { toast('Сначала создай объект.'); showView('projects'); return; }
  $('planProjectSelect').innerHTML = productionCurrentProjectOptions(allProjects, projectId || allProjects[0].id);
  await productionLoadPlanForSelected();
  openDialog('productionPlanDialog');
}
async function productionLoadPlanForSelected() {
  const projectId = Number($('planProjectSelect').value);
  if (!projectId) return;
  try {
    const data = await window.crm.getProductionPlan(projectId);
    $('planPeople').value = data.project.planned_people || 5;
    $('planDifficulty').value = String(data.project.complexity_factor || 1);
    productionRenderRows('productionPlanLines','plan',data.lines.map(line => ({ ...line, catalog_id: line.catalog_id, baseline_productivity: line.baseline_productivity })));
  } catch (error) { toast(error.message,true); }
}
async function openProductionShift(projectId = '') {
  const data = await window.crm.productionOverview();
  if (!data.projects.length) { toast('Нет активных объектов. Переведи объект в статус «В работе» и повтори.'); showView('projects'); return; }
  $('shiftProjectSelect').innerHTML = productionCurrentProjectOptions(data.projects, projectId || (data.projects.length === 1 ? data.projects[0].id : ''));
  $('shiftDate').value = dateToday(); $('shiftHours').value = '8'; $('shiftDowntime').value = '0'; $('shiftNotes').value = '';
  await productionLoadShiftRows();
  openDialog('productionShiftDialog');
}
async function productionLoadShiftRows() {
  const projectId = Number($('shiftProjectSelect').value);
  if (!projectId) { $('shiftWorkers').value = '5'; $('shiftDifficulty').value = '1'; productionRenderRows('productionShiftLines','shift',[]); return; }
  const data = await window.crm.getProductionPlan(projectId);
  $('shiftWorkers').value = data.project.planned_people || 5;
  $('shiftDifficulty').value = String(data.project.complexity_factor || 1);
  // Pre-fill the shift with this object's planned work. Leave quantities blank for work not done today.
  productionRenderRows('productionShiftLines','shift',data.lines.length ? data.lines : []);
}
function productionRefreshShiftHint() {
  const target = $('productionShiftHint'); if (!target) return;
  const rows = [...$('productionShiftLines').querySelectorAll('[data-production-edit-row]')];
  let personShifts = 0, records = 0;
  for (const row of rows) {
    const quantity = Number(row.querySelector('[data-prod-field="quantity_done"]')?.value || 0);
    const people = Number(row.querySelector('[data-prod-field="workers_count"]')?.value || 0);
    const hours = Number(row.querySelector('[data-prod-field="hours"]')?.value || 0);
    const output = row.querySelector('[data-production-live-rate]');
    const baseline = Number(row.querySelector('[data-prod-field="baseline_productivity"]')?.value || 0);
    const unit = row.querySelector('[data-prod-field="unit"]')?.value || 'ед.';
    if (quantity > 0 && people > 0 && hours > 0) {
      personShifts += people * hours / 8; records += 1;
      if (output && baseline > 0) {
        const actualRate = quantity / (people * hours / 8);
        const expectedRate = baseline / Number($('shiftDifficulty').value || 1);
        const deviation = (actualRate / expectedRate - 1) * 100;
        const cls = deviation >= 20 ? 'above' : deviation <= -20 ? 'below' : 'normal';
        const label = deviation >= 20 ? 'Выше нормы' : deviation <= -20 ? 'Ниже нормы' : 'Близко к норме';
        output.className = `production-live-rate ${cls}`;
        output.textContent = `Факт: ${productionNum(actualRate,2)} ${unit}/чел.-смену · ${label} ${deviation > 0 ? '+' : ''}${Math.round(deviation)}% (стартовая норма ${productionNum(expectedRate,2)})`;
      }
    } else if (output) { output.className = 'production-live-rate'; output.textContent = 'Внеси объём и трудозатраты — появится сравнение с нормой.'; }
  }
  target.textContent = records ? `В отчёте ${records} видов работ · учтённая трудоёмкость ${productionNum(personShifts,2)} человеко-смен. Выработка сравнивается с исходной нормой; сильные отклонения сохраняются как факт для модели.` : rows.length ? 'Внеси фактические объёмы и трудозатраты. Сумма людей × часов по строкам не может превышать ресурс всей бригады за смену. Норма считается как объём ÷ (рабочие × часы / 8).' : 'Нет строк выполненных работ. Если смена полностью простаивала, укажи причину в примечании и заполни простой.';
}
function productionAddRow(containerId, mode) {
  const container = $(containerId);
  if (container.querySelectorAll('[data-production-edit-row]').length >= (mode === 'plan' ? 100 : 40)) { toast('Достигнут лимит строк в одном плане/отчёте.', true); return; }
  container.insertAdjacentHTML('beforeend', productionEditRow(mode, {}));
  productionSyncRow(container.lastElementChild);
}
$('planAddWorkBtn').addEventListener('click', () => productionAddRow('productionPlanLines','plan'));
$('shiftAddWorkBtn').addEventListener('click', () => productionAddRow('productionShiftLines','shift'));
$('planProjectSelect').addEventListener('change', productionLoadPlanForSelected);
$('shiftProjectSelect').addEventListener('change', () => productionLoadShiftRows().catch(error => toast(error.message,true)));
for (const containerId of ['productionPlanLines','productionShiftLines']) {
  $(containerId).addEventListener('change', e => { const row = e.target.closest('[data-production-edit-row]'); if (row) productionSyncRow(row); });
  $(containerId).addEventListener('input', e => { if (containerId === 'productionShiftLines' && e.target.matches('input')) productionRefreshShiftHint(); });
  $(containerId).addEventListener('click', e => {
    const button = e.target.closest('[data-remove-production-row]'); if (!button) return;
    const row = button.closest('[data-production-edit-row]'); row.remove();
    if (!$(containerId).querySelector('[data-production-edit-row]')) {
      if (containerId === 'productionPlanLines') productionRenderRows(containerId, 'plan', []);
      else productionRefreshShiftHint();
    }
    if (containerId === 'productionShiftLines') productionRefreshShiftHint();
  });
}
$('productionPlanForm').addEventListener('submit', async e => {
  e.preventDefault(); const rows = [...$('productionPlanLines').querySelectorAll('[data-production-edit-row]')];
  const lines = rows.map(row => Object.fromEntries([...row.querySelectorAll('[data-prod-field]')].map(field => [field.dataset.prodField, field.value])));
  try {
    const saved = await window.crm.saveProductionPlan({ project_id: $('planProjectSelect').value, planned_people: Number($('planPeople').value), complexity_factor: Number($('planDifficulty').value), lines });
    closeDialog('productionPlanDialog'); toast(`План сохранён: ${saved.lineCount} позиций. После отчётов остаток и срок будут пересчитываться автоматически.`);
    await refreshProduction();
  } catch (error) { toast(error.message,true); }
});
$('productionShiftForm').addEventListener('submit', async e => {
  e.preventDefault(); const rows = [...$('productionShiftLines').querySelectorAll('[data-production-edit-row]')];
  const lines = rows.map(row => Object.fromEntries([...row.querySelectorAll('[data-prod-field]')].map(field => [field.dataset.prodField, field.value]))).filter(line => Number(line.quantity_done) > 0);
  if (!lines.length && !$('shiftNotes').value.trim()) { toast('Если за смену ничего не сделано, укажи причину в примечании.', true); $('shiftNotes').focus(); return; }
  const data = { project_id: Number($('shiftProjectSelect').value), shift_date: $('shiftDate').value, workers_count: Number($('shiftWorkers').value), shift_hours: Number($('shiftHours').value), downtime_hours: Number($('shiftDowntime').value), complexity_factor: Number($('shiftDifficulty').value), notes: $('shiftNotes').value, lines };
  try {
    const saved = await window.crm.saveWorkShift(data);
    closeDialog('productionShiftDialog'); toast(`Смена №${saved.shift_id} закрыта. Факт сохранён; производственная модель и прогноз обновлены.`);
    await Promise.all([refreshProduction(), refreshEstimateLearningRates()]);
  } catch (error) { toast(error.message,true); }
});
$('productionProjectCards').addEventListener('click', async e => {
  const plan = e.target.closest('[data-production-plan]');
  const shift = e.target.closest('[data-production-shift]');
  try { if (plan) await openProductionPlan(Number(plan.dataset.productionPlan)); if (shift) await openProductionShift(Number(shift.dataset.productionShift)); }
  catch (error) { toast(error.message,true); }
});
$('productionReportPdfBtn').addEventListener('click', async () => {
  try {
    const projects = await window.crm.listProjects();
    const available = projects.filter(project => !['cancelled'].includes(project.status));
    if (!available.length) { toast('Сначала создай объект, чтобы сформировать отчёт.', true); return; }
    $('productionReportProject').innerHTML = available.map(project => `<option value="${project.id}">${esc(project.title)}</option>`).join('');
    $('productionReportStart').value = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    $('productionReportEnd').value = dateToday();
    $('productionReportInternal').checked = false;
    $('productionReportType').value = 'report';
    $('productionReportInternal').disabled = false;
    openDialog('productionReportDialog');
  } catch (error) { toast(`Не удалось подготовить отчёт: ${error.message}`, true); }
});
$('productionReportType').addEventListener('change', () => { const isAct = $('productionReportType').value === 'act'; $('productionReportInternal').disabled = isAct; if (isAct) $('productionReportInternal').checked = false; });
$('productionReportForm').addEventListener('submit', async event => {
  event.preventDefault();
  const documentType = $('productionReportType').value === 'act' ? 'act' : 'report';
  const input = { project_id: Number($('productionReportProject').value), start_date: $('productionReportStart').value, end_date: $('productionReportEnd').value, document_type: documentType, internal: documentType === 'report' && $('productionReportInternal').checked };
  try { const saved = await window.crm.exportProductionReportPdf(input); if (saved?.canceled) return; closeDialog('productionReportDialog'); toast(documentType === 'act' ? 'Акт фиксации выполненных работ в PDF сохранён.' : 'Производственный отчёт в PDF сохранён.'); }
  catch (error) { toast(`Не удалось сформировать PDF: ${error.message}`, true); }
});
$('productionNewShiftBtn').addEventListener('click', () => openProductionShift().catch(error => toast(error.message,true)));
$('productionNewPlanBtn').addEventListener('click', () => openProductionPlan().catch(error => toast(error.message,true)));
$('shiftDifficulty').addEventListener('change', productionRefreshShiftHint);
$('refreshProductionBtn').addEventListener('click', () => refreshProduction().catch(error => toast(error.message,true)));
$('productionHistory').addEventListener('click', async e => { const button = e.target.closest('[data-delete-production-shift]'); if (!button) return; const id = Number(button.dataset.deleteProductionShift); if (!confirm(`Удалить отчёт смены №${id}? Объём исчезнет из истории и будет исключён из расчёта производительности. Это действие нельзя отменить.`)) return; try { await window.crm.deleteWorkShift(id); toast(`Отчёт смены №${id} удалён.`); await Promise.all([refreshProduction(), refreshEstimateLearningRates()]); } catch (error) { toast(error.message,true); } });

$('today').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
window.crm.version().then(v => $('version').textContent = `v${v}`);
function renderUpdateStatus(status = {}) {
  if ($('updateCurrentVersion')) $('updateCurrentVersion').textContent = status.currentVersion ? `v${status.currentVersion}` : '—';
  if ($('updateAvailableVersion')) $('updateAvailableVersion').textContent = status.downloadedVersion ? `v${status.downloadedVersion} · скачано` : status.availableVersion ? `v${status.availableVersion}` : status.state === 'current' ? 'Уже актуальна' : '—';
  if ($('updateStatusMessage')) $('updateStatusMessage').textContent = status.message || 'Проверка ещё не выполнялась';
  const downloading = status.state === 'downloading';
  $('updateProgressTrack').hidden = !downloading;
  $('updateProgressBar').style.width = `${Math.max(0, Math.min(100, Number(status.progress) || 0))}%`;
  $('checkUpdatesBtn').disabled = status.state === 'checking' || downloading;
  $('checkUpdatesBtn').textContent = status.state === 'checking' ? 'Проверяем…' : 'Проверить обновления';
  $('downloadUpdateBtn').hidden = status.state !== 'available';
  $('downloadUpdateBtn').disabled = downloading;
  $('installUpdateBtn').hidden = status.state !== 'downloaded';
}
$('openUpdatesBtn').addEventListener('click', async () => {
  openDialog('updatesDialog');
  try { renderUpdateStatus(await window.crm.updateStatus()); }
  catch (error) { renderUpdateStatus({ state: 'error', message: error.message }); }
});
$('checkUpdatesBtn').addEventListener('click', async () => {
  try { renderUpdateStatus(await window.crm.checkForUpdates()); }
  catch (error) { renderUpdateStatus({ state: 'error', message: error.message }); }
});
$('downloadUpdateBtn').addEventListener('click', async () => {
  $('downloadUpdateBtn').disabled = true;
  try { renderUpdateStatus(await window.crm.downloadUpdate()); }
  catch (error) { renderUpdateStatus({ state: 'error', message: error.message }); }
});
$('installUpdateBtn').addEventListener('click', async () => {
  try { await window.crm.installUpdate(); }
  catch (error) { renderUpdateStatus({ state: 'error', message: error.message }); }
});
window.crm.onUpdateStatus(renderUpdateStatus);

for (const id of ['paymentForm','expenseForm']) { const field = $(id).elements[id === 'paymentForm' ? 'payment_date' : 'expense_date']; field.value = dateToday(); }
const startupSplash = $('startupSplash');
const startupStartedAt = performance.now();
let startupSplashDismissed = false;
function hideStartupSplash() {
  if (startupSplashDismissed || !startupSplash) return;
  startupSplashDismissed = true;
  const minimumMotionMs = 620;
  const elapsed = performance.now() - startupStartedAt;
  window.setTimeout(() => {
    startupSplash.classList.add('is-hidden');
    window.setTimeout(() => startupSplash.remove(), 520);
  }, Math.max(0, minimumMotionMs - elapsed));
}
// Never leave the launch screen covering the app if initial data loading stalls.
window.setTimeout(hideStartupSplash, 8000);
refreshDashboard()
  .catch(e => toast(`Не удалось загрузить обзор: ${e.message}`, true))
  .finally(hideStartupSplash);
refreshSearchApiStatus();
refreshNotificationSettings().catch(() => { $('notificationStatus').textContent = 'Настройки уведомлений недоступны'; });
