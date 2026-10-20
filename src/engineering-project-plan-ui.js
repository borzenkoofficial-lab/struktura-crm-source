'use strict';
(function() {
  const $ = id => document.getElementById(id);
  const startDateInput = document.getElementById('engProjectStartDate');
  if (startDateInput) {
    const today = new Date();
    startDateInput.value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  }
  const planner = window.StrukturaEngineeringProjectPlan;
  const catalogApi = window.StrukturaEstimateCalculator;
  if (!planner || !catalogApi || !$('engProjectPlanRows')) return;
  const STORAGE_KEY = 'struktura-engineering-project-plans-v1';
  const rub = n => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n || 0));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog = catalogApi.getCatalog().filter(x => Number(x.productivity) > 0);
  let operations = [];
  let lastResult = null;
  let activeSavedPlanId = null;
  let activeSavedPlanCreatedAt = null;
  const makeId = () => 'op-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const makePlanId = () => 'plan-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function addOperation(seed = {}) {
    const item = catalog.find(x => x.id === seed.catalogId) || catalog[0];
    if (!item) throw new Error('В каталоге нет работ с положительной стартовой производительностью.');
    operations.push({
      id: makeId(), catalogId: item.id, name: seed.name || item.name, quantity: seed.quantity ?? 100,
      productivity: seed.productivity ?? item.productivity, crewSize: seed.crewSize ?? 5, hoursPerShift: seed.hoursPerShift ?? 8,
      wagePerWorkerShift: seed.wagePerWorkerShift ?? 4000, pricePerUnit: seed.pricePerUnit ?? item.price ?? 0,
      extraCostPerUnit: seed.extraCostPerUnit ?? item.cost ?? 0, fixedCosts: seed.fixedCosts ?? 0,
      overheadPercent: seed.overheadPercent ?? 10, taxPercent: seed.taxPercent ?? 6,
      reservePercent: seed.reservePercent ?? 15, difficultyFactor: seed.difficultyFactor ?? 1,
      predecessors: seed.predecessors || []
    });
    renderRows();
  }
  function splitEstimateLine(line) {
    const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : line.includes(',') ? ',' : null;
    if (!delimiter) return [line.trim()];
    const cells = [];
    let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        cells.push(cell.trim()); cell = '';
      } else cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  }
  function guessCatalogItem(text) {
    const value = String(text || '').toLocaleLowerCase('ru-RU');
    let item = catalog.find(x => value.includes(String(x.name || '').toLocaleLowerCase('ru-RU')));
    if (item) return item;
    const aliases = [
      [/стяжк|бетонн.*пол/, /стяжк|пол/],
      [/перегород|демонтаж стен|кирпичн.*стен/, /перегород|стен|кирпич/],
      [/плитк|керамогранит/, /плитк|керамогранит/],
      [/вынос|перенос мусор/, /вынос|перенос/],
      [/погрузк/, /погруз/],
      [/контейнер|вывоз мусор/, /контейнер|вывоз/],
      [/уборк/, /уборк/],
      [/потол/, /потол/]
    ];
    for (const [descriptionPattern, catalogPattern] of aliases) {
      if (!descriptionPattern.test(value)) continue;
      item = catalog.find(x => catalogPattern.test(String(x.name || '').toLocaleLowerCase('ru-RU')));
      if (item) return item;
    }
    return null;
  }
  function parseEstimateText(text) {
    const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const parsed = [];
    const skipped = [];
    for (const line of lines) {
      if (/наименован|количеств|единиц[аы]?\s+измер|итого|всего|сметная стоимость/i.test(line)) continue;
      const cells = splitEstimateLine(line);
      const item = guessCatalogItem(cells[0] || line);
      const numericCell = cells.slice(1).map(x => x.replace(/\s/g, '').replace(',', '.')).find(x => /^\d+(?:\.\d+)?$/.test(x));
      const withUnit = line.match(/(\d+(?:[.,]\d+)?)\s*(м²|м2|кв\.?\s*м|м³|м3|п\.?\s*м|пог\.?\s*м|шт\.?|т\b|усл\.?)/i);
      const quantity = withUnit ? Number(withUnit[1].replace(',', '.')) : numericCell == null ? NaN : Number(numericCell);
      if (!item || !Number.isFinite(quantity) || quantity <= 0) {
        skipped.push(line);
        continue;
      }
      parsed.push({ item, quantity, sourceLine: line });
    }
    if (!parsed.length) throw new Error('Не удалось распознать строки. Используй формат «Название работы; объём; единица», например «Демонтаж цементной стяжки; 850; м²».');
    if (parsed.length > 100) throw new Error('В одном плане допускается не более 100 строк работ.');
    return { parsed, skipped };
  }
  function importEstimateText(text) {
    const { parsed, skipped } = parseEstimateText(text);
    if (!window.confirm('Распознано строк работ: ' + parsed.length + '. Заменить текущий список операций?')) return;
    operations = [];
    for (const entry of parsed) {
      const id = makeId();
      const item = entry.item;
      operations.push({
        id, catalogId: item.id, name: item.name, quantity: entry.quantity,
        productivity: Number(item.productivity), crewSize: 5, hoursPerShift: 8,
        wagePerWorkerShift: 4000, pricePerUnit: Number(item.price || 0),
        extraCostPerUnit: Number(item.cost || 0), fixedCosts: 0,
        overheadPercent: 10, taxPercent: 6, reservePercent: 15,
        difficultyFactor: 1, predecessors: []
      });
    }
    renderRows();
    $('engEstimateImportStatus').textContent = 'Загружено операций: ' + parsed.length + '. Пропущено строк: ' + skipped.length + (skipped.length ? ' — ' + skipped.slice(0, 3).join(' | ') : '') + '. Проверь объёмы, единицы, нормы, состав бригад и зависимости: по умолчанию работы не связаны технологически.';
  }
  function renderRows() {
    const host = $('engProjectPlanRows');
    host.innerHTML = operations.map((op, index) => {
      const options = catalog.map(item => '<option value="' + safe(item.id) + '"' + (item.id === op.catalogId ? ' selected' : '') + '>' + safe(item.name) + ' · ' + safe(item.unit || 'ед.') + '</option>').join('');
      const predecessorOptions = operations.filter(other => other.id !== op.id).map(other => '<option value="' + safe(other.id) + '"' + (op.predecessors.includes(other.id) ? ' selected' : '') + '>' + safe(other.name) + '</option>').join('');
      return '<article class="eng-plan-operation" data-plan-op="' + safe(op.id) + '">' +
        '<div class="eng-plan-operation-head"><strong>' + String(index + 1).padStart(2, '0') + ' · Операция</strong><button type="button" class="button subtle small-button" data-plan-remove="' + safe(op.id) + '"' + (operations.length === 1 ? ' disabled' : '') + '>Удалить</button></div>' +
        '<div class="eng-form-grid">' +
        '<label class="wide">Работа из каталога<select data-plan-field="catalogId">' + options + '</select></label>' +
        '<label>Название операции<input data-plan-field="name" maxlength="180" value="' + safe(op.name) + '" required></label>' +
        '<label>Объём<input data-plan-field="quantity" type="number" min="0.01" step="any" value="' + safe(op.quantity) + '" required></label>' +
        '<label>Норма, ед./чел.-8 ч<input data-plan-field="productivity" type="number" min="0.01" step="any" value="' + safe(op.productivity) + '" required></label>' +
        '<label>Бригада, человек<input data-plan-field="crewSize" type="number" min="1" max="200" step="1" value="' + safe(op.crewSize) + '" required></label>' +
        '<label>Часов в смене<input data-plan-field="hoursPerShift" type="number" min="1" max="24" step="0.5" value="' + safe(op.hoursPerShift) + '" required></label>' +
        '<label>Оплата рабочего за смену, ₽<input data-plan-field="wagePerWorkerShift" type="number" min="0" step="any" value="' + safe(op.wagePerWorkerShift) + '"></label>' +
        '<label>Цена клиенту за единицу, ₽<input data-plan-field="pricePerUnit" type="number" min="0" step="any" value="' + safe(op.pricePerUnit) + '"></label>' +
        '<label>Доп. затраты за единицу, ₽<input data-plan-field="extraCostPerUnit" type="number" min="0" step="any" value="' + safe(op.extraCostPerUnit) + '"></label>' +
        '<label>Постоянные расходы, ₽<input data-plan-field="fixedCosts" type="number" min="0" step="any" value="' + safe(op.fixedCosts) + '"></label>' +
        '<label>Сложность ×<input data-plan-field="difficultyFactor" type="number" min="0.1" max="3" step="0.05" value="' + safe(op.difficultyFactor) + '"></label>' +
        '<label>Накладные расходы, %<input data-plan-field="overheadPercent" type="number" min="0" max="100" step="1" value="' + safe(op.overheadPercent) + '"></label>' +
        '<label>Налог с выручки, %<input data-plan-field="taxPercent" type="number" min="0" max="100" step="0.5" value="' + safe(op.taxPercent) + '"></label>' +
        '<label>Резерв срока, %<input data-plan-field="reservePercent" type="number" min="0" max="100" step="1" value="' + safe(op.reservePercent) + '"></label>' +
        '<label class="wide">Выполнять после (можно выбрать несколько)<select data-plan-field="predecessors" multiple size="3">' + predecessorOptions + '</select><small>Без зависимости операции считаются способными стартовать с начала объекта.</small></label>' +
        '</div></article>';
    }).join('');
  }
  function readRows() {
    return operations.map(op => {
      const card = $('engProjectPlanRows').querySelector('[data-plan-op="' + op.id + '"]');
      const value = field => card.querySelector('[data-plan-field="' + field + '"]');
      const catalogChanged = value('catalogId').value !== op.catalogId;
      const item = catalog.find(x => x.id === value('catalogId').value);
      return {
        id: op.id, catalogId: value('catalogId').value,
        name: value('name').value.trim() || item?.name || 'Операция',
        quantity: Number(value('quantity').value),
        productivity: Number(catalogChanged ? item?.productivity : value('productivity').value),
        crewSize: Number(value('crewSize').value), hoursPerShift: Number(value('hoursPerShift').value),
        wagePerWorkerShift: Number(value('wagePerWorkerShift').value), pricePerUnit: Number(value('pricePerUnit').value),
        extraCostPerUnit: Number(value('extraCostPerUnit').value), fixedCosts: Number(value('fixedCosts').value),
        difficultyFactor: Number(value('difficultyFactor').value), reservePercent: Number(value('reservePercent').value),
        overheadPercent: Number(value('overheadPercent').value), taxPercent: Number(value('taxPercent').value),
        predecessors: Array.from(value('predecessors').selectedOptions).map(option => option.value)
      };
    });
  }
  function renderCalendar(result) {
    const host = $('engProjectCalendarRows');
    const panel = $('engProjectCalendar');
    const calendar = planner.buildCalendarSchedule(result, {
      startDate: $('engProjectStartDate').value,
      weekdaysOnly: $('engProjectWeekdaysOnly').checked
    });
    host.innerHTML = '<div class="eng-calendar-table-wrap"><table class="eng-calendar-table"><thead><tr><th>Операция</th><th>Бригада</th><th>Начало</th><th>Окончание</th><th>С резервом</th></tr></thead><tbody>' +
      calendar.operations.map(op => '<tr><td>' + safe(op.name) + '</td><td>' + op.crewSize + ' чел.</td><td>' + op.startDateLabel + '</td><td>' + op.finishDateLabel + '</td><td>' + op.plannedStartDateLabel + ' — ' + op.plannedFinishDateLabel + '</td></tr>').join('') +
      '</tbody></table></div><p class="eng-note">Плановые даты с резервом показывают отдельный сценарий с увеличенной длительностью каждой операции. Это календарная оценка по заданным нормам, а не гарантия выполнения.</p>';
    panel.hidden = false;
  }
  function renderResult(result) {
    lastResult = result;
    $('engProjectPlanResult').hidden = false;
    $('engProjectPlanResult').innerHTML =
      '<div class="eng-result-grid eng-result-grid-spaced">' +
      metric('Операций', result.operationCount, 'В едином плане объекта') +
      metric('Доступно рабочих', result.availableWorkers, 'Общий ограниченный ресурс') +
      metric('Срок по зависимостям', result.durationShifts + ' смен', 'Без резерва; критический путь') +
      metric('Срок с резервом', result.plannedDurationShifts + ' смен', 'По резерву каждой операции') +
      metric('Трудоёмкость', result.totalPersonShifts + ' чел.-смен', 'Сумма трудоёмкости операций') +
      metric('Себестоимость', rub(result.totalCost), 'Зарплата, доп. затраты, накладные и налог') +
      metric('Выручка по введённым ценам', rub(result.revenue), '0 ₽ означает, что цена не задана') +
      metric('Прибыль', rub(result.profit), result.marginPercent == null ? 'Маржа не вычисляется без выручки' : 'Маржа ' + result.marginPercent + '%') +
      '</div><p class="eng-note">' + safe(result.parallelismNote) + '</p>' +
      '<div class="eng-plan-timeline">' + result.operations.slice().sort((a,b) => a.startShift-b.startShift).map(op =>
        '<div class="eng-plan-timeline-row"><span>' + safe(op.name) + '</span><div class="eng-plan-track"><i style="left:' + (result.plannedDurationShifts ? op.plannedStartShift / result.plannedDurationShifts * 100 : 0) + '%;width:' + (result.plannedDurationShifts ? Math.max(1, (op.plannedFinishShift - op.plannedStartShift) / result.plannedDurationShifts * 100) : 100) + '%"></i></div><strong>' + op.startShift + '–' + op.finishShift + '</strong><small>' + op.crewShifts + ' смены · ' + rub(op.totalCost) + '</small></div>'
      ).join('') + '</div>';
    $('engProjectPlanWarnings').textContent = 'План является расчётной оценкой. Расписание учитывает общий пул рабочих, но не календарные выходные, оборудование, окна доступа и фактическую доступность подрядчиков.';
  }
  function metric(label, value, note) {
    return '<div class="eng-result"><span>' + safe(label) + '</span><strong>' + safe(value) + '</strong><small>' + safe(note) + '</small></div>';
  }
  $('engParseEstimateBtn').addEventListener('click', () => {
    try { importEstimateText($('engEstimateImportText').value); }
    catch (error) { $('engEstimateImportStatus').textContent = error.message || 'Не удалось разобрать смету.'; }
  });
  let importedEstimateSheets = [];
  function estimateRowsToText(rows) {
    return (rows || []).map(row => (row || []).map(value => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t')).join('\n');
  }
  function showEstimateSheet(index) {
    const sheet = importedEstimateSheets[index];
    if (!sheet) return;
    $('engEstimateImportText').value = estimateRowsToText(sheet.rows);
    $('engEstimateImportStatus').textContent = 'Файл: ' + importedEstimateFileName + '. Лист: ' + sheet.name + '. Проверь текст, затем нажми «Разобрать перечень».';
  }
  let importedEstimateFileName = '';
  $('engUploadEstimateBtn').addEventListener('click', async () => {
    try {
      if (!window.crm?.importEngineeringEstimateFile) throw new Error('Импорт файлов недоступен: обнови приложение до версии с поддержкой ПИ.');
      $('engEstimateImportStatus').textContent = 'Выбери файл сметы в открывшемся окне…';
      const result = await window.crm.importEngineeringEstimateFile();
      if (!result || result.canceled) {
        $('engEstimateImportStatus').textContent = 'Загрузка отменена.';
        return;
      }
      importedEstimateFileName = result.fileName || 'смета';
      if (Array.isArray(result.sheets) && result.sheets.length) {
        importedEstimateSheets = result.sheets;
        const selector = $('engEstimateSheetSelect');
        selector.innerHTML = importedEstimateSheets.map((sheet, index) => '<option value="' + index + '">' + safe(sheet.name || ('Лист ' + (index + 1))) + '</option>').join('');
        selector.hidden = importedEstimateSheets.length < 2;
        selector.value = '0';
        showEstimateSheet(0);
        if (importedEstimateSheets.length > 1) $('engEstimateImportStatus').textContent += ' Доступно листов: ' + importedEstimateSheets.length + '. Выбери нужный лист.';
      } else {
        importedEstimateSheets = [];
        $('engEstimateSheetSelect').hidden = true;
        $('engEstimateImportText').value = result.text || '';
        $('engEstimateImportStatus').textContent = 'Файл: ' + importedEstimateFileName + '. Извлечено символов: ' + String(result.text || '').length + '. Проверь извлечённый текст, затем нажми «Разобрать перечень».';
      }
    } catch (error) {
      $('engEstimateImportStatus').textContent = error.message || 'Не удалось загрузить файл сметы.';
    }
  });
  $('engEstimateSheetSelect').addEventListener('change', event => showEstimateSheet(Number(event.target.value)));
  $('engPlanAddOperationBtn').addEventListener('click', () => {
    try { const previous = operations[operations.length - 1]; addOperation({ predecessors: previous ? [previous.id] : [] }); }
    catch (error) { window.alert(error.message); }
  });
  $('engProjectPlanRows').addEventListener('change', event => {
    const field = event.target.dataset.planField;
    const card = event.target.closest('[data-plan-op]');
    if (!field || !card) return;
    const op = operations.find(x => x.id === card.dataset.planOp);
    if (!op) return;
    if (field === 'catalogId') {
      const item = catalog.find(x => x.id === event.target.value);
      if (item) { op.catalogId = item.id; op.name = item.name; op.productivity = item.productivity; op.pricePerUnit = item.price || 0; op.extraCostPerUnit = item.cost || 0; }
      renderRows();
    } else if (field === 'predecessors') {
      op.predecessors = Array.from(event.target.selectedOptions).map(option => option.value);
    }
  });
  $('engProjectPlanRows').addEventListener('input', event => {
    const field = event.target.dataset.planField;
    const card = event.target.closest('[data-plan-op]');
    if (!field || !card || ['catalogId','predecessors'].includes(field)) return;
    const op = operations.find(x => x.id === card.dataset.planOp);
    if (op) op[field] = event.target.type === 'number' ? Number(event.target.value) : event.target.value;
  });
  $('engProjectPlanRows').addEventListener('click', event => {
    const button = event.target.closest('[data-plan-remove]');
    if (!button) return;
    operations = operations.filter(op => op.id !== button.dataset.planRemove);
    operations.forEach(op => { op.predecessors = op.predecessors.filter(id => id !== button.dataset.planRemove); });
    renderRows();
  });
  function renderSavedPlans(history) {
    const host = $('engProjectPlanHistory');
    if (!history.length) {
      host.innerHTML = '<div class="eng-plan-history-empty">Сохранённых планов пока нет. Рассчитай первый объект — он появится здесь.</div>';
      return;
    }
    const recent = history.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    host.innerHTML = recent.map(record => {
      const stamp = new Date(record.createdAt || '');
      const stampLabel = Number.isFinite(stamp.getTime()) ? stamp.toLocaleString('ru-RU') : 'Дата не указана';
      const operationCount = Array.isArray(record.operations) ? record.operations.length : 0;
      const revenue = record.result?.revenue;
      const profit = record.result?.profit;
      return '<article class="eng-plan-history-item"><div class="eng-plan-history-copy"><strong>' + safe(record.title || 'Комплексный объект') +
        '</strong><small>' + safe(stampLabel) + ' · ' + operationCount + ' операций' +
        (Number.isFinite(Number(revenue)) ? ' · Выручка ' + safe(rub(revenue)) : '') +
        (Number.isFinite(Number(profit)) ? ' · Прибыль ' + safe(rub(profit)) : '') +
        '</small></div><div class="eng-plan-history-actions"><button type="button" class="button subtle small-button" data-plan-load="' + safe(record.id) + '">Открыть</button><button type="button" class="button subtle small-button" data-plan-delete="' + safe(record.id) + '">Удалить</button></div></article>';
    }).join('');
  }
  async function readPlanHistory() {
    const local = (() => {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(record => record && typeof record.id === 'string') : [];
      } catch { return []; }
    })();
    if (window.crm?.listEngineeringPlans) {
      let stored = await window.crm.listEngineeringPlans();
      if (local.length && window.crm.saveEngineeringPlan) {
        const existingIds = new Set(stored.map(record => record.id));
        const missing = local.filter(record => !existingIds.has(record.id)).slice(0, 100);
        for (const record of missing) await window.crm.saveEngineeringPlan(record);
        if (missing.length) stored = await window.crm.listEngineeringPlans();
      }
      return stored;
    }
    return local;
  }
  async function refreshPlanHistory() {
    const history = await readPlanHistory();
    $('engProjectPlanSavedCount').textContent = String(history.length);
    renderSavedPlans(history);
    return history;
  }
  function openSavedPlan(record) {
    if (!record || !Array.isArray(record.operations) || !record.operations.length) {
      throw new Error('В сохранённом плане нет операций. Создай новый план или восстанови экспорт JSON.');
    }
    const missingCatalog = record.operations.find(operation => !catalog.some(item => item.id === operation.catalogId));
    if (missingCatalog) throw new Error('В каталоге нет работы «' + String(missingCatalog.name || missingCatalog.catalogId) + '». Обнови каталог или создай новый план.');
    operations = record.operations.map(operation => ({
      ...operation,
      predecessors: Array.isArray(operation.predecessors) ? [...operation.predecessors] : []
    }));
    activeSavedPlanId = String(record.id || '');
    activeSavedPlanCreatedAt = record.createdAt || new Date().toISOString();
    $('engProjectPlanTitle').value = record.title || 'Комплексный объект';
    if (Number.isInteger(Number(record.result?.availableWorkers)) && Number(record.result.availableWorkers) >= 1) {
      $('engProjectAvailableWorkers').value = String(Number(record.result.availableWorkers));
    }
    const calendarOptions = record.calendarOptions || record.result?.calendarOptions;
    if (calendarOptions && typeof calendarOptions === 'object') {
      const date = String(calendarOptions.startDate || '');
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00Z') : null;
      if (parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) $('engProjectStartDate').value = date;
      if (typeof calendarOptions.weekdaysOnly === 'boolean') $('engProjectWeekdaysOnly').checked = calendarOptions.weekdaysOnly;
    }
    renderRows();
    const result = planner.calculateProjectPlan(readRows(), { availableWorkers: Number($('engProjectAvailableWorkers').value) });
    renderResult(result);
    renderCalendar(result);
    $('engProjectPlanSaveNote').textContent = 'Открыт сохранённый план «' + (record.title || 'Комплексный объект') + '». Следующий расчёт обновит эту запись.';
  }
  $('engProjectPlanHistory').addEventListener('click', async event => {
    const openButton = event.target.closest('[data-plan-load]');
    const deleteButton = event.target.closest('[data-plan-delete]');
    if (!openButton && !deleteButton) return;
    try {
      const history = await readPlanHistory();
      if (openButton) {
        const record = history.find(item => item.id === openButton.dataset.planLoad);
        if (!record) throw new Error('Сохранённый план не найден. Обнови историю и попробуй снова.');
        openSavedPlan(record);
        return;
      }
      const record = history.find(item => item.id === deleteButton.dataset.planDelete);
      if (!record) throw new Error('Сохранённый план уже удалён.');
      if (!window.confirm('Удалить сохранённый план «' + String(record.title || 'Комплексный объект') + '»? Действие нельзя отменить.')) return;
      if (window.crm?.deleteEngineeringPlan) {
        await window.crm.deleteEngineeringPlan(record.id);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.filter(item => item.id !== record.id)));
      }
      if (activeSavedPlanId === record.id) {
        activeSavedPlanId = null;
        activeSavedPlanCreatedAt = null;
      }
      await refreshPlanHistory();
      $('engProjectPlanSaveNote').textContent = 'Сохранённый план удалён.';
    } catch (error) {
      window.alert(error.message || 'Не удалось изменить историю планов.');
    }
  });
  $('engPlanNewBtn').addEventListener('click', () => {
    if (operations.length && !window.confirm('Начать новый план? Несохранённые изменения текущей формы будут потеряны.')) return;
    activeSavedPlanId = null;
    activeSavedPlanCreatedAt = null;
    operations = [];
    lastResult = null;
    $('engProjectPlanTitle').value = 'Комплексный объект';
    $('engProjectPlanResult').hidden = true;
    $('engProjectCalendar').hidden = true;
    $('engProjectPlanWarnings').textContent = '';
    $('engProjectPlanSaveNote').textContent = 'Новый план: добавь операции и рассчитай объект для сохранения.';
    renderRows();
  });
  $('engProjectPlanCalculateBtn').addEventListener('click', async () => {
    try {
      const rows = readRows();
      const availableWorkers = Number($('engProjectAvailableWorkers').value);
      const result = planner.calculateProjectPlan(rows, { availableWorkers });
      renderResult(result);
      renderCalendar(result);
      const updatingExisting = Boolean(activeSavedPlanId);
      const calendarOptions = {
        startDate: $('engProjectStartDate').value,
        weekdaysOnly: $('engProjectWeekdaysOnly').checked
      };
      const record = {
        id: activeSavedPlanId || makePlanId(),
        title: $('engProjectPlanTitle').value.trim() || 'Комплексный объект',
        createdAt: activeSavedPlanCreatedAt || new Date().toISOString(),
        operations: rows,
        calendarOptions,
        result: { ...result, calendarOptions }
      };
      if (window.crm?.saveEngineeringPlan) {
        await window.crm.saveEngineeringPlan(record);
        activeSavedPlanId = record.id;
        activeSavedPlanCreatedAt = record.createdAt;
        await refreshPlanHistory();
        $('engProjectPlanSaveNote').textContent = (updatingExisting ? 'План обновлён' : 'План сохранён') + ' в SQLite: ' + record.title + '. Он включается в резервную копию базы CRM.';
      } else {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const history = Array.isArray(parsed) ? parsed : [];
        const index = history.findIndex(item => item && item.id === record.id);
        if (index >= 0) history[index] = record;
        else history.unshift(record);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
        activeSavedPlanId = record.id;
        activeSavedPlanCreatedAt = record.createdAt;
        await refreshPlanHistory();
        $('engProjectPlanSaveNote').textContent = (updatingExisting ? 'План обновлён' : 'План сохранён') + ' локально: ' + record.title + '. Режим браузера без SQLite.';
      }
    } catch (error) { window.alert(error.message || 'Не удалось рассчитать и сохранить комплексный объект.'); }
  });
  ['engProjectStartDate', 'engProjectWeekdaysOnly'].forEach(id => {
    $(id).addEventListener('change', () => {
      if (!lastResult) return;
      try { renderCalendar(lastResult); }
      catch (error) { window.alert(error.message || 'Не удалось обновить календарь объекта.'); }
    });
  });
  $('engProjectPlanExportBtn').addEventListener('click', async () => {
    try {
      const history = await readPlanHistory();
      const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), plans: history }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'struktura-project-plans-' + new Date().toISOString().slice(0,10) + '.json'; a.click(); URL.revokeObjectURL(url);
    } catch (error) { window.alert(error.message || 'Не удалось экспортировать историю планов.'); }
  });
  refreshPlanHistory().catch(error => {
    $('engProjectPlanSaveNote').textContent = 'Не удалось загрузить историю планов: ' + String(error.message || error);
    $('engProjectPlanHistory').innerHTML = '<div class="eng-plan-history-empty">Ошибка загрузки истории. Проверь резервную копию и перезапусти CRM.</div>';
  });
  const firstWork = catalog.find(item => item.id === 'd-floor-screed') || catalog[0];
  addOperation({ catalogId: firstWork.id, name: 'Демонтаж стяжки', quantity: 100 });
  const first = operations[0];
  const carryWork = catalog.find(item => item.id === 'd-carry') || catalog[0];
  addOperation({ catalogId: carryWork.id, name: 'Вынос строительного мусора', quantity: 5, predecessors: [first.id] });
  const second = operations[1];
  const containerWork = catalog.find(item => item.id === 'x-container') || catalog[0];
  addOperation({ catalogId: containerWork.id, name: 'Контейнер и вывоз', quantity: 1, predecessors: [second.id] });
})();