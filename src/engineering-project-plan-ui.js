'use strict';
(function() {
  const $ = id => document.getElementById(id);
  const planner = window.StrukturaEngineeringProjectPlan;
  const catalogApi = window.StrukturaEstimateCalculator;
  if (!planner || !catalogApi || !$('engProjectPlanRows')) return;
  const STORAGE_KEY = 'struktura-engineering-project-plans-v1';
  const rub = n => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n || 0));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog = catalogApi.getCatalog().filter(x => Number(x.productivity) > 0);
  let operations = [];
  let lastResult = null;
  const makeId = () => 'op-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
  async function readPlanHistory() {
    const local = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } })();
    if (window.crm?.listEngineeringPlans) {
      const stored = await window.crm.listEngineeringPlans();
      if (!stored.length && local.length && window.crm.saveEngineeringPlan) {
        for (const record of local.slice(0, 100)) await window.crm.saveEngineeringPlan(record);
        return await window.crm.listEngineeringPlans();
      }
      return stored;
    }
    return local;
  }
  $('engProjectPlanCalculateBtn').addEventListener('click', async () => {
    try {
      const rows = readRows();
      const availableWorkers = Number($('engProjectAvailableWorkers').value);
      const result = planner.calculateProjectPlan(rows, { availableWorkers });
      renderResult(result);
      renderCalendar(result);
      const record = { id: makeId(), title: $('engProjectPlanTitle').value.trim() || 'Комплексный объект', createdAt: new Date().toISOString(), operations: rows, result };
      if (window.crm?.saveEngineeringPlan) {
        await window.crm.saveEngineeringPlan(record);
        const history = await window.crm.listEngineeringPlans();
        $('engProjectPlanSavedCount').textContent = String(history.length);
        $('engProjectPlanSaveNote').textContent = 'План сохранён в SQLite: ' + record.title + '. Он включается в резервную копию базы CRM.';
      } else {
        const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        history.unshift(record);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
        $('engProjectPlanSavedCount').textContent = String(Math.min(100, history.length));
        $('engProjectPlanSaveNote').textContent = 'План сохранён локально: ' + record.title + '. Режим браузера без SQLite.';
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
  readPlanHistory().then(history => { $('engProjectPlanSavedCount').textContent = String(history.length); }).catch(error => {
    $('engProjectPlanSaveNote').textContent = 'Не удалось загрузить историю из SQLite: ' + String(error.message || error);
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