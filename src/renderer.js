const $ = (id) => document.getElementById(id);
function applyDataProgressWidths(root = document) { const elements = [...root.querySelectorAll('[data-progress-width]')]; if (root.matches?.('[data-progress-width]')) elements.unshift(root); elements.forEach(el => { const width = Math.max(0, Math.min(100, Number(el.dataset.progressWidth) || 0)); el.style.width = `${width}%`; }); }
const progressWidthObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) applyDataProgressWidths(node); })));
window.addEventListener('DOMContentLoaded', () => { applyDataProgressWidths(); progressWidthObserver.observe(document.body, { childList: true, subtree: true }); }, { once: true });
const serviceLabels = { demolition: 'Демонтаж', finishing: 'Отделочные работы', raised_floor: 'Фальшполы' };
const sourceLabels = { avito: 'Авито', phone: 'Телефон', telegram: 'Telegram', recommendation: 'Рекомендация', website: 'Сайт', other: 'Другое' };
const statusLabels = { new: 'Новая', contacted: 'Связались', measurement: 'Замер', estimate: 'Смета', negotiation: 'Переговоры', won: 'Выиграна', lost: 'Отказ' };
const projectStatusLabels = { planned: 'Запланирован', active: 'В работе', completed: 'Завершён', cancelled: 'Отменён' };
const taskUrgencyLabels = { overdue: 'Просрочена', today: 'Сегодня', upcoming: 'Запланирована', unscheduled: 'Без срока', done: 'Выполнена' };
const expenseLabels = { materials: 'Материалы', workers: 'Рабочие', transport: 'Транспорт', rent: 'Аренда', tools: 'Инструменты', tax: 'Налоги', other: 'Другое' };
const fmt = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n || 0));
let toastTimer;
const PI_ERROR_STORAGE_KEY = 'struktura-pi-error-history-v1';
let piErrorHistory = [];
function piErrorLoad() {
  try {
    const value = JSON.parse(localStorage.getItem(PI_ERROR_STORAGE_KEY) || '[]');
    piErrorHistory = Array.isArray(value) ? value.filter(item => item && typeof item.message === 'string').slice(0, 100) : [];
  } catch { piErrorHistory = []; }
}
function piErrorSave() {
  try { localStorage.setItem(PI_ERROR_STORAGE_KEY, JSON.stringify(piErrorHistory.slice(0, 100))); } catch (error) { console.warn('PI error history could not be saved:', error); }
}
function piErrorExplain(message, context = '') {
  const value = String(message || '').toLocaleLowerCase('ru-RU');
  if (/распределено\s+\d+\s+чел\.-ч.*максимум\s+\d+\s+чел\.-ч/.test(value)) return { title: 'Превышены часы бригады', cause: 'В отчёте смены сумма часов по работам больше доступного фонда времени всей бригады.', action: 'Проверь численность работников и часы по каждой работе. Часы одного работника за одну смену нельзя учитывать дважды.' };
  if (/constraint failed|unique constraint|already exists|уже существует|уникальн/.test(value)) return { title: 'Конфликт или повтор записи', cause: 'CRM получила запись, которая нарушает правило уникальности базы данных либо дублирует существующие данные.', action: 'Проверь, нет ли такой позиции или объекта в списке. Если дубля нет, открой ошибку и сохрани её технические подробности для диагностики.' };
  if (/not null constraint|cannot be null|required|обязательн|заполните/.test(value)) return { title: 'Не заполнено обязательное поле', cause: 'При сохранении одно из обязательных значений оказалось пустым или не было передано форме.', action: 'Проверь обязательные поля формы, включая строки работ, объект и числовые значения. Не удаляй введённые данные до проверки.' };
  if (/foreign key constraint|no such project|project_id|объект не найден/.test(value)) return { title: 'Связанный объект не найден', cause: 'Сохранение ссылается на объект или запись, которую CRM не смогла найти либо связать.', action: 'Выбери объект заново из списка и повтори действие. Если ошибка повторяется, проверь, что объект существует и не был удалён.' };
  if (/invalid|must be|out of range|greater than|less than|неверн|недопустим|должно быть|диапазон/.test(value)) return { title: 'Некорректное значение', cause: 'Одно из введённых значений не соответствует ожидаемому формату или допустимому диапазону.', action: 'Проверь числа, единицы измерения и ограничения полей. Для плана работ проверь названия работ, объём и единицы измерения; численность бригады должна быть положительной.' };
  if (/database|sqlite|disk|locked|readonly|баз[ае] данных/.test(value)) return { title: 'Проблема локальной базы данных', cause: 'Операция могла быть заблокирована базой, хранилищем или доступом к файлу данных.', action: 'Не удаляй файлы базы. Закрой повторные операции, проверь свободное место и права доступа, затем повтори действие. Перед дальнейшими действиями создай резервную копию.' };
  if (/ipc|channel|renderer|undefined|null|is not a function|cannot read properties|не определено/.test(value)) return { title: 'Ошибка интерфейса или связи модулей', cause: 'Интерфейс получил неожиданное значение или не смог вызвать нужную функцию приложения.', action: 'Повтори действие один раз. Если ошибка повторяется, зафиксируй раздел, последовательность действий и технический текст ниже — это потребуется для исправления программы.' };
  return { title: 'Нужна дополнительная диагностика', cause: 'По доступному сообщению нельзя надёжно установить точную причину. ПИ не будет выдавать предположение за установленный факт.', action: 'Проверь заполнение формы и повтори действие. Если сбой повторится, передай разработчику технический текст ошибки, раздел и действие, после которого она появилась.' };
}
function piErrorUserMessage(message) {
  const raw = String(message || 'Неизвестная ошибка');
  const crewHours = raw.match(/Распределено\s+(\d+)\s+чел\.-ч,\s+а вся бригада могла отработать максимум\s+(\d+)\s+чел\.-ч/i);
  if (crewHours) return `Отчёт смены не сохранён: распределено ${crewHours[1]} человеко-часов, а доступно ${crewHours[2]}. Проверь численность бригады и часы по каждой работе — одни и те же часы нельзя учитывать дважды.`;
  if (/Error invoking remote method/i.test(raw)) {
    const inner = raw.replace(/^Error invoking remote method ['"][^'"]+['"]:\s*Error:\s*/i, '').trim();
    if (inner && !/^(at\s|node:|\w+Error:)/i.test(inner) && !inner.includes('\n    at ')) return inner.slice(0, 350);
    return 'Не удалось выполнить операцию. ПИ сохранила подробности для диагностики; проверь данные формы и повтори действие.';
  }
  if (/\b(?:TypeError|ReferenceError|SyntaxError|RangeError):|\n\s*at\s|node:internal|\.cjs:\d+:\d+/.test(raw)) return 'Не удалось выполнить операцию из-за внутренней ошибки. ПИ сохранила подробности для диагностики; введённые данные не удаляй и повтори действие позже.';
  return raw.replace(/^Error:\s*/i, '').slice(0, 500);
}
function piRecordError(message, source = 'Операция', error = null) {
  const raw = String(message || 'Неизвестная ошибка').slice(0, 1200);
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(), source: String(source || 'CRM').slice(0, 100), message: raw, userMessage: piErrorUserMessage(raw), stack: String(error?.stack || '').slice(0, 3000), explanation: piErrorExplain(raw, source) };
  const previous = piErrorHistory[0];
  if (previous && previous.message === item.message && Date.now() - new Date(previous.at).getTime() < 2500) return previous;
  piErrorHistory.unshift(item);
  piErrorHistory = piErrorHistory.slice(0, 100);
  piErrorSave();
  piUpdateErrorBadge();
  return item;
}
function piRenderErrorHistory(selectedId) {
  const list = $('piErrorList'), detail = $('piErrorDetail'), count = $('piErrorCount');
  if (!list || !detail || !count) return;
  count.textContent = String(piErrorHistory.length);
  if (!piErrorHistory.length) {
    list.innerHTML = '<div class="pi-error-empty">Ошибок пока нет. Если появится красное уведомление, запись сохранится здесь.</div>';
    detail.innerHTML = '<h3>ПИ готова помочь</h3><p>Выбери ошибку слева, чтобы увидеть возможную причину и порядок действий.</p>';
    return;
  }
  list.innerHTML = piErrorHistory.map(item => '<button type="button" class="pi-error-entry' + (item.id === selectedId ? ' active' : '') + '" data-pi-error-id="' + esc(item.id) + '"><strong>' + esc(item.explanation?.title || 'Ошибка') + '</strong><span>' + esc(item.source) + ' · ' + esc(new Date(item.at).toLocaleString('ru-RU')) + '</span><small>' + esc(item.userMessage || piErrorUserMessage(item.message)) + '</small></button>').join('');
  const item = piErrorHistory.find(entry => entry.id === selectedId) || piErrorHistory[0];
  detail.innerHTML = '<div class="pi-error-severity">ЗАПИСЬ СОХРАНЕНА</div><h3>' + esc(item.explanation?.title || 'Ошибка') + '</h3><p><strong>Что произошло</strong><br>' + esc(item.explanation?.cause || 'Причина не определена.') + '</p><p><strong>Что сделать</strong><br>' + esc(item.explanation?.action || 'Повтори действие и сохрани технические подробности.') + '</p><p class="pi-error-user-message">' + esc(item.userMessage || piErrorUserMessage(item.message)) + '</p><details class="pi-technical-details"><summary>Технические подробности для диагностики</summary><p><strong>Сообщение системы</strong></p><pre>' + esc(item.message) + '</pre>' + (item.stack ? '<p><strong>Стек ошибки</strong></p><pre>' + esc(item.stack) + '</pre>' : '') + '</details><p class="pi-error-context">Раздел / действие: ' + esc(item.source) + ' · ' + esc(new Date(item.at).toLocaleString('ru-RU')) + '</p>';
}
function openPiErrorHistory(selectedId) {
  piRenderErrorHistory(selectedId);
  const dialog = $('piErrorHistoryDialog');
  if (dialog && !dialog.open) dialog.showModal();
}
piErrorLoad();
function toast(message, error = false) {
  const node = $('toast');
  const visibleMessage = error ? piErrorUserMessage(message) : String(message ?? '');
  node.textContent = visibleMessage;
  node.className = `toast show${error ? ' error' : ''}`;
  if (error) {
    piRecordError(message, document.querySelector('.view.active')?.id?.replace('view-', '') || 'CRM');
    node.title = 'Ошибка сохранена в истории ПИ';
  } else node.removeAttribute('title');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.className = 'toast', 3500);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dateToday() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.nav-item[data-view]').forEach(b => { const active = b.dataset.view === name; b.classList.toggle('active', active); if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const titles = { dashboard: 'Обзор бизнеса', leads: 'Заявки', clients: 'Клиенты', projects: 'Объекты', finance: 'Финансы', production: 'Производство · План / факт', browser: 'Браузер и поиск заказчиков', prospects: 'Поиск клиентов', tasks: 'План действий', reports: 'Отчёты', settings: 'Настройки', plans: 'Тариф и интеграции', about: 'О продукте STRUKTURA' };
  $('pageTitle').textContent = titles[name] || 'STRUKTURA CRM';
  const loaders = { dashboard: refreshDashboard, leads: refreshLeads, clients: refreshClients, projects: refreshProjects, production: refreshProduction, finance: refreshFinance, prospects: refreshProspects, tasks: refreshTasks, reports: refreshReports };
  if (name === 'settings') refreshPinSettings().catch(() => toast('Не удалось загрузить настройки безопасности. Попробуй открыть раздел ещё раз.', true));
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
  // Re-evaluate business signals when the user moves between CRM sections.
  if (name !== 'dashboard') refreshPiCoach().catch(() => {});
}
// Register primary navigation before the rest of renderer initialization. If a later widget
// fails during setup, the workspace navigation remains usable and the error is observable.
document.addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  event.preventDefault();
  showView(button.dataset.view);
}, true);
window.addEventListener('error', event => {
  console.error('Struktura CRM renderer error:', event.error || event.message);
  piRecordError(event.message || event.error?.message || 'Необработанная ошибка интерфейса', 'Необработанная ошибка интерфейса', event.error);
  const toastNode = $('toast');
  if (toastNode) toast('Ошибка интерфейса. ПИ сохранила её в истории ошибок.', true);
});
window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  const message = reason?.message || String(reason || 'Необработанная ошибка асинхронной операции');
  piRecordError(message, 'Необработанная асинхронная операция', reason);
  console.error('Struktura CRM unhandled rejection:', reason);
});

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
  const now = new Date();
  const today = dateToday();
  const taskBucket = task => {
    if (task.is_done) return 'done';
    if (!task.due_at) return 'unscheduled';
    const raw = String(task.due_at), dueDate = raw.slice(0,10);
    if (raw.length <= 10) return dueDate < today ? 'overdue' : dueDate === today ? 'today' : 'upcoming';
    const due = new Date(raw);
    if (!Number.isNaN(due.getTime()) && due < now) return 'overdue';
    return dueDate === today ? 'today' : 'upcoming';
  };
  const overdue = allRows.filter(t => taskBucket(t) === 'overdue').length;
  const dueToday = allRows.filter(t => taskBucket(t) === 'today').length;
  const unscheduled = allRows.filter(t => !t.is_done && !t.due_at).length;
  const done = allRows.filter(t => t.is_done).length;
  $('taskOverdueCount').textContent = overdue; $('taskTodayCount').textContent = dueToday; $('taskUnscheduledCount').textContent = unscheduled; $('taskDoneCount').textContent = done;
  $('taskNavCount').textContent = allRows.filter(t => !t.is_done).length;
  const q = ($('taskSearch')?.value || '').toLowerCase();
  const filtered = rows.filter(t => `${t.title} ${t.lead_title || ''} ${t.project_title || ''}`.toLowerCase().includes(q));
  $('tasksTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Задача</th><th>Связано с</th><th>Срок</th><th>Статус</th><th>Действие</th></tr></thead><tbody>${filtered.map(t => { const due = t.due_at ? new Date(t.due_at).toLocaleString('ru-RU', { dateStyle:'medium', timeStyle: String(t.due_at).includes('T') ? 'short' : undefined }) : 'Не назначен'; const related = [t.lead_title && `Заявка: ${t.lead_title}`, t.project_title && `Объект: ${t.project_title}`].filter(Boolean).join(' · ') || '—'; return `<tr><td>${esc(t.title)}</td><td>${esc(related)}</td><td>${esc(due)}</td><td><span class="pill ${t.urgency === 'overdue' ? 'lost' : t.urgency === 'done' ? 'won' : t.urgency === 'today' ? 'new' : 'contacted'}">${esc(taskUrgencyLabels[t.urgency] || 'Активна')}</span></td><td><div class="table-actions"><button type="button" class="button subtle compact" data-edit-task="${t.id}">Изменить</button>${t.is_done ? `<button class="button subtle compact task-toggle" data-task-id="${t.id}" data-task-done="0">Вернуть</button>` : `<button class="button subtle compact task-toggle" data-task-id="${t.id}" data-task-done="1">Выполнено</button>`}</div></td></tr>`; }).join('')}</tbody></table>` : empty('Задач пока нет','Создай следующий шаг по заявке или объекту.');
  // Keep closed records selectable: editing a task must not erase its existing relationship.
  $('taskLeadSelect').innerHTML = `<option value="">Без заявки</option>${leads.map(l => `<option value="${l.id}">${esc(l.title)}${['won','lost'].includes(l.status) ? ' · закрыта' : ''}</option>`).join('')}`;
  $('taskProjectSelect').innerHTML = `<option value="">Без объекта</option>${projects.map(p => `<option value="${p.id}">${esc(p.title)}${['completed','cancelled'].includes(p.status) ? ' · завершён' : ''}</option>`).join('')}`;
  document.querySelectorAll('.task-toggle').forEach(button => button.addEventListener('click', async () => { try { await window.crm.completeTask({ id: Number(button.dataset.taskId), is_done: button.dataset.taskDone === '1' }); toast(button.dataset.taskDone === '1' ? 'Задача закрыта.' : 'Задача возвращена в работу.'); await refreshTasks(); } catch (e) { toast(e.message, true); } }));
}
function renderProductionIntelligence(data, summaryId, alertsId) {
  const builder = window.StrukturaProductionIntelligence?.buildProductionIntelligence;
  if (typeof builder !== 'function') return;
  const result = builder(data);
  const summary = $(summaryId), alerts = $(alertsId);
  if (summary) {
    const q = result.dataQuality || {};
    const quality = `Качество данных: ${Number(q.validPerformanceObservations || 0)} пригодных наблюдений${Number(q.invalidPerformanceObservations || 0) ? `, ${Number(q.invalidPerformanceObservations)} исключено из-за неполных или некорректных данных` : ''}. Сравнение устойчивой выработки доступно для ${Number(q.comparableWorkTypes || 0)} видов работ.`;
    const calibration = (result.learningModels || []).filter(model => model.status === 'candidate').slice(0, 3)
      .map(model => `${model.workName}: предложенный коэффициент ${model.suggestedFactor} (${model.observations} наблюдений)`).join('; ');
    summary.textContent = `${result.summary} ${quality} ${result.learningSummary || ''}${calibration ? ` Кандидаты: ${calibration}.` : ''}`;
  }
  if (!alerts) return;
  alerts.innerHTML = result.alerts.length
    ? result.alerts.slice(0, 8).map(alert => `<article class="pi-alert ${alert.level === 'danger' ? 'danger' : 'warning'}"><strong>${esc(alert.title)}</strong><span>${esc(alert.message)}</span></article>`).join('')
    : '<div class="pi-no-alerts">По введённым данным явных отклонений не найдено. Это не гарантия отсутствия проблем — полнота учёта важна.</div>';
}
async function refreshNotificationSettings() {
  const settings = await window.crm.getNotificationSettings();
  const form = $('notificationSettingsForm');
  for (const key of ['enabled','taskDeadlines','missingShiftReports','overdueProjects','weekdaysOnly']) form.elements[key].checked = Boolean(settings[key]);
  for (const key of ['startHour','endHour','staleShiftDays','repeatEveryHours']) form.elements[key].value = settings[key];
  $('notificationStatus').textContent = settings.enabled ? `Включены · ${String(settings.startHour).padStart(2,'0')}:00–${String(settings.endHour).padStart(2,'0')}:00 · проверка каждые 15 мин.` : 'Уведомления выключены';
}
let piCoachInsights = [];
let piCoachContext = {};
let piCoachIndex = 0;
let piCoachLastAutoAt = 0;
let piCoachFetchPromise = null;
let piCoachVoiceEnabled = localStorage.getItem('struktura-pi-voice-enabled') !== '0';
function piCoachTodayKey() { return dateToday(); }
function piCoachSeenKey() { return 'struktura-pi-seen-' + piCoachTodayKey(); }
function piCoachSeenIds() { try { const value = JSON.parse(localStorage.getItem(piCoachSeenKey()) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function piCoachMarkSeen(id) { const seen = new Set(piCoachSeenIds()); seen.add(id); localStorage.setItem(piCoachSeenKey(), JSON.stringify([...seen].slice(-100))); }
function piCoachCurrent() { return piCoachInsights[piCoachIndex] || null; }
function piCoachSpeak(text) {
  if (!piCoachVoiceEnabled || !('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = 'ru-RU'; utterance.rate = 0.96; utterance.pitch = 1.04; utterance.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const russian = voices.find(voice => /^ru(-|_)/i.test(voice.lang)) || voices.find(voice => /russian|русск/i.test(voice.name));
  if (russian) utterance.voice = russian;
  window.speechSynthesis.speak(utterance);
}
function piCoachRender() {
  const item = piCoachCurrent();
  if (!item) return;
  $('piCoachPriority').textContent = ({ danger: 'ТРЕБУЕТ ВНИМАНИЯ', warning: 'ПРОВЕРИТЬ', opportunity: 'ВОЗМОЖНОСТЬ', info: 'АНАЛИЗ ДАННЫХ' })[item.severity] || 'АНАЛИЗ ДАННЫХ';
  $('piCoachPriority').className = 'pi-coach-priority ' + item.severity;
  $('piCoachTitle').textContent = item.title;
  $('piCoachSpoken').textContent = item.spoken;
  $('piCoachEvidence').textContent = item.detail;
  $('piCoachEvidenceWrap').open = false;
  $('piCoachActionBtn').textContent = item.actionLabel || 'Разобрать';
  $('piCoachNextBtn').textContent = piCoachInsights.length > 1 ? 'Следующий совет · ' + (piCoachIndex + 1) + '/' + piCoachInsights.length + ' →' : 'Других сигналов нет';
  $('piCoachNextBtn').disabled = piCoachInsights.length < 2;
  $('piCoachVoiceToggle').textContent = piCoachVoiceEnabled ? 'Голос: включён' : 'Голос: выключен';
  $('piCoachVoiceToggle').setAttribute('aria-pressed', String(piCoachVoiceEnabled));
}
function piCoachOpen(index = piCoachIndex, speak = false) {
  if (!piCoachInsights.length) return;
  piCoachIndex = (index + piCoachInsights.length) % piCoachInsights.length;
  piCoachRender();
  $('piCoachPopover').hidden = false;
  $('piCoachAvatarBtn').setAttribute('aria-expanded', 'true');
  if (speak && piCoachVoiceEnabled) piCoachSpeak(piCoachCurrent()?.spoken);
}
function piCoachClose() {
  $('piCoachPopover').hidden = true;
  $('piCoachAvatarBtn').setAttribute('aria-expanded', 'false');
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
async function refreshPiCoach(options = {}) {
  if (piCoachFetchPromise) return piCoachFetchPromise;
  piCoachFetchPromise = (async () => {
    const calls = await Promise.allSettled([
      window.crm.summary(), window.crm.listProjects(), window.crm.listLeads(),
      window.crm.listTasks({ filter: 'all' }), window.crm.listCommercialOrders({}),
      window.crm.productionOverview(), window.crm.financeInsights(), window.crm.estimateHistory(), window.crm.piCoachHistory(),
      window.crm.listPayments(), window.crm.listExpenses(), window.crm.listIncomeRecords()
    ]);
    const value = (index, fallback) => calls[index].status === 'fulfilled' ? calls[index].value : fallback;
    const [summary, projects, leads, tasks, orders, production, finance, quotes, coachHistory, payments, expenses, incomeRecords] = [
      value(0, {}), value(1, []), value(2, []), value(3, []), value(4, []),
      value(5, { projects: [], history: [], totals: {} }), value(6, {}),
      value(7, []), value(8, []), value(9, []), value(10, []), value(11, [])
    ];
    production.history = coachHistory;
    const builder = window.StrukturaPiCoach?.buildPiCoachInsights;
    if (typeof builder !== 'function') return;
    piCoachContext = { summary, projects, leads, tasks, orders, production, finance, quotes, payments, expenses, incomeRecords };
    const next = builder(piCoachContext);
    const oldCurrent = piCoachCurrent()?.id;
    piCoachInsights = next;
    const oldIndex = oldCurrent ? piCoachInsights.findIndex(item => item.id === oldCurrent) : -1;
    piCoachIndex = oldIndex >= 0 ? oldIndex : 0;
    const now = Date.now();
    const seen = new Set(piCoachSeenIds());
    const unseen = piCoachInsights.find(item => !seen.has(item.id));
    if (!$('piCoachPopover').hidden) {
      if (options.force === true && unseen) {
        piCoachIndex = piCoachInsights.findIndex(item => item.id === unseen.id);
        piCoachOpen(piCoachIndex, true);
        piCoachMarkSeen(unseen.id);
      } else piCoachRender();
      return;
    }
    const canAutoOpen = !piCoachLastAutoAt || now - piCoachLastAutoAt >= 20 * 60 * 1000;
    if (unseen && canAutoOpen && (options.force === true || piCoachLastAutoAt === 0 || unseen.severity === 'danger' || unseen.priority >= 88)) {
      piCoachIndex = piCoachInsights.findIndex(item => item.id === unseen.id);
      piCoachOpen(piCoachIndex, true);
      piCoachMarkSeen(unseen.id);
      piCoachLastAutoAt = now;
    }
  })().finally(() => { piCoachFetchPromise = null; });
  return piCoachFetchPromise;
}
$('piCoachAvatarBtn').addEventListener('click', () => {
  if ($('piCoachPopover').hidden) piCoachOpen(piCoachIndex, true);
  else piCoachSpeak(piCoachCurrent()?.spoken);
});
$('piCoachCloseBtn').addEventListener('click', piCoachClose);
$('piCoachSpeakBtn').addEventListener('click', () => {
  if (!piCoachVoiceEnabled) {
    piCoachVoiceEnabled = true; localStorage.setItem('struktura-pi-voice-enabled', '1'); piCoachRender();
  }
  piCoachSpeak(piCoachCurrent()?.spoken);
});
$('piCoachVoiceToggle').addEventListener('click', () => {
  piCoachVoiceEnabled = !piCoachVoiceEnabled;
  localStorage.setItem('struktura-pi-voice-enabled', piCoachVoiceEnabled ? '1' : '0');
  if (!piCoachVoiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  piCoachRender();
  if (piCoachVoiceEnabled) piCoachSpeak(piCoachCurrent()?.spoken);
});
function piCoachNormalize(value) {
  return String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function piCoachFindInsight(views) {
  return piCoachInsights.find(item => views.includes(item.view)) || null;
}
function piCoachAnswerVoice(rawQuery) {
  const query = piCoachNormalize(rawQuery);
  if (!query) { piCoachSpeak('Я не расслышала вопрос. Повтори, пожалуйста.'); return; }
  if (/^(дальше|следующ|еще совет|ещё совет)/u.test(query)) {
    if (piCoachInsights.length > 1) piCoachOpen(piCoachIndex + 1, true);
    else piCoachSpeak('Сейчас у меня нет другого подтверждённого сигнала. После новых данных я обновлю советы.');
    return;
  }
  if (/подроб|почему|на чем основан|доказательств/u.test(query)) {
    piCoachSpeak(piCoachCurrent()?.detail || 'Сначала загрузи данные бизнеса.');
    return;
  }
  if (/привет|здравств|что ты умеешь|помоги|чем можешь/u.test(query)) {
    piCoachSpeak('Я ПИ, производственный интеллект STRUKTURA. Я сопоставляю сохранённые объекты, договоры, коммерческие предложения, платежи, расходы, заявки, задачи и отчёты смен. Могу подсветить риск и объяснить, на каких данных основан совет. Я не придумываю отсутствующие цифры.');
    return;
  }
  const sections = [
    { pattern: /финанс|деньг|касс|платеж|оплат|долг/u, view: 'finance', label: 'финансам' },
    { pattern: /производств|смен|выработ|просто|план факт/u, view: 'production', label: 'производству' },
    { pattern: /заявк|клиент|воронк|лид/u, view: 'leads', label: 'заявкам' },
    { pattern: /задач|просроч/u, view: 'tasks', label: 'задачам' },
    { pattern: /заказ|тендер/u, view: 'browser', label: 'заказам' },
    { pattern: /кп|смет|предложен|марж|себестоим|цен/u, view: 'projects', label: 'сметам и КП' }
  ];
  const section = sections.find(item => item.pattern.test(query));
  const projectList = Array.isArray(piCoachContext.projects) ? piCoachContext.projects : [];
  const project = projectList.find(item => {
    const title = piCoachNormalize(item.title);
    return title.length >= 3 && query.includes(title);
  }) || projectList.find(item => {
    const tokens = piCoachNormalize(item.title).split(' ').filter(word => word.length >= 4);
    return tokens.some(word => query.split(' ').includes(word));
  });
  if (project && (/объект|договор|проект|прибыл|расход|оплат|сколько|что по/u.test(query) || !section)) {
    const contract = Number(project.contract_rub) || 0;
    const received = Number(project.received_rub) || 0;
    const paid = Number(project.paid_expenses_rub) || 0;
    const planned = Number(project.planned_expenses_rub) || 0;
    const remaining = Math.max(0, contract - received);
    const margin = contract > 0 ? Math.round((contract - paid - planned) / contract * 100) : null;
    const prodProject = (piCoachContext.production?.projects || []).find(item => Number(item.id) === Number(project.id));
    let answer = 'По объекту «' + project.title + '». Статус: ' + (project.status || 'не указан') + '. Договор: ' + fmt(contract) + '. Получено: ' + fmt(received) + '. Остаток к получению по договору: ' + fmt(remaining) + '. Оплаченные расходы: ' + fmt(paid) + '. Неоплаченные или запланированные расходы: ' + fmt(planned) + '.';
    if (margin !== null) answer += ' Расчётный запас договора после этих расходов — ' + margin + ' процентов. Это не окончательная прибыль: могут быть не внесены налоги и другие затраты.';
    if (prodProject) answer += prodProject.planCount > 0 ? ' В производственном плане ' + prodProject.planCount + ' видов работ; отчётов смен: ' + prodProject.shiftCount + '. Последний отчёт: ' + (prodProject.lastShiftDate || 'не указан') + '.' : ' Производственный план пока не заполнен.';
    piCoachSpeak(answer);
    return;
  }
  if (section) {
    if (/открой|покажи|перейди/u.test(query)) showView(section.view);
    const insight = piCoachFindInsight([section.view]);
    if (section.view === 'finance' && !piCoachInsights.some(item => item.view === 'finance')) {
      const finance = piCoachContext.finance || {};
      const forecast = Array.isArray(finance.forecasts) ? finance.forecasts.find(item => Number(item.days) === 7) : null;
      piCoachSpeak('По финансам. Расчётный денежный остаток: ' + fmt(finance.cash) + '. Остаток по договорам к получению: ' + fmt(finance.receivablesTotal) + '. Неоплаченные расходы: ' + fmt(finance.unpaidTotal) + '.' + (forecast ? ' Прогноз остатка на семь дней: ' + fmt(forecast.projectedCash) + ', при условии что учтённые поступления и расходы произойдут в срок.' : ' Прогноз на семь дней недоступен.'));
      return;
    }
    if (section.view === 'production' && !piCoachInsights.some(item => item.view === 'production')) {
      const totals = piCoachContext.production?.totals || {};
      piCoachSpeak('По производству: активных объектов в плане ' + ((piCoachContext.production?.projects || []).length) + ', отчётов смен в доступной истории ' + (totals.shifts || 0) + ', учтённых записей по работам ' + (totals.work_records || 0) + '. Пока нет отдельного сигнала с более высоким приоритетом.');
      return;
    }
    if (section.view === 'projects') {
      const quotes = piCoachContext.quotes || [];
      if (quotes.length) {
        const quote = quotes[0];
        piCoachSpeak('В архиве ' + quotes.length + ' коммерческих предложений. Последнее — «' + (quote.title || 'без названия') + '», дата ' + String(quote.prepared_at || '').slice(0, 10) + '. Цена ' + fmt(quote.revenue_rub) + ', расчётная прибыль ' + fmt(quote.profit_rub) + ', маржа ' + Number(quote.margin_pct || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' процентов. Архив включает PDF, сохранённые после версии 1.16.0.');
        return;
      }
    }
    if (insight) piCoachSpeak(insight.spoken);
    else piCoachSpeak('По ' + section.label + ' сейчас нет отдельного подтверждённого предупреждения. Это не значит, что проблем нет: я опираюсь только на внесённые данные.');
    return;
  }
  piCoachSpeak('Я пока не поняла вопрос. Спроси, например: что по финансам, что по производству, сколько КП в архиве, или назови объект.');
}
$('piCoachListenBtn').addEventListener('click', () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    piCoachSpeak('Голосовой ввод не поддерживается этой сборкой Windows или движком речи. Озвучивание советов доступно кнопкой Послушать.');
    toast('Голосовой ввод недоступен в этой сборке. Озвучивание советов работает отдельно.', true);
    return;
  }
  const button = $('piCoachListenBtn');
  const recognition = new Recognition();
  recognition.lang = 'ru-RU'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  button.disabled = true; button.textContent = '● Слушаю…';
  recognition.onresult = event => {
    const query = event.results?.[0]?.[0]?.transcript || '';
    button.textContent = '🎙 Сказать ПИ';
    piCoachAnswerVoice(query);
  };
  recognition.onerror = event => {
    button.textContent = '🎙 Сказать ПИ';
    if (event.error !== 'no-speech' && event.error !== 'aborted') toast('Не удалось распознать речь: ' + event.error, true);
    else piCoachSpeak('Я не расслышала вопрос. Нажми на микрофон и повтори.');
  };
  recognition.onend = () => { button.disabled = false; button.textContent = '🎙 Сказать ПИ'; };
  try { recognition.start(); }
  catch (error) { button.disabled = false; button.textContent = '🎙 Сказать ПИ'; toast('Не удалось запустить микрофон: ' + error.message, true); }
});

$('piCoachNextBtn').addEventListener('click', () => {
  if (piCoachInsights.length > 1) piCoachOpen(piCoachIndex + 1, true);
});
$('piCoachActionBtn').addEventListener('click', () => {
  const item = piCoachCurrent();
  if (!item) return;
  piCoachClose();
  showView(item.view || 'dashboard');
});
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = () => {};

async function refreshDashboard() {
  const s = await window.crm.summary();
  $('statLeads').textContent = s.leads; $('statProjects').textContent = s.projects;
  $('statReceived').textContent = fmt(s.received); $('statCash').textContent = fmt(s.cash);
  $('leadNavCount').textContent = s.leads;
  const leads = await window.crm.listLeads();
  $('recentLeads').innerHTML = leads.length ? `<table class="data-table"><thead><tr><th>Заявка</th><th>Услуга</th><th>Источник</th><th>Статус</th><th>Бюджет</th></tr></thead><tbody>${leads.slice(0,5).map(l => `<tr><td>${esc(l.title)}</td><td>${esc(serviceLabels[l.service] || l.service)}</td><td>${esc(sourceLabels[l.source] || l.source)}</td><td><span class="pill ${esc(l.status)}">${esc(statusLabels[l.status] || l.status)}</span></td><td>${fmt(l.budget_rub)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty-state"><div class="empty-icon">◉</div><strong>Пока нет заявок</strong><span>Добавь первое обращение — оно появится здесь.</span><button class="button primary" data-goto="leads">Добавить заявку</button></div>`;
  try { const production = await window.crm.productionOverview(); renderProductionIntelligence(production, 'piHomeSummary', 'piHomeAlerts'); } catch (error) { $('piHomeSummary').textContent = 'Не удалось загрузить данные производства.'; $('piHomeAlerts').innerHTML = `<div class="pi-no-alerts">${esc(error.message)}</div>`; }
  refreshPiCoach().catch(() => {});
}
async function refreshLeads() {
  const rows = await window.crm.listLeads(); const q = ($('leadSearch')?.value || '').toLowerCase(); const status = $('leadStatusFilter')?.value || '';
  const filtered = rows.filter(l => `${l.title} ${l.address} ${l.notes} ${sourceLabels[l.source]}`.toLowerCase().includes(q) && (!status || l.status === status));
  $('leadsTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Заявка</th><th>Услуга</th><th>Источник</th><th>Статус</th><th>Бюджет</th><th>Адрес</th><th>Создана</th><th>Действия</th></tr></thead><tbody>${filtered.map(l => `<tr><td>${esc(l.title)}</td><td>${esc(serviceLabels[l.service] || l.service)}</td><td>${esc(sourceLabels[l.source] || l.source)}</td><td><select class="lead-status-select" data-lead-status="${l.id}" aria-label="Статус заявки: ${esc(l.title)}">${Object.entries(statusLabels).map(([value,label]) => `<option value="${value}" ${l.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td>${fmt(l.budget_rub)}</td><td>${esc(l.address || '—')}</td><td>${esc(String(l.created_at).slice(0,10))}</td><td><button type="button" class="button subtle compact" data-edit-lead="${l.id}">Изменить</button></td></tr>`).join('')}</tbody></table>` : empty('Заявок не найдено','Создай заявку или измени фильтр.');
}
async function refreshClients() {
  const rows = await window.crm.listClients(); const q = ($('clientSearch')?.value || '').toLowerCase();
  const filtered = rows.filter(c => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q));
  $('clientsTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Клиент</th><th>Телефон</th><th>Email</th><th>Тип</th><th>Добавлен</th><th>Действия</th></tr></thead><tbody>${filtered.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.phone || '—')}</td><td>${esc(c.email || '—')}</td><td>${c.client_type === 'company' ? 'Компания' : 'Частное лицо'}</td><td>${esc(String(c.created_at).slice(0,10))}</td><td><button type="button" class="button subtle compact" data-edit-client="${c.id}">Изменить</button></td></tr>`).join('')}</tbody></table>` : empty('Клиентов пока нет','Добавь первый контакт в свою базу.');
}
async function refreshProjects() {
  const rows = await window.crm.listProjects(); const q = ($('projectSearch')?.value || '').toLowerCase();
  const filtered = rows.filter(p => `${p.title} ${p.address} ${p.client_name || ''}`.toLowerCase().includes(q));
  $('projectsTable').innerHTML = filtered.length ? `<table class="data-table"><thead><tr><th>Объект</th><th>Услуга</th><th>Статус</th><th>Договор</th><th>Получено</th><th>Оплачено расходов</th><th>Долг клиента</th><th>Действия</th></tr></thead><tbody>${filtered.map(p => `<tr><td>${esc(p.title)}<small class="table-sub">${esc(p.address || 'Адрес не указан')}</small></td><td>${esc(serviceLabels[p.service] || p.service)}</td><td><select class="project-status-select" data-project-status="${p.id}" aria-label="Статус объекта: ${esc(p.title)}">${Object.entries(projectStatusLabels).map(([value,label]) => `<option value="${value}" ${p.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td>${fmt(p.contract_rub)}</td><td>${fmt(p.received_rub)}</td><td>${fmt(p.paid_expenses_rub)}</td><td>${fmt(Math.max(0,Number(p.contract_rub)-Math.max(0,Number(p.received_rub))))}</td><td><button type="button" class="button subtle compact" data-edit-project="${p.id}">Изменить</button> <button type="button" class="button subtle compact" data-delete-project="${p.id}">Удалить</button></td></tr>`).join('')}</tbody></table>` : empty('Объектов пока нет','Добавь объект, чтобы учитывать договоры, платежи и расходы.');
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
  $('receivablesDetail').textContent = `${data.unscheduledReceivables.length} объектов без графика платежей`;
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
  const [summary, payments, expenses, insights, incomeRecords] = await Promise.all([window.crm.summary(), window.crm.listPayments(), window.crm.listExpenses(), window.crm.financeInsights(), window.crm.listIncomeRecords()]);
  renderFinanceInsights(insights);
  $('financeReceived').textContent = fmt(summary.received); $('financeExpenses').textContent = fmt(summary.expenses); $('financeCash').textContent = fmt(summary.cash);
  const now = new Date(), monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, yearKey = String(now.getFullYear());
  const totalFor = rows => rows.reduce((sum,row) => sum + Number(row.amount_rub || 0),0);
  const monthRows = incomeRecords.filter(row => String(row.income_date || '').startsWith(monthKey));
  const yearRows = incomeRecords.filter(row => String(row.income_date || '').startsWith(yearKey));
  $('incomeMonthTotal').textContent = fmt(totalFor(monthRows)); $('incomeYearTotal').textContent = fmt(totalFor(yearRows));
  $('incomeMonthDetail').textContent = `Официально: ${fmt(totalFor(monthRows.filter(row=>row.record_type==='official')))} · внутренний учёт: ${fmt(totalFor(monthRows.filter(row=>row.record_type==='internal')))}`;
  $('incomeYearDetail').textContent = `Официально: ${fmt(totalFor(yearRows.filter(row=>row.record_type==='official')))} · внутренний учёт: ${fmt(totalFor(yearRows.filter(row=>row.record_type==='internal')))}`;
  $('incomeTable').innerHTML = incomeRecords.length ? `<table class="data-table"><thead><tr><th>Дата</th><th>Источник</th><th>Категория</th><th>Сумма</th><th>Комментарий</th><th>Действия</th></tr></thead><tbody>${incomeRecords.map(row=>`<tr><td>${esc(row.income_date)}</td><td>${esc(row.source)}</td><td><span class="pill ${row.record_type==='internal'?'estimate':'won'}">${row.record_type==='internal'?'Внутренний учёт':'Официальный учёт'}</span></td><td>+${fmt(row.amount_rub)}</td><td>${esc(row.note||'—')}</td><td><button type="button" class="button subtle compact" data-edit-income="${row.id}">Изменить</button> <button type="button" class="button subtle compact" data-delete-income="${row.id}">Удалить</button></td></tr>`).join('')}</tbody></table>` : empty('Дополнительных поступлений пока нет','Нажми «Добавить доход», чтобы зафиксировать поступление вне списка платежей по объектам.');

  $('paymentsTable').innerHTML = payments.length ? `<table class="data-table"><thead><tr><th>Дата</th><th>Объект</th><th>Операция</th><th>Сумма</th><th>Способ</th><th>Комментарий</th><th>Действия</th></tr></thead><tbody>${payments.map(p => `<tr><td>${esc(p.payment_date)}</td><td>${esc(p.project_title)}</td><td>${p.payment_type === 'refund' ? '<span class="pill lost">Возврат</span>' : '<span class="pill won">Поступление</span>'}</td><td>${p.payment_type === 'refund' ? '−' : '+'}${fmt(p.amount_rub)}</td><td>${esc(({cash:'Наличные',bank:'На счёт',transfer:'Перевод',other:'Другое'})[p.method] || p.method)}</td><td>${esc(p.note || '—')}</td><td><button type="button" class="button subtle compact" data-edit-payment="${p.id}">Изменить</button> <button type="button" class="button subtle compact" data-delete-payment="${p.id}">Удалить</button></td></tr>`).join('')}</tbody></table>` : empty('Платежей пока нет','Добавь объект, затем записывай авансы и окончательные расчёты.');
  $('expensesTable').innerHTML = expenses.length ? `<table class="data-table"><thead><tr><th>Дата</th><th>Расход</th><th>Объект</th><th>Категория</th><th>Сумма</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${expenses.map(e => `<tr><td>${esc(e.expense_date)}</td><td>${esc(e.description)}</td><td>${esc(e.project_title || 'Общий')}</td><td>${esc(expenseLabels[e.category] || e.category)}</td><td>${fmt(e.amount_rub)}</td><td><span class="pill ${e.is_paid ? 'won' : 'estimate'}">${e.is_paid ? 'Оплачено' : 'Запланировано'}</span></td><td><button type="button" class="button subtle compact" data-edit-expense="${e.id}">Изменить</button> <button type="button" class="button subtle compact" data-delete-expense="${e.id}">Удалить</button></td></tr>`).join('')}</tbody></table>` : empty('Расходов пока нет','Записывай материалы, рабочих, транспорт и другие расходы.');
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
    crew: { people: $('estimateCrewPeople').value, mode: $('estimateCrewMode').value, rate: $('estimateCrewRate').value, hoursPerDay: $('estimateCrewHours').value, days: estimateCrewDaysForCost() },
    materialsCost: $('estimateMaterialsCost').value, disposalCost: $('estimateDisposalCost').value,
    transportCost: $('estimateTransportCost').value, equipmentCost: $('estimateEquipmentCost').value,
    otherCost: $('estimateOtherCost').value, overheadPercent: $('estimateOverheadPercent').value,
    taxPercent: $('estimateTaxPercent').value, discountPercent: $('estimateDiscountPercent').value,
    marginPercent: $('estimateTargetMargin').value, difficulty: $('estimateDifficulty').value, targetDays: $('estimateTargetDays').value, efficiencyPercent: $('estimateEfficiency')?.value || 85
  };
}
function estimateCrewDaysForCost() {
  if (!$('estimateCrewAutoDays')?.checked) return $('estimateCrewDays').value;
  const forecast = estimateGetDurationForecast();
  // An incomplete forecast must never silently zero out payroll. Keep a conservative editable fallback of at least one shift.
  if (!forecast.isComplete || forecast.daysForCrew === null) return String(Math.max(1, Number($('estimateCrewDays').value || 1)));
  return String(Math.max(1, Math.ceil(forecast.daysForCrew)));
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
    const durationCheck = estimateGetDurationForecast();
    if ($('estimateCrewAutoDays')?.checked && (!durationCheck.isComplete || durationCheck.daysForCrew === null)) result.warnings.push({ level: 'danger', title: 'Полный срок не рассчитан — проверь оплату бригады', message: 'У части работ отсутствует норма производительности. Зарплата не обнулена: для предварительного расчёта оставлена минимум одна смена или ранее указанное количество смен. Уточни нормы и фактический срок перед подтверждением цены.' });
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
let commercialOrderCache=[];
let piEconomicsCatalogCache=[];
const orderStatusLabels={new:'Новый',opened:'Открывали',relevant:'Подходит',rejected:'Не подходит'};
async function refreshCommercialOrders(){
 const search=$('orderRadarSearch')?.value||'',status=$('orderRadarStatus')?.value||'';
 const rows=await window.crm.listCommercialOrders({search,status,service:$('orderRadarService')?.value||'demolition',sourceType:$('orderRadarSource')?.value||''});commercialOrderCache=rows;const target=$('commercialOrdersList');if(!target)return;
 const summary=$('orderPiSummary');
 if(summary){
  const first=rows.filter(o=>o.pi_assessment).sort((a,b)=>b.pi_assessment.score-a.pi_assessment.score)[0];
  summary.innerHTML=`<strong>ПИ · предварительная оценка заказов</strong><span>${rows.length? `В списке ${rows.length} заказов. Оценка учитывает признаки вида работ, закупочного намерения и полноту сведений.`:'Найди заказы, чтобы ПИ смог предварительно оценить их по доступным текстовым сигналам.'}</span><span class="pi-order-summary-note">${first?`Наивысший предварительный приоритет сейчас: ${esc(first.title)} — ${first.pi_assessment.score}/100.`:'Пока нет результатов для оценки.'} Экономика, сроки и вероятность выигрыша не считаются подтверждёнными без проверки первоисточника.</span>`;
 }
 target.innerHTML=rows.length?rows.map(o=>{
  const labels=Array.isArray(o.signal_labels)?o.signal_labels:String(o.signal_labels||'').split('|').filter(Boolean);
  const pi=o.pi_assessment||null;
  const score=Number(pi?.score||0);
  const questions=Array.isArray(pi?.nextQuestions)?pi.nextQuestions:[];
  const reasons=Array.isArray(pi?.reasons)?pi.reasons:[];
  return `<article class="commercial-order-card"><div class="commercial-order-main"><div class="commercial-order-title-line"><strong>${esc(o.title)}</strong><span class="radar-score ${o.signal_score>=50?'hot':o.signal_score>=25?'warm':''}">Сигналы ${o.signal_score}/100</span><span class="pi-order-score ${score>=65?'high':score>=40?'medium':'low'}">ПИ ${score}/100</span><span class="pill ${o.status==='relevant'?'won':o.status==='rejected'?'lost':o.status==='opened'?'contacted':'new'}">${esc(orderStatusLabels[o.status]||o.status)}</span></div><p>${esc(o.snippet||'Описание в поисковой выдаче отсутствует — открой оригинал.')}</p><div class="radar-tags">${labels.map(x=>`<span class="radar-tag">${esc(x)}</span>`).join('')||'<span class="radar-tag muted-tag">Сигналы не подтверждены</span>'}</div><div class="pi-order-brief"><strong>${esc(pi?.label||'Нужна проверка')}</strong><span>Уверенность: ${esc(pi?.confidence||'низкая')} · Факторов оценено: ${Number(pi?.knownFactors||0)}/${Number(pi?.totalFactors||5)}</span></div>${o.pi_analysis ? '<div class="pi-order-economics ' + (Number(o.pi_analysis.estimated_profit_rub)<0?'negative':'') + '"><strong>Предварительная экономика · ' + esc(o.pi_analysis.work_name) + '</strong><span>Выручка: ' + fmt(o.pi_analysis.revenue_rub) + ' · Расходы: ' + fmt(o.pi_analysis.estimated_cost_rub) + '</span><span>' + (Number(o.pi_analysis.budget_rub)>0?'Основа выручки: введённый бюджет':'Основа выручки: ставка прайса; бюджет заказчика не подтверждён') + '</span><span>Прибыль: ' + fmt(o.pi_analysis.estimated_profit_rub) + ' · Маржа: ' + Number(o.pi_analysis.estimated_margin_pct).toLocaleString('ru-RU',{maximumFractionDigits:1}) + '%</span><span>Срок: ' + Number(o.pi_analysis.estimated_days).toLocaleString('ru-RU',{maximumFractionDigits:1}) + ' смен · Бригада: ' + Number(o.pi_analysis.crew_size) + ' · История смен: ' + Number(o.pi_analysis.observations_count) + ' наблюдений</span><small>' + (Number(o.pi_analysis.cost_per_unit)===0?'Внимание: себестоимость за единицу не задана; расчёт зависит от зарплаты и прочих расходов.':'Расчёт ориентировочный; проверь условия, ставки и дополнительные затраты.') + '</small></div>' : ''}<details class="pi-order-details"><summary>Почему такой приоритет и что уточнить</summary><div class="pi-order-details-body"><strong>Основания</strong><ul>${reasons.map(x=>`<li>${esc(x)}</li>`).join('')||'<li>Недостаточно сведений для объяснения оценки.</li>'}</ul><strong>Следующие вопросы</strong><ul>${questions.map(x=>`<li>${esc(x)}</li>`).join('')||'<li>Проверь бюджет, объём и сроки в первоисточнике.</li>'}</ul><small>${esc(pi?.disclaimer||'Предварительная сортировка; требуется проверка первоисточника.')}</small></div></details><small>${esc(o.source_name)} · ${esc(o.region)} · Обнаружено: ${esc(o.last_seen_at||o.first_seen_at||'—')}</small></div><div class="commercial-order-actions"><button class="button small-button" data-order-economics="${o.id}">${o.pi_analysis?'Изменить экономику':'Оценить экономику'}</button><button class="button small-button primary" data-order-open="${o.id}" data-order-url="${esc(o.source_url)}">Открыть источник ↗</button>${o.converted_to_lead?'<span class="pill won">Уже в заявках</span>':`<button class="button small-button" data-order-convert="${o.id}">В заявку</button>`}<select aria-label="Статус заказа" data-order-status="${o.id}"><option value="new" ${o.status==='new'?'selected':''}>Новый</option><option value="opened" ${o.status==='opened'?'selected':''}>Открывали</option><option value="relevant" ${o.status==='relevant'?'selected':''}>Подходит</option><option value="rejected" ${o.status==='rejected'?'selected':''}>Не подходит</option></select></div></article>`;
 }).join(''):empty('Заказы пока не найдены','Нажми «Найти заказы» после сохранения ключа Brave Search или измени фильтры.');
}
async function refreshProspects() {
  const rows = await window.crm.listProspects();
  renderOpportunityRadar(rows);
  await refreshCommercialOrders(); const q = ($('prospectSearch')?.value || '').trim().toLowerCase(); const status = $('prospectStatusFilter')?.value || '';
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
  const [clients, leads, summary, finance] = await Promise.all([
    window.crm.listClients(), window.crm.listLeads(), window.crm.summary(), window.crm.financeInsights()
  ]);
  const won = leads.filter(l => l.status === 'won').length;
  $('reportClients').textContent = clients.length; $('reportLeads').textContent = leads.length; $('reportWon').textContent = won;
  $('reportConversion').textContent = `${leads.length ? Math.round(won / leads.length * 100) : 0}%`;
  $('reportReceived').textContent = fmt(summary.received);
  $('reportExpenses').textContent = fmt(summary.expenses);
  $('reportCash').textContent = fmt(summary.cash);
  $('reportReceivables').textContent = fmt(finance.receivablesTotal);
  const groups = {};
  for (const lead of leads) { const key = lead.source || 'other'; if (!groups[key]) groups[key] = { count: 0, budget: 0, won: 0 }; groups[key].count++; groups[key].budget += Number(lead.budget_rub || 0); if (lead.status === 'won') groups[key].won++; }
  const sorted = Object.entries(groups).sort((a,b) => b[1].count - a[1].count);
  $('sourceReport').innerHTML = sorted.length ? `<table class="data-table"><thead><tr><th>Источник</th><th>Заявок</th><th>Выиграно</th><th>Ожидаемый бюджет</th></tr></thead><tbody>${sorted.map(([source,v]) => `<tr><td>${esc(sourceLabels[source] || source)}</td><td>${v.count}</td><td>${v.won}</td><td>${fmt(v.budget)}</td></tr>`).join('')}</tbody></table>` : empty('Пока нет данных','После добавления заявок здесь появится разбивка по источникам.');
}
function empty(title, detail) { return `<div class="empty-state"><div class="empty-icon">◉</div><strong>${esc(title)}</strong><span>${esc(detail)}</span></div>`; }
function openDialog(id) { $(id).showModal(); }

function closeDialog(id) { $(id).close(); }
$('piOpenErrorHistoryBtn')?.addEventListener('click', () => openPiErrorHistory());
$('piErrorList')?.addEventListener('click', event => {
  const button = event.target.closest('[data-pi-error-id]');
  if (button) piRenderErrorHistory(button.dataset.piErrorId);
});
$('piClearErrorHistoryBtn')?.addEventListener('click', () => {
  if (!piErrorHistory.length) return;
  if (!window.confirm('Очистить сохранённую историю ошибок на этом компьютере?')) return;
  piErrorHistory = [];
  piErrorSave();
  piRenderErrorHistory();
});
function piUpdateErrorBadge() {
  const badge = $('piErrorBadge');
  if (badge) badge.textContent = String(piErrorHistory.length);
}
piUpdateErrorBadge();
async function exportCsv(kind) { try { const r = await window.crm.exportDataCsv(kind); if (!r.canceled) toast(`Экспорт завершён: строк ${r.count}.`); } catch (e) { toast(e.message, true); } }
// Primary navigation is registered near showView() before widget initialization.
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
$('quickLead').addEventListener('click', () => { $('leadForm').reset(); $('leadDialogTitle').textContent = 'Добавить заявку'; showView('leads'); openDialog('leadDialog'); });
$('addLeadBtn').addEventListener('click', () => { $('leadForm').reset(); $('leadDialogTitle').textContent = 'Добавить заявку'; openDialog('leadDialog'); });
$('addClientBtn').addEventListener('click', () => { $('clientForm').reset(); $('clientDialogTitle').textContent = 'Новый клиент'; openDialog('clientDialog'); });
async function populateProjectRelationships(clientId = '', leadId = '') {
  const [clients, leads] = await Promise.all([window.crm.listClients(), window.crm.listLeads()]);
  const form = $('projectForm');
  form.elements.client_id.innerHTML = '<option value="">Без клиента</option>' + clients.map(client => `<option value="${client.id}">${esc(client.name)}${client.phone ? ` · ${esc(client.phone)}` : ''}</option>`).join('');
  form.elements.lead_id.innerHTML = '<option value="">Без заявки</option>' + leads.map(lead => `<option value="${lead.id}">${esc(lead.title)}${lead.client_name ? ` · ${esc(lead.client_name)}` : ''}</option>`).join('');
  form.elements.client_id.value = clientId ? String(clientId) : '';
  form.elements.lead_id.value = leadId ? String(leadId) : '';
}
$('projectLeadSelect').addEventListener('change', async event => {
  if (!event.target.value) return;
  try { const lead = (await window.crm.listLeads()).find(item => item.id === Number(event.target.value)); if (lead?.client_id) $('projectClientSelect').value = String(lead.client_id); }
  catch (error) { toast(error.message, true); }
});
$('addProjectBtn').addEventListener('click', async () => { pendingProjectPlan = null; $('projectForm').reset(); $('projectForm').elements.planned_people.value = '5'; $('projectDialogTitle').textContent = 'Новый объект'; try { await populateProjectRelationships(); openDialog('projectDialog'); } catch (error) { toast(`Не удалось загрузить клиентов и заявки: ${error.message}`, true); } });
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
  try { const saved = await window.crm.exportQuotePdf({ title: $('estimateTitle').value, customer: $('estimateCustomer').value, address: $('estimateAddress').value, contact: $('estimateContact').value, validity: $('estimateValidity').value, lines: r.lineItems.map(x => ({name:x.name,unit:x.unit,quantity:x.quantity,price:x.price})), revenue: r.revenue, discount: r.discount, estimatedCostRub: r.totalCost, estimatedProfitRub: r.profit, marginPct: r.actualMargin }); if (saved?.canceled) return; toast('КП в PDF сохранено и добавлено в историю ПИ.'); await refreshPiCoach({ force: true }).catch(() => {}); } catch (error) { toast(`Не удалось сформировать PDF: ${error.message}`, true); }
});
$('estimateCreateProjectBtn').addEventListener('click', () => {
  const result = refreshEstimate(); if (!result) return;
  const form = $('projectForm'); form.reset();
  form.elements.title.value = $('estimateTitle').value || 'Предварительная смета';
  form.elements.service.value = $('estimateService').value;
  form.elements.contract_rub.value = String(Math.round(result.revenue));
  form.elements.planned_people.value = String(Math.max(1, Number($('estimateCrewPeople').value || 5)));
  form.elements.complexity_factor.value = $('estimateDifficulty').value;
  form.elements.notes.value = `Смета PRO: работы ${money(result.listRevenue)}; скидка ${money(result.discount)}; себестоимость ${money(result.totalCost)}; расчётная прибыль ${money(result.profit)}. Подробная смета экспортируется отдельно в CSV.`;
  const planMap = new Map();
  for (const line of estimateLines.filter(line => Number(line.quantity) > 0)) {
    const saved = planMap.get(line.catalogId);
    if (saved) saved.planned_quantity += Number(line.quantity);
    else { const catalogId = line.catalogId || `manual-${line.lineId}`; planMap.set(catalogId, { catalog_id: catalogId, work_name: line.name, unit: line.unit, planned_quantity: Number(line.quantity), baseline_productivity: Math.max(0, Number(line.productivity) || 0) }); }
  }
  pendingProjectPlan = { planned_people: Number(form.elements.planned_people.value || 5), complexity_factor: Number(form.elements.complexity_factor.value || 1), lines: [...planMap.values()] };
  openDialog('projectDialog');
  const missingRates = estimateLines.filter(line => Number(line.quantity) > 0 && !(Number(line.productivity) > 0)).length;
  toast(pendingProjectPlan.lines.length ? (missingRates ? `Смета перенесена в объект, включая ${missingRates} позиций без нормы. ПИ не сможет рассчитать полный срок, пока нормы не заданы.` : 'Сумма, состав бригады, сложность и позиции сметы будут перенесены в объект.') : 'Цена перенесена. Для прогноза сроков после сохранения добавь план работ.');
});
const actualInputIds = ['actualContractRevenue','actualReceived','actualWagesPaid','actualMaterialsPaid','actualDisposalPaid','actualTransportPaid','actualEquipmentPaid','actualOtherPaid'];
actualInputIds.forEach(id => $(id).addEventListener('input', () => { const r = refreshEstimate(); if (r) estimateRefreshActuals(r.totalCost); estimateSaveDraft(); }));
$('actualUseEstimatePriceBtn').addEventListener('click', () => { const r = refreshEstimate(); if (!r) return; $('actualContractRevenue').value = Math.round(r.revenue); estimateRefreshActuals(r.totalCost); estimateSaveDraft(); toast('Цена сметы подставлена в план/факт.'); });
estimateLoadDraft();
refreshEstimateLearningRates().catch(error => { $('estimateLearningStatus').textContent = `Не удалось загрузить фактические нормы: ${error.message}`; });
$('addPaymentBtn').addEventListener('click', async () => { await refreshProjects(); if (!(await window.crm.listProjects()).length) { toast('Сначала создай объект, к которому привязать платёж.', true); showView('projects'); return; } $('paymentForm').reset(); $('paymentForm').elements.payment_date.value = dateToday(); $('paymentDialogTitle').textContent = 'Записать платёж'; openDialog('paymentDialog'); });
$('addExpenseBtn').addEventListener('click', async () => { await refreshProjects(); $('expenseForm').reset(); $('expenseForm').elements.expense_date.value = dateToday(); $('expenseDialogTitle').textContent = 'Добавить расход'; openDialog('expenseDialog'); });
async function refreshPinSettings() {
  const status = await window.crm.getPinStatus();
  $('pinSettingsBadge').textContent = status.enabled ? 'Включён' : 'Выключен';
  $('pinCurrentLabel').hidden = !status.enabled;
  $('pinCurrentInput').required = Boolean(status.enabled);
  $('pinSaveBtn').textContent = status.enabled ? 'Изменить PIN' : 'Включить PIN';
  $('pinDisableBtn').hidden = !status.enabled;
  $('pinSettingsStatus').textContent = status.enabled ? 'При следующем запуске CRM запросит PIN-код.' : 'PIN не установлен. Создай его, чтобы закрыть доступ при запуске.';
}
$('notificationSettingsBtn').addEventListener('click', async () => { try { await refreshNotificationSettings(); openDialog('notificationSettingsDialog'); } catch (error) { toast('Не удалось загрузить настройки уведомлений.', true); } });
$('settingsNotificationsBtn').addEventListener('click', async () => { try { await refreshNotificationSettings(); openDialog('notificationSettingsDialog'); } catch (error) { toast('Не удалось загрузить настройки уведомлений.', true); } });
$('pinSettingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const currentPin = $('pinCurrentInput').value;
  const pin = $('pinNewInput').value;
  const confirmPin = $('pinConfirmInput').value;
  if (!/^\d{4,12}$/.test(pin)) { $('pinSettingsStatus').textContent = 'PIN должен содержать от 4 до 12 цифр.'; return; }
  if (pin !== confirmPin) { $('pinSettingsStatus').textContent = 'PIN-коды не совпадают.'; return; }
  try {
    await window.crm.setPin({ currentPin, pin });
    $('pinSettingsForm').reset();
    await refreshPinSettings();
    toast('PIN-код сохранён. Он будет запрашиваться при следующем запуске.');
  } catch (error) { $('pinSettingsStatus').textContent = error.message || 'Не удалось сохранить PIN.'; }
});
$('pinDisableBtn').addEventListener('click', async () => {
  const currentPin = $('pinCurrentInput').value;
  if (!currentPin) { $('pinSettingsStatus').textContent = 'Введи текущий PIN, чтобы отключить защиту.'; return; }
  try {
    await window.crm.disablePin({ currentPin });
    $('pinSettingsForm').reset();
    await refreshPinSettings();
    toast('Защита PIN отключена.');
  } catch (error) { $('pinSettingsStatus').textContent = error.message || 'Не удалось отключить PIN.'; }
});
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
$('addTaskBtn').addEventListener('click', async () => { await refreshTasks(); $('taskForm').reset(); $('taskDialogTitle').textContent = 'Новая задача'; $('taskDialog').showModal(); });
$('taskForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, data = Object.fromEntries(new FormData(form));
  try {
    if (data.id) await window.crm.updateTask(data); else await window.crm.createTask(data);
    closeDialog('taskDialog'); form.reset(); $('taskDialogTitle').textContent = 'Новая задача';
    toast(data.id ? 'Задача обновлена.' : 'Задача добавлена в план действий.');
    await refreshTasks();
  } catch (err) { toast(err.message, true); }
});
$('tasksTable').addEventListener('click', async event => {
  const button = event.target.closest('[data-edit-task]'); if (!button) return;
  try {
    const rows = await window.crm.listTasks({ filter: 'all' }), task = rows.find(item => item.id === Number(button.dataset.editTask));
    if (!task) throw new Error('Задача не найдена. Обнови список.');
    await refreshTasks();
    const form = $('taskForm');
    for (const key of ['id','title','due_at','lead_id','project_id']) {
      const field = form.elements[key]; if (!field) continue;
      field.value = task[key] == null ? '' : (key === 'due_at' ? String(task[key]).slice(0,16) : task[key]);
    }
    $('taskDialogTitle').textContent = 'Изменить задачу'; $('taskDialog').showModal();
  } catch (error) { toast(error.message, true); }
});
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
$('leadForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form));
  try {
    if (data.id) await window.crm.updateLead(data); else await window.crm.createLead(data);
    form.reset(); $('leadDialogTitle').textContent = 'Добавить заявку'; closeDialog('leadDialog');
    toast(data.id ? 'Заявка обновлена.' : 'Заявка сохранена.');
    await Promise.all([refreshLeads(), refreshDashboard(), refreshReports()]);
  } catch (err) { toast(err.message, true); }
});
$('leadsTable').addEventListener('click', async event => {
  const button = event.target.closest('[data-edit-lead]'); if (!button) return;
  try {
    const rows = await window.crm.listLeads(), lead = rows.find(item => item.id === Number(button.dataset.editLead));
    if (!lead) throw new Error('Заявка не найдена. Обнови список.');
    const form = $('leadForm');
    for (const key of ['id','title','service','source','budget_rub','address','notes']) form.elements[key].value = lead[key] ?? '';
    $('leadDialogTitle').textContent = 'Изменить заявку'; openDialog('leadDialog');
  } catch (error) { toast(error.message, true); }
});
$('clientForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form));
  try {
    if (data.id) await window.crm.updateClient(data); else await window.crm.createClient(data);
    form.reset(); $('clientDialogTitle').textContent = 'Новый клиент'; closeDialog('clientDialog');
    toast(data.id ? 'Карточка клиента обновлена.' : 'Клиент сохранён.');
    await Promise.all([refreshClients(), refreshDashboard()]);
  } catch (err) { toast(err.message, true); }
});
$('clientsTable').addEventListener('click', async event => {
  const button = event.target.closest('[data-edit-client]');
  if (!button) return;
  try {
    const clients = await window.crm.listClients();
    const client = clients.find(item => item.id === Number(button.dataset.editClient));
    if (!client) throw new Error('Клиент не найден. Обнови список.');
    const form = $('clientForm');
    for (const key of ['id','name','phone','email','client_type','notes']) form.elements[key].value = client[key] ?? '';
    $('clientDialogTitle').textContent = 'Изменить клиента'; openDialog('clientDialog');
  } catch (error) { toast(error.message, true); }
});
$('projectsTable').addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-project]'); if (!button) return;
  if (!window.confirm('Удалить объект? Объекты с платежами или расходами удалить нельзя.')) return;
  try {
    await window.crm.deleteProject(Number(button.dataset.deleteProject));
    toast('Объект удалён.');
    await Promise.all([refreshProjects(), refreshDashboard(), refreshProduction(), refreshFinance()]);
  } catch (error) { toast(error.message, true); }
});
$('projectsTable').addEventListener('change', async event => {
  const control = event.target.closest('[data-project-status]'); if (!control) return;
  const id = Number(control.dataset.projectStatus), status = control.value; control.disabled = true;
  try {
    await window.crm.updateProjectStatus({ id, status }); toast('Статус объекта обновлён.');
    await Promise.all([refreshProjects(), refreshDashboard(), refreshProduction(), refreshFinance()]);
  } catch (error) { toast(`Не удалось изменить статус объекта: ${error.message}`, true); await refreshProjects().catch(() => {}); }
  finally { control.disabled = false; }
});
$('projectForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form));
  const editing = Boolean(data.id), planToAttach = editing ? null : pendingProjectPlan; pendingProjectPlan = null;
  try {
    if (editing) await window.crm.updateProject(data);
    else if (planToAttach?.lines?.length) await window.crm.createProjectWithPlan({ project: data, plan: planToAttach });
    else await window.crm.createProject(data);
  } catch (err) { pendingProjectPlan = planToAttach; toast(err.message,true); return; }
  form.reset(); $('projectDialogTitle').textContent = 'Новый объект'; closeDialog('projectDialog');
  toast(editing ? 'Карточка объекта обновлена.' : (planToAttach?.lines?.length ? 'Объект и производственный план сохранены одной операцией.' : 'Объект сохранён. План работ можно добавить в разделе «Производство».'));
  await Promise.all([refreshProjects(), refreshDashboard(), refreshProduction(), refreshFinance()]).catch(err => toast(`Объект сохранён, но обновление списков завершилось ошибкой: ${err.message}`, true));
});
$('projectsTable').addEventListener('click', async event => {
  const button = event.target.closest('[data-edit-project]'); if (!button) return;
  try {
    const rows = await window.crm.listProjects(), project = rows.find(item => item.id === Number(button.dataset.editProject));
    if (!project) throw new Error('Объект не найден. Обнови список.');
    const form = $('projectForm');
    await populateProjectRelationships(project.client_id, project.lead_id);
    for (const key of ['id','title','service','status','contract_rub','address','start_date','end_date','planned_people','complexity_factor','notes']) form.elements[key].value = project[key] ?? '';
    $('projectDialogTitle').textContent = 'Изменить объект'; openDialog('projectDialog');
  } catch (error) { toast(error.message, true); }
});
$('paymentForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, data = Object.fromEntries(new FormData(form));
  try {
    if (data.id) await window.crm.updatePayment(data); else await window.crm.createPayment(data);
    form.reset(); closeDialog('paymentDialog'); $('paymentDialogTitle').textContent = 'Записать платёж';
    toast(data.id ? 'Платёж обновлён.' : 'Платёж записан.');
    await refreshFinance(); await refreshDashboard();
  } catch (err) { toast(err.message,true); }
});
$('paymentsTable').addEventListener('click', async event => {
  const del = event.target.closest('[data-delete-payment]'); if(del){ if(!window.confirm('Удалить этот платёж? Действие нельзя отменить.')) return; try{await window.crm.deletePayment(Number(del.dataset.deletePayment));toast('Платёж удалён.');await refreshFinance();}catch(error){toast(error.message,true);} return; }
  const button = event.target.closest('[data-edit-payment]'); if (!button) return;
  try {
    const rows = await window.crm.listPayments(), payment = rows.find(item => item.id === Number(button.dataset.editPayment));
    if (!payment) throw new Error('Платёж не найден. Обнови список.');
    await refreshProjects();
    const form = $('paymentForm');
    for (const key of ['id','project_id','amount_rub','payment_type','payment_date','method','note']) form.elements[key].value = payment[key] ?? '';
    $('paymentDialogTitle').textContent = 'Изменить платёж'; $('paymentDialog').showModal();
  } catch (error) { toast(error.message,true); }
});
$('addIncomeBtn').addEventListener('click', () => {
  const form=$('incomeForm'); form.reset(); form.elements.id.value='';
  const now=new Date(); form.elements.income_date.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  $('incomeDialogTitle').textContent='Добавить доход'; openDialog('incomeDialog');
});
$('incomeForm').addEventListener('submit',async e=>{
  e.preventDefault(); const form=e.currentTarget,data=Object.fromEntries(new FormData(form));
  try { if(data.id) await window.crm.updateIncomeRecord(data); else await window.crm.createIncomeRecord(data); form.reset(); closeDialog('incomeDialog'); toast(data.id?'Доход обновлён.':'Доход сохранён.'); await refreshFinance(); }
  catch(error){toast(error.message,true);}
});
$('incomeTable').addEventListener('click',async event=>{
  const del=event.target.closest('[data-delete-income]'); if(del){ if(!window.confirm('Удалить эту запись дохода? Действие нельзя отменить.')) return; try{await window.crm.deleteIncomeRecord(Number(del.dataset.deleteIncome));toast('Запись дохода удалена.');await refreshFinance();}catch(error){toast(error.message,true);} return; }
  const button=event.target.closest('[data-edit-income]'); if(!button)return;
  try { const rows=await window.crm.listIncomeRecords(),row=rows.find(item=>item.id===Number(button.dataset.editIncome)); if(!row)throw new Error('Запись дохода не найдена.');
    const form=$('incomeForm'); for(const key of ['id','amount_rub','income_date','record_type','source','note']) form.elements[key].value=row[key]??'';
    $('incomeDialogTitle').textContent='Изменить доход'; openDialog('incomeDialog');
  } catch(error){toast(error.message,true);}
});
$('expenseForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, data = Object.fromEntries(new FormData(form));
  try {
    if (data.id) await window.crm.updateExpense(data); else await window.crm.createExpense(data);
    form.reset(); closeDialog('expenseDialog'); $('expenseDialogTitle').textContent = 'Добавить расход';
    toast(data.id ? 'Расход обновлён.' : 'Расход сохранён.');
    await refreshFinance(); await refreshDashboard();
  } catch (err) { toast(err.message,true); }
});
$('expensesTable').addEventListener('click', async event => {
  const del = event.target.closest('[data-delete-expense]'); if(del){ if(!window.confirm('Удалить этот расход? Действие нельзя отменить.')) return; try{await window.crm.deleteExpense(Number(del.dataset.deleteExpense));toast('Расход удалён.');await refreshFinance();}catch(error){toast(error.message,true);} return; }
  const button = event.target.closest('[data-edit-expense]'); if (!button) return;
  try {
    const rows = await window.crm.listExpenses(), expense = rows.find(item => item.id === Number(button.dataset.editExpense));
    if (!expense) throw new Error('Расход не найден. Обнови список.');
    await refreshProjects();
    const form = $('expenseForm');
    for (const key of ['id','project_id','amount_rub','expense_date','category','description','is_paid']) form.elements[key].value = expense[key] ?? '';
    $('expenseDialogTitle').textContent = 'Изменить расход'; $('expenseDialog').showModal();
  } catch (error) { toast(error.message,true); }
});
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
$('runOrderRadarBtn').addEventListener('click',async()=>{
 const b=$('runOrderRadarBtn'),r=$('orderRadarResult'),sourceType=$('orderRadarSource')?.value||'web';
 if(sourceType==='files'){r.hidden=false;r.className='crawler-result';r.textContent='Для источника «Импорт из файла» нажми «Импорт CSV».';return;}
 b.disabled=true;b.textContent='Ищем…';r.hidden=false;r.className='crawler-result';r.textContent='Ищем страницы заказов по выбранному источнику…';
 try{
  const report=await window.crm.searchCommercialOrders({service:$('orderRadarService').value,region:$('orderRadarRegion').value,sourceType});
  const lines=[`Источник: ${sourceType}`,`Запросов: ${report.queries.length}`,`Результатов: ${report.received}`,`Уникальных ссылок: ${report.unique}`,`Новых карточек: ${report.added}`,`Обновлено: ${report.refreshed}`,`Защищено вручную отмеченных: ${report.protected||0}`,`Ошибок: ${report.errors.length}`];
  if(report.errors.length)lines.push('','Ошибки:',...report.errors.map(x=>`• ${x.query}: ${x.error}`));
  lines.push('','Результаты — кандидаты. Проверь актуальность и условия на исходном сайте.');
  r.textContent=lines.join('\n');await refreshCommercialOrders();toast(`Поиск завершён. Новых карточек: ${report.added}.`);
 }catch(e){r.className='crawler-result error';r.textContent=`Поиск не выполнен: ${e.message}. Если API недоступен, используй «Открыть ручной поиск».`;toast(e.message,true)}
 finally{b.disabled=false;b.textContent='⌕ Найти через API'}
});
$('manualOrderSearchBtn').addEventListener('click',async()=>{
 try{const sourceType=$('orderRadarSource')?.value||'all';if(sourceType==='files'){toast('Для источника «Импорт из файла» используй кнопку «Импорт CSV».');return;}const url=await window.crm.manualCommercialOrderSearchUrl({service:$('orderRadarService').value,region:$('orderRadarRegion').value,sourceType});await window.crm.openExternal(url);toast('Открылся ручной поиск. Проверь первоисточники и импортируй подходящие заказы из CSV.')}
 catch(e){toast(e.message,true)}
});
$('importOrdersCsvBtn').addEventListener('click',async()=>{
 try{const result=await window.crm.importCommercialOrdersCsv();if(result.canceled)return;await refreshCommercialOrders();toast(`Импорт завершён: ${result.imported} добавлено, ${result.skipped} пропущено.`)}
 catch(e){toast(`Импорт не выполнен: ${e.message}`,true)}
});
$('addManualOrderBtn').addEventListener('click',()=>{
 const form=$('manualOrderForm');form.reset();
 $('manualOrderService').value=$('orderRadarService').value||'demolition';
 $('manualOrderRegion').value=$('orderRadarRegion').value||'Москва и Московская область';
 $('manualOrderDialog').showModal();
});
$('manualOrderForm').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
 try{
  const result=await window.crm.createCommercialOrder({title:$('manualOrderTitle').value,source_url:$('manualOrderUrl').value,snippet:$('manualOrderSnippet').value,service:$('manualOrderService').value,region:$('manualOrderRegion').value});
  $('manualOrderDialog').close();await refreshCommercialOrders();
  toast(result.duplicate?'Этот заказ уже есть в радаре — дубль не создан.':'Заказ добавлен. Открой карточку, чтобы посмотреть оценку ПИ.');
 }catch(e){toast(e.message,true)}
 finally{submit.disabled=false}
});
$('commercialOrdersList').addEventListener('click',e=>{
 const button=e.target.closest('[data-order-economics]');if(!button)return;
 const order=commercialOrderCache.find(item=>Number(item.id)===Number(button.dataset.orderEconomics));if(!order)return;
 try{
  piEconomicsCatalogCache=window.StrukturaEstimateCalculator?.getCatalog?.()||[];
  $('piEconomicsCatalog').innerHTML='<option value="">Своя работа / ручной ввод</option>'+piEconomicsCatalogCache.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+' · '+esc(item.unit)+' · '+esc(item.category||'')+'</option>').join('');
  const a=order.pi_analysis||{};
  $('piEconomicsOrderId').value=order.id;$('piEconomicsOrderTitle').textContent=order.title;
  $('piEconomicsWorkName').value=a.work_name||order.title;$('piEconomicsUnit').value=a.unit||'м²';
  $('piEconomicsQuantity').value=a.quantity??1;$('piEconomicsBudget').value=a.budget_rub??0;
  $('piEconomicsPrice').value=a.price_per_unit??0;$('piEconomicsCost').value=a.cost_per_unit??0;
  $('piEconomicsProductivity').value=a.baseline_productivity??8;$('piEconomicsCrew').value=a.crew_size??5;
  $('piEconomicsWage').value=a.wage_per_worker_shift??0;$('piEconomicsOther').value=a.other_costs_rub??0;
  $('piEconomicsDifficulty').value=a.difficulty_factor??1;$('piEconomicsReserve').value=a.reserve_percent??15;
  $('piEconomicsCatalog').value=a.catalog_id||'';
  $('piEconomicsDialog').showModal();
 }catch(error){toast('Не удалось открыть расчёт ПИ: '+error.message,true)}
});
$('piEconomicsCatalog').addEventListener('change',()=>{
 const item=piEconomicsCatalogCache.find(row=>String(row.id)===String($('piEconomicsCatalog').value));if(!item)return;
 $('piEconomicsWorkName').value=item.name||'';$('piEconomicsUnit').value=item.unit||'м²';
 $('piEconomicsPrice').value=Number(item.price)||0;$('piEconomicsCost').value=Number(item.cost)||0;
 $('piEconomicsProductivity').value=Number(item.productivity)||8;
});
$('piEconomicsForm').addEventListener('submit',async event=>{
 event.preventDefault();const submit=event.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;
 try{
  const result=await window.crm.saveCommercialOrderAnalysis({
   order_id:Number($('piEconomicsOrderId').value),catalog_id:$('piEconomicsCatalog').value,
   work_name:$('piEconomicsWorkName').value,unit:$('piEconomicsUnit').value,
   quantity:Number($('piEconomicsQuantity').value),budget_rub:Number($('piEconomicsBudget').value),
   price_per_unit:Number($('piEconomicsPrice').value),cost_per_unit:Number($('piEconomicsCost').value),
   baseline_productivity:Number($('piEconomicsProductivity').value),crew_size:Number($('piEconomicsCrew').value),
   wage_per_worker_shift:Number($('piEconomicsWage').value),other_costs_rub:Number($('piEconomicsOther').value),
   difficulty_factor:Number($('piEconomicsDifficulty').value),reserve_percent:Number($('piEconomicsReserve').value)
  });
  $('piEconomicsDialog').close();await refreshCommercialOrders();
  toast(result.observations_count>0?'Расчёт сохранён; ПИ учёл историю смен по выбранной работе.':'Расчёт сохранён. Истории смен по этой работе нет — использована стартовая производительность.');
 }catch(error){toast(error.message,true)}
 finally{submit.disabled=false}
});
$('refreshOrdersBtn').addEventListener('click',()=>refreshCommercialOrders().then(()=>toast('Список заказов обновлён.')).catch(e=>toast(e.message,true)));
$('orderRadarSearch').addEventListener('input',()=>refreshCommercialOrders().catch(e=>toast(e.message,true)));
$('orderRadarStatus').addEventListener('change',()=>refreshCommercialOrders().catch(e=>toast(e.message,true)));
$('orderRadarService').addEventListener('change',()=>refreshCommercialOrders().catch(e=>toast(e.message,true)));
$('orderRadarSource').addEventListener('change',()=>{refreshCommercialOrders().catch(e=>toast(e.message,true));const b=$('runOrderRadarBtn');if(b)b.textContent=$('orderRadarSource').value==='files'?'Выбран импорт CSV':'⌕ Найти через API';});
$('commercialOrdersList').addEventListener('click',async e=>{
 const button=e.target.closest('[data-order-convert]');if(!button)return;
 const orderId=Number(button.dataset.orderConvert);if(!Number.isSafeInteger(orderId)||orderId<1){toast('Некорректный номер заказа.',true);return;}
 button.disabled=true;button.textContent='Создаём заявку…';
 try{
  const result=await window.crm.convertCommercialOrderToLead(orderId);
  await refreshCommercialOrders();
  await refreshLeads();
  toast(result.alreadyExists?'Этот заказ уже был передан в заявки.':'Заказ передан в раздел «Заявки».');
 }catch(error){toast('Не удалось создать заявку: '+error.message,true);}
 finally{button.disabled=false;}
});
$('commercialOrdersList').addEventListener('click',async e=>{const b=e.target.closest('[data-order-open]');if(!b)return;try{await window.crm.openExternal(b.dataset.orderUrl);await window.crm.updateCommercialOrderStatus({id:Number(b.dataset.orderOpen),status:'opened'});await refreshCommercialOrders()}catch(err){toast(err.message,true)}});
$('commercialOrdersList').addEventListener('change',async e=>{const s=e.target.closest('[data-order-status]');if(!s)return;try{await window.crm.updateCommercialOrderStatus({id:Number(s.dataset.orderStatus),status:s.value});toast('Статус заказа сохранён.')}catch(err){toast(err.message,true)}});
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
    const forecastLabel = project.planCount && forecast.lines.some(line => line.missingRate)
      ? 'План сохранён, но для части работ нужны нормы производительности'
      : project.planCount && forecast.estimated
        ? (forecast.teamShiftsRemaining <= 0 ? 'Работы по плану закрыты' : `≈ ${productionNum(forecast.teamShiftsRemaining,1)} смен бригадой ${project.planned_people} чел.`)
        : 'Добавь план работ, чтобы прогнозировать остаток';
    const items = forecast.lines.slice(0,5).map(line => {
      const total = Math.max(Number(line.plannedQuantity || 0), 0.0001);
      const progress = Math.min(100, Math.round(Number(line.actualQuantity || 0) / total * 100));
      const remainingLabel = line.overPlan ? `План превышен на ${productionNum(Number(line.actualQuantity) - Number(line.plannedQuantity),1)} ${line.unit}` : `Осталось ${productionNum(line.remainingQuantity,1)} ${line.unit}`;
      return `<div class="production-work-progress"><div class="production-work-progress-head"><strong>${esc(line.name)}</strong><span>${productionNum(line.actualQuantity,1)} / ${productionNum(line.plannedQuantity,1)} ${esc(line.unit)}</span></div><div class="production-progress-track"><span data-progress-width="${progress}"></span></div><div class="production-work-progress-meta"><span class="${line.overPlan ? 'production-plan-exceeded' : ''}">${esc(remainingLabel)}</span><span>${esc(line.confidence)}${line.crewScalingApplied ? ' · учтён размер бригады' : ''}</span></div></div>`;
    }).join('');
    return `<article class="production-project-card"><div class="production-card-top"><div><span class="pill active">В работе</span><h4>${esc(project.title)}</h4><p>${esc(project.address || 'Адрес не указан')} · ${esc(serviceLabels[project.service] || project.service)}</p></div><span class="production-card-icon">◷</span></div><div class="production-forecast"><span>ПРОГНОЗ ОСТАТКА</span><strong>${esc(forecastLabel)}</strong><small>${project.planCount ? `Трудоёмкость остатка ≈ ${productionNum(forecast.laborShiftsRemaining,1)} человеко-смен. Норма по практике обновляется после отчётов.` : 'План объёмов пока не указан. Без него остаток работ и срок достоверно не вычислить.'}</small></div><div class="production-card-facts"><span><b>${project.shiftCount}</b> смен записано</span><span><b>${productionNum(project.personShifts,1)}</b> человеко-смен факт</span><span>Последняя: <b>${esc(project.lastShiftDate || 'нет')}</b></span></div>${items ? `<div class="production-work-list">${items}${forecast.lines.length > 5 ? `<div class="production-more-lines">Ещё позиций в плане: ${forecast.lines.length - 5}</div>` : ''}</div>` : `<div class="production-no-plan">План не настроен — сначала внеси все плановые работы и объёмы.</div>`}<div class="production-card-actions"><button class="button subtle" data-production-plan="${project.id}">Настроить план</button><button class="button primary" data-production-shift="${project.id}">＋ Отчёт за смену</button></div></article>`;
  }).join('') : `<div class="panel production-empty"><div class="production-empty-icon">◷</div><h4>Пока нет активных объектов</h4><p>Создай объект в разделе «Объекты» и поставь статус «В работе». После этого здесь появится карточка для плана, прогноза и ежедневных отчётов.</p><button class="button primary" data-goto="projects">Перейти к объектам</button></div>`;
  $('productionHistory').innerHTML = data.history.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Дата</th><th>Объект</th><th>Бригада</th><th>Фактически сделано</th><th>Выработка против нормы</th><th>Простой</th><th>Условия</th><th>Примечание</th><th></th></tr></thead><tbody>${data.history.map(shift => `<tr><td>${esc(shift.shift_date)}</td><td>${esc(shift.project_title)}</td><td>${shift.workers_count} чел. × ${productionNum(shift.shift_hours,1)} ч.</td><td>${esc(shift.work_summary || '—')}<small class="table-sub">${shift.work_count} видов работ</small></td><td><div class="production-history-rates">${shift.performance.map(item => { const deviation = Number(item.deviationPct || 0); const cls = deviation >= 20 ? 'above' : deviation <= -20 ? 'below' : 'normal'; const label = deviation >= 20 ? 'Выше нормы' : deviation <= -20 ? 'Ниже нормы' : 'Близко к норме'; return `<div><span>${esc(item.work_name)}: ${productionNum(item.actualRate,2)} ${esc(item.unit)}/чел.-смену</span><small class="production-deviation ${cls}">${label} ${deviation > 0 ? '+' : ''}${deviation}% · старт ${productionNum(item.expectedRate,2)}</small></div>`; }).join('')}</div></td><td>${productionNum(shift.downtime_hours,1)} ч.</td><td>×${productionNum(shift.complexity_factor,2)}</td><td>${esc(shift.notes || '—')}</td><td><div class="table-actions"><button class="button subtle compact" data-edit-production-shift="${shift.id}">Изменить</button><button class="button subtle compact production-delete-shift" data-delete-production-shift="${shift.id}" title="Удалить ошибочный отчёт">Удалить</button></div></td></tr>`).join('')}</tbody></table></div>` : empty('Смены пока не закрывались','Заполни первый отчёт — CRM сохранит факт и начнёт уточнять производительность.');
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
  $('productionShiftForm').reset(); $('productionShiftForm').elements.id.value = ''; $('productionShiftDialogTitle').textContent = 'Закрыть смену';
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
  } catch (error) { piRecordError(error.message, 'Производство · План работ', error); toast(error.message,true); }
});
$('productionShiftForm').addEventListener('submit', async e => {
  e.preventDefault(); const rows = [...$('productionShiftLines').querySelectorAll('[data-production-edit-row]')];
  const lines = rows.map(row => Object.fromEntries([...row.querySelectorAll('[data-prod-field]')].map(field => [field.dataset.prodField, field.value]))).filter(line => Number(line.quantity_done) > 0);
  if (!lines.length && !$('shiftNotes').value.trim()) { toast('Если за смену ничего не сделано, укажи причину в примечании.', true); $('shiftNotes').focus(); return; }
  const form = e.currentTarget, data = { id: form.elements.id.value, project_id: Number($('shiftProjectSelect').value), shift_date: $('shiftDate').value, workers_count: Number($('shiftWorkers').value), shift_hours: Number($('shiftHours').value), downtime_hours: Number($('shiftDowntime').value), complexity_factor: Number($('shiftDifficulty').value), notes: $('shiftNotes').value, lines };
  try {
    const saved = data.id ? await window.crm.updateWorkShift(data) : await window.crm.saveWorkShift(data);
    closeDialog('productionShiftDialog');
    toast(data.id ? `Отчёт смены №${saved.shift_id} исправлен.` : `Смена №${saved.shift_id} закрыта. Факт сохранён; производственная модель и прогноз обновлены.`);
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
    $('productionReportStart').value = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;
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
$('productionHistory').addEventListener('click', async e => {
  const editButton = e.target.closest('[data-edit-production-shift]');
  const deleteButton = e.target.closest('[data-delete-production-shift]');
  try {
    if (editButton) {
      const shift = await window.crm.getWorkShift(Number(editButton.dataset.editProductionShift));
      if (!shift) throw new Error('Отчёт смены не найден.');
      const data = await window.crm.productionOverview();
      $('shiftProjectSelect').innerHTML = productionCurrentProjectOptions(data.projects, shift.project_id);
      $('productionShiftForm').elements.id.value = shift.id;
      $('shiftDate').value = shift.shift_date; $('shiftWorkers').value = shift.workers_count;
      $('shiftHours').value = shift.shift_hours; $('shiftDowntime').value = shift.downtime_hours;
      $('shiftDifficulty').value = String(shift.complexity_factor); $('shiftNotes').value = shift.notes || '';
      productionRenderRows('productionShiftLines','shift',shift.lines);
      $('productionShiftDialogTitle').textContent = 'Исправить отчёт смены';
      openDialog('productionShiftDialog'); return;
    }
    if (!deleteButton) return;
    const id = Number(deleteButton.dataset.deleteProductionShift);
    if (!confirm(`Удалить отчёт смены №${id}? Объём исчезнет из истории и будет исключён из расчёта производительности. Это действие нельзя отменить.`)) return;
    await window.crm.deleteWorkShift(id); toast(`Отчёт смены №${id} удалён.`);
    await Promise.all([refreshProduction(), refreshEstimateLearningRates()]);
  } catch (error) { toast(error.message,true); }
});

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
let pinUnlockResolve = null;
let startupGatePromise = null;
let startupUnlocked = false;
function refreshStartupSettings() {
  refreshSearchApiStatus();
  refreshNotificationSettings().catch(() => { $('notificationStatus').textContent = 'Настройки уведомлений недоступны'; });
}
async function initializeStartupGate() {
  if (startupGatePromise) return startupGatePromise;
  startupGatePromise = (async () => {
    const status = await window.crm.getPinStatus();
    if (!status.enabled) { startupUnlocked = true; refreshStartupSettings(); return true; }
    $('pinLockScreen').hidden = false;
    $('pinUnlockInput').focus();
    if (startupSplash) startupSplash.classList.add('is-hidden');
    return new Promise(resolve => { pinUnlockResolve = resolve; });
  })();
  return startupGatePromise;
}
$('pinUnlockForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('pinUnlockBtn'), input = $('pinUnlockInput'), status = $('pinUnlockStatus');
  button.disabled = true;
  status.textContent = 'Проверяем PIN…';
  try {
    const result = await window.crm.verifyPin({ pin: input.value });
    if (result.ok) {
      startupUnlocked = true;
      $('pinLockScreen').hidden = true;
      refreshStartupSettings();
      status.textContent = '';
      input.value = '';
      if (pinUnlockResolve) { pinUnlockResolve(true); pinUnlockResolve = null; }
      return;
    }
    input.value = '';
    input.focus();
    status.textContent = result.lockedForMs > 0
      ? 'Слишком много неверных попыток. Подожди 30 секунд и попробуй снова.'
      : `Неверный PIN. Осталось попыток: ${result.remainingAttempts}.`;
  } catch (error) {
    status.textContent = error.message || 'Не удалось проверить PIN.';
  } finally { button.disabled = false; }
});
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
Promise.race([
  initializeStartupGate().then(() => refreshDashboard()),
  new Promise((_, reject) => window.setTimeout(() => reject(new Error('Превышено время ожидания загрузки обзора (10 секунд). Проверьте локальную базу и перезапустите программу.')), 10000))
])
  .catch(e => {
    toast(`Не удалось загрузить обзор: ${e.message}`, true);
    const target = $('recentLeads');
    if (target) {
      target.textContent = '';
      const errorBox = document.createElement('div');
      errorBox.className = 'empty-state';
      const heading = document.createElement('strong'); heading.textContent = 'Не удалось загрузить данные';
      const detail = document.createElement('span'); detail.textContent = e.message || 'Неизвестная ошибка';
      const retry = document.createElement('button'); retry.className = 'button subtle'; retry.type = 'button'; retry.textContent = 'Перезапустить интерфейс'; retry.addEventListener('click', () => location.reload());
      errorBox.append(heading, detail, retry); target.append(errorBox);
    }
  })
  .finally(hideStartupSplash);
// PI does not query business data until the startup PIN gate has been passed.
setInterval(() => { if (startupUnlocked) refreshPiCoach().catch(() => {}); }, 5 * 60 * 1000);
