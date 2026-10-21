'use strict';
(function() {
  const $ = id => document.getElementById(id);
  const api = window.StrukturaEngineeringCalculator;
  const catalogApi = window.StrukturaEstimateCalculator;
  if (!api || !catalogApi || !$('view-engineering')) return;
  let catalog = [];
  let history = api.loadHistory();
  const rub = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value || 0));
  const num = id => Number($(id).value);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const round = (n, d=2) => Math.round((Number(n)+Number.EPSILON)*10**d)/10**d;
  function selectedItem() { return catalog.find(x => x.id === $('engWorkSelect').value) || catalog[0]; }
  function deriveConditionFactor(item) {
    const result = api.calculateConditionFactor({
      workName: item?.name, workId: item?.id, thicknessMm: num('engThickness'),
      reinforced: $('engReinforced').value, floor: num('engFloor'), elevator: $('engElevator').value,
      carryDistanceM: num('engCarryDistance'), method: $('engMethod').value, baseDifficulty: num('engDifficulty')
    });
    $('engDerivedFactor').value = result.total;
    return result;
  }
  function readInput(item, observations) {
    const factors = deriveConditionFactor(item);
    return {
      title: $('engProjectName').value.trim() || 'Расчёт объекта',
      description: $('engWorkDescription').value.trim(),
      catalogId: item.id, workName: item.name, unit: item.unit || 'м²',
      quantity: num('engQuantity'), baselineProductivity: num('engBaselineRate'),
      crewSize: num('engCrew'), hoursPerShift: num('engHours'), wagePerWorkerShift: num('engWage'),
      pricePerUnit: num('engPrice'), extraCostPerUnit: num('engExtraCost'), fixedCosts: num('engFixedCosts'),
      overheadPercent: num('engOverhead'), taxPercent: num('engTax'), targetMarginPercent: num('engMargin'),
      reservePercent: num('engReserve'), targetShifts: num('engTargetShifts'), difficultyFactor: factors.total, observations: observations,
      conditions: {
        thicknessMm: num('engThickness'), reinforced: $('engReinforced').value, floor: num('engFloor'),
        elevator: $('engElevator').value, carryDistanceM: num('engCarryDistance'), method: $('engMethod').value,
        difficultyFactor: factors.total, conditionFactors: factors
      }
    };
  }
  function parseWorkDescription() {
    const text = $('engWorkDescription').value.trim();
    if (!text) throw new Error('Сначала опиши работу и условия объекта.');
    const lower = text.toLocaleLowerCase('ru-RU');
    const aliases = [
      [/стяжк|бетонн.*пол/, ['стяжк', 'пол']],
      [/перегород|кирпичн.*стен|демонтаж стен/, ['перегород', 'стен']],
      [/плитк|керамогранит/, ['плитк']],
      [/обо[и]?|штукатурк/, ['обо', 'штукатур']],
      [/потол/, ['потол']],
      [/вынос|перенос мусор/, ['вынос']],
      [/погрузк/, ['погруз']],
      [/контейнер|вывоз мусор/, ['контейнер', 'вывоз']]
    ];
    let item = catalog.find(x => lower.includes(String(x.name || '').toLocaleLowerCase('ru-RU')));
    if (!item) {
      for (const [pattern] of aliases) {
        if (!pattern.test(lower)) continue;
        item = catalog.find(x => pattern.test(String(x.name || '').toLocaleLowerCase('ru-RU')));
        if (item) break;
      }
    }
    if (item) {
      $('engWorkSelect').value = item.id;
      $('engBaselineRate').value = item.productivity;
    }
    const quantityMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(м²|м2|кв\.?\s*м|м³|м3|п\.?\s*м|пог\.?\s*м|шт\.?|тонн(?:ы)?|т\b)/i);
    if (quantityMatch) $('engQuantity').value = Number(quantityMatch[1].replace(',', '.'));
    const thicknessMatch = text.match(/(?:толщин\w*|стяжк\w*)[^\d]{0,18}(\d+(?:[.,]\d+)?)\s*мм/i) || text.match(/(\d+(?:[.,]\d+)?)\s*мм/i);
    if (thicknessMatch && /стяжк|бетон|толщин/i.test(lower)) $('engThickness').value = Number(thicknessMatch[1].replace(',', '.'));
    if (/без армирован|не армирован|армировани[ея] нет/i.test(lower)) $('engReinforced').value = 'no';
    else if (/армирован|сетка|арматур/i.test(lower)) $('engReinforced').value = 'yes';
    const floorMatch = text.match(/(\d+)\s*(?:-й|-ый|-ой)?\s*этаж/i) || text.match(/этаж\s*(\d+)/i);
    if (floorMatch) $('engFloor').value = Number(floorMatch[1]);
    if (/лифта нет|без лифта|нет лифта|лифт отсутств/i.test(lower)) $('engElevator').value = 'no';
    else if (/есть лифт|грузовой лифт|лифт работает/i.test(lower)) $('engElevator').value = 'yes';
    const carryMatch = text.match(/(?:вынос|перенос|до контейнера)[^\d]{0,18}(\d+(?:[.,]\d+)?)\s*м/i) || text.match(/(\d+(?:[.,]\d+)?)\s*м[^\n,;]{0,12}(?:вынос|контейнер)/i);
    if (carryMatch) $('engCarryDistance').value = Number(carryMatch[1].replace(',', '.'));
    if (/вручную|ручной|ручное/i.test(lower)) $('engMethod').value = 'manual';
    else if (/механизирован|механически|отбойн.*молот/i.test(lower)) $('engMethod').value = 'mechanized';
    else if (/комбинирован/i.test(lower)) $('engMethod').value = 'mixed';
    if (/очень сложн|особо сложн/i.test(lower)) $('engDifficulty').value = '1.5';
    else if (/сложн/i.test(lower)) $('engDifficulty').value = '1.25';
    deriveConditionFactor(selectedItem());
    const found = [];
    if (item) found.push('вид работ');
    if (quantityMatch) found.push('объём');
    if (thicknessMatch && /стяжк|бетон|толщин/i.test(lower)) found.push('толщина');
    if (floorMatch) found.push('этаж');
    if (carryMatch) found.push('расстояние выноса');
    if (/лифта нет|без лифта|нет лифта|лифт отсутств|есть лифт|грузовой лифт|лифт работает/i.test(lower)) found.push('лифт');
    if (/армирован|сетка|арматур/i.test(lower)) found.push('армирование');
    if (!found.length) throw new Error('Не удалось распознать параметры. Укажи вид работ и объём, например: «демонтаж стяжки 850 м², толщина 70 мм, 5-й этаж, лифта нет».');
    window.alert('Из описания распознано: ' + found.join(', ') + '. Проверь поля перед расчётом.');
  }
  function getLocalObservations(item) { return api.observationsFor(history, item.id, item.id); }
  async function getRateEvidence(item, crewSize) {
    const local = getLocalObservations(item);
    let externalModel = null;
    if (window.crm?.productionRateModels && item?.id) {
      try {
        const models = await window.crm.productionRateModels([item.id], crewSize);
        externalModel = models?.find(x => x.catalog_id === item.id) || null;
      } catch (error) { console.warn('PI rate model unavailable for engineering calculator:', error); }
    }
    return api.selectRateEvidence(local, externalModel);
  }
  function renderMetrics(item, observations) {
    const count = observations.length;
    $('engHistoryCount').textContent = String(history.length);
    $('engObservationCount').textContent = String(history.reduce((sum, p) => sum + (p.observations?.length || 0), 0));
    const rates = observations.map(o => Number(o.quantity) / (Number(o.people) * Number(o.hours) / 8) * Number(o.conditionFactor || 1)).filter(x => Number.isFinite(x) && x > 0).sort((a,b)=>a-b);
    const med = rates.length ? (rates.length % 2 ? rates[(rates.length-1)/2] : (rates[rates.length/2-1]+rates[rates.length/2])/2) : null;
    $('engLearnedRate').textContent = med == null ? '—' : round(med, 2) + ' ' + (item?.unit || '') + '/чел.-8 ч';
    $('engConfidence').textContent = count >= 5 ? 'Уточнённая' : count >= 3 ? 'Средняя' : count ? 'Предварительная' : 'Стартовый';
    $('engConfidenceNote').textContent = count >= 5 ? count + ' наблюдений по этой работе' : count ? count + ' наблюдений; требуется накопление фактов' : 'Накопите фактические данные';
  }
  function renderResult(result, input, count) {
    $('engResultEmpty').hidden = true;
    $('engResult').hidden = false;
    $('engResult').innerHTML = '<div class="eng-confidence ' + (count < 3 ? 'low' : '') + '">' +
      (count >= 5 ? '5+ наблюдений · норма уточняется по факту' : count >= 3 ? '3–4 наблюдения · предварительное обучение' : count ? '1–2 наблюдения · низкая уверенность' : 'Стартовая норма · без фактической истории') +
      '<br>Источник данных: ' + safe(result.rateEvidenceSource || 'Локальная история расчётов') + '</div>' +
      '<div class="eng-result-grid eng-result-grid-spaced">' +
      metric('Эффективная выработка', result.effectiveProductivity + ' ' + input.unit + '/чел.-8 ч', 'Базовая норма с учётом сложности и истории') +
      metric('Трудоёмкость', result.personShifts + ' чел.-смен', 'Восьмичасовой эквивалент на одного рабочего') +
      metric('Смен бригады', result.crewShifts, 'Расчёт без резерва, состав ' + input.crewSize + ' чел.') +
      metric('Срок с резервом', result.plannedShifts + ' смен', 'Для бригады ' + input.crewSize + ' чел.; резерв ' + input.reservePercent + '%') +
      metric('Рабочих для целевого срока', result.requiredCrewForTarget + ' чел.', 'Чтобы уложиться в ' + result.targetShifts + ' рабочих смен с резервом') +
      metric('Нужно выполнять за смену', result.dailyOutput + ' ' + input.unit, 'Средний объём за смену с учётом резерва для текущей бригады') +
      metric('Расчётная себестоимость', rub(result.totalCost), 'Зарплата + доп. затраты + накладные + налог') +
      metric('Прибыль по введённой цене', rub(result.profit), result.marginPercent == null ? 'Цена клиента не задана' : 'Маржа ' + result.marginPercent + '%') +
      metric('Минимальная цена за единицу', result.minimumPricePerUnit == null ? '—' : rub(result.minimumPricePerUnit), 'Покрытие расчётных затрат, без целевой прибыли') +
      metric('Цена за единицу для целевой маржи', result.targetPricePerUnit == null ? '—' : rub(result.targetPricePerUnit), 'Целевая маржа ' + input.targetMarginPercent + '% и налог ' + input.taxPercent + '%') + '</div>' +
      '<div class="eng-scenario-wrap"><h4>Сравнение численности бригады</h4><div class="eng-calendar-table-wrap"><table class="eng-calendar-table"><thead><tr><th>Рабочих</th><th>Срок без резерва</th><th>Срок с резервом</th><th>Объём за смену</th></tr></thead><tbody>' +
      (result.crewScenarios || []).map(s => '<tr' + (s.workers === input.crewSize ? ' class="eng-scenario-current"' : '') + '><td>' + s.workers + '</td><td>' + s.shifts + ' смен</td><td>' + s.plannedShifts + ' смен</td><td>' + s.outputPerShift + ' ' + safe(input.unit) + '</td></tr>').join('') +
      '</tbody></table></div><p class="eng-note">Сроки рассчитаны из текущей нормы выработки и условий. Реальная производительность не всегда растёт линейно с числом людей; уточняй её по фактическим сменам.</p></div>';
    $('engWarnings').innerHTML = (result.warnings || []).map(w => '<li>' + safe(w) + '</li>').join('');
  }
  function metric(label, value, note) {
    return '<div class="eng-result"><span>' + safe(label) + '</span><strong>' + safe(value) + '</strong><small>' + safe(note) + '</small></div>';
  }
  function renderHistory() {
    const host = $('engHistoryList'), select = $('engActualProject');
    const recent = history.slice().sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    host.innerHTML = recent.length ? recent.map(p => '<article class="eng-history-item"><strong>' + safe(p.title) + '</strong><p>' + safe(p.workName) + ' · ' + safe(p.quantity) + ' ' + safe(p.unit) + ' · ' + safe(new Date(p.createdAt).toLocaleString('ru-RU')) + '</p><p>Прогноз: ' + safe(p.result?.plannedShifts ?? '—') + ' смен · Себестоимость: ' + rub(p.result?.totalCost) + ' · Фактических наблюдений: ' + (Number.isFinite(Number(p.result?.observations)) ? Number(p.result.observations) : (p.observations || []).length) + (p.result?.rateEvidenceSource === 'Фактические сменные отчёты' ? ' · Источник: сменные отчёты' : '') + '</p><div class="eng-actions"><button class="button subtle small-button" data-eng-load="' + safe(p.id) + '">Загрузить расчёт</button><button class="button subtle small-button" data-eng-delete="' + safe(p.id) + '">Удалить из истории</button></div></article>').join('') : '<div class="eng-empty">История пока пуста. Первый расчёт сохранится здесь автоматически.</div>';
    select.innerHTML = recent.length ? recent.map(p => '<option value="' + safe(p.id) + '">' + safe(p.title) + ' · ' + safe(p.workName) + '</option>').join('') : '<option value="">Сначала сохрани расчёт</option>';
    const item = selectedItem();
    renderMetrics(item, item ? getLocalObservations(item) : []);
  }
  function populateCatalog() {
    catalog = catalogApi.getCatalog().filter(item => Number(item.productivity) > 0);
    $('engWorkSelect').innerHTML = catalog.map(item => '<option value="' + safe(item.id) + '">' + safe(item.name) + ' · ' + safe(item.unit) + ' · норма ' + safe(item.productivity) + '</option>').join('');
    if (catalog.length) $('engBaselineRate').value = catalog[0].productivity;
  }
  function loadProject(id) {
    const p = history.find(x => x.id === id);
    if (!p) return;
    $('engProjectName').value = p.title || '';
    $('engWorkDescription').value = p.description || '';
    $('engWorkSelect').value = p.catalogId;
    const item = selectedItem();
    $('engBaselineRate').value = p.baselineProductivity ?? item?.productivity ?? 8;
    $('engQuantity').value = p.quantity; $('engCrew').value = p.crewSize; $('engHours').value = p.hoursPerShift;
    $('engWage').value = p.wagePerWorkerShift; $('engPrice').value = p.pricePerUnit; $('engExtraCost').value = p.extraCostPerUnit;
    $('engFixedCosts').value = p.fixedCosts; $('engOverhead').value = p.overheadPercent; $('engTax').value = p.taxPercent;
    $('engMargin').value = p.targetMarginPercent; $('engReserve').value = p.reservePercent; $('engTargetShifts').value = p.targetShifts ?? 5; $('engDifficulty').value = p.difficultyFactor;
    $('engThickness').value = p.conditions?.thicknessMm ?? 50; $('engReinforced').value = p.conditions?.reinforced ?? 'no';
    $('engFloor').value = p.conditions?.floor ?? 1; $('engElevator').value = p.conditions?.elevator ?? 'yes';
    $('engCarryDistance').value = p.conditions?.carryDistanceM ?? 10; $('engMethod').value = p.conditions?.method ?? 'mechanized';
    deriveConditionFactor(item);
    if (p.result) renderResult(p.result, p, p.result.observations || 0);
  }
  async function calculateAndSave() {
    const item = selectedItem();
    if (!item) throw new Error('В каталоге нет работ с заданной производительностью.');
    if (!(num('engBaselineRate') > 0)) throw new Error('Укажи положительную стартовую производительность.');
    const evidence = await getRateEvidence(item, num('engCrew'));
    const observations = evidence.observations;
    const input = readInput(item, observations);
    // Apply learned evidence to a calculation copy. Keep the user's editable baseline
    // unchanged in history so the same shift sample is not blended repeatedly on reload.
    const calculationInput = api.applyRateEvidence(input, evidence);
    const result = api.calculateEngineeringEstimate(calculationInput);
    const externalCount = Number(evidence.externalModel?.observations || 0);
    result.observations = observations.length || externalCount;
    result.rateEvidenceSource = evidence.source;
    if (evidence.externalModel && observations.length === 0 && externalCount > 0) {
      const observedMedian = Number(evidence.externalModel.observedMedian);
      const observedWeight = Number(evidence.externalModel.observedWeight);
      result.observedMedian = Number.isFinite(observedMedian) && observedMedian > 0 ? observedMedian : null;
      result.learnedWeight = Number.isFinite(observedWeight) ? observedWeight : 0;
      result.warnings = (result.warnings || []).filter(w => !String(w).startsWith('Нет фактических наблюдений:'));
      if (externalCount < 3) result.warnings.push('Есть только 1–2 наблюдения: обученная норма предварительная.');
    }
    const p = { id: 'eng-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7), createdAt: new Date().toISOString(), ...input, result, observations: [] };
    history.unshift(p); history = history.slice(0, 500); api.saveHistory(history);
    renderResult(result, input, Number(result.observations ?? observations.length)); renderHistory();
  }
  $('engParseDescriptionBtn').addEventListener('click', () => { try { parseWorkDescription(); } catch (error) { window.alert(error.message || 'Не удалось разобрать описание.'); } });
  $('engWorkSelect').addEventListener('change', () => {
    const item = selectedItem();
    if (item) $('engBaselineRate').value = item.productivity;
    renderMetrics(item, item ? getLocalObservations(item) : []);
  });
  ['engThickness','engReinforced','engFloor','engElevator','engCarryDistance','engMethod','engDifficulty'].forEach(id => $(id).addEventListener('input', () => deriveConditionFactor(selectedItem())));
  ['engReinforced','engElevator','engMethod'].forEach(id => $(id).addEventListener('change', () => deriveConditionFactor(selectedItem())));
  $('engCalculateBtn').addEventListener('click', async () => {
    const button = $('engCalculateBtn'); button.disabled = true; button.textContent = 'Считаем…';
    try { await calculateAndSave(); } catch (error) { window.alert(error.message || 'Не удалось выполнить расчёт.'); }
    finally { button.disabled = false; button.textContent = 'Рассчитать и сохранить'; }
  });
  $('engResetBtn').addEventListener('click', () => {
    $('engProjectName').value = ''; $('engWorkDescription').value = ''; $('engQuantity').value = '100'; $('engCrew').value = '5'; $('engHours').value = '8';
    $('engWage').value = '4000'; $('engPrice').value = '0'; $('engExtraCost').value = '0'; $('engFixedCosts').value = '0';
    $('engOverhead').value = '10'; $('engTax').value = '6'; $('engMargin').value = '25'; $('engReserve').value = '15'; $('engTargetShifts').value = '5'; $('engDifficulty').value = '1';
    $('engThickness').value = '50'; $('engReinforced').value = 'no'; $('engFloor').value = '1'; $('engElevator').value = 'yes'; $('engCarryDistance').value = '10'; $('engMethod').value = 'mechanized';
    const item = selectedItem(); if (item) $('engBaselineRate').value = item.productivity;
  });
  $('engRefreshHistoryBtn').addEventListener('click', () => { history = api.loadHistory(); renderHistory(); });
  $('engHistoryList').addEventListener('click', event => {
    const load = event.target.closest('[data-eng-load]'), del = event.target.closest('[data-eng-delete]');
    if (load) loadProject(load.dataset.engLoad);
    if (del) {
      const p = history.find(x => x.id === del.dataset.engDelete);
      if (p && window.confirm('Удалить расчёт «' + p.title + '» из локальной истории? Фактические наблюдения этого расчёта тоже будут удалены.')) {
        history = history.filter(x => x.id !== del.dataset.engDelete); api.saveHistory(history); renderHistory();
      }
    }
  });
  $('engActualProject').addEventListener('change', () => { const p = history.find(x => x.id === $('engActualProject').value); if (p) $('engActualFactor').value = p.difficultyFactor || 1; });
  $('engSaveActualBtn').addEventListener('click', () => {
    try {
      const id = $('engActualProject').value, p = history.find(x => x.id === id);
      if (!p) throw new Error('Выбери сохранённый расчёт объекта.');
      history = api.recordActual(history, id, { catalogId: p.catalogId, workKey: p.catalogId, quantity: num('engActualQuantity'), people: num('engActualPeople'), hours: num('engActualHours'), conditionFactor: num('engActualFactor') });
      api.saveHistory(history); renderHistory();
      const item = selectedItem(); if (item) renderMetrics(item, getLocalObservations(item));
      window.alert('Фактический результат сохранён. Он будет учитываться в следующих расчётах этой работы.');
    } catch (error) { window.alert(error.message || 'Не удалось сохранить факт.'); }
  });
  $('engExportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), projects: history }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'СКОЛ-инженерная-история-' + new Date().toISOString().slice(0,10) + '.json'; a.click(); URL.revokeObjectURL(url);
  });
  $('engImportBtn').addEventListener('click', () => $('engImportFile').click());
  $('engImportFile').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()), incoming = Array.isArray(parsed) ? parsed : parsed.projects;
      if (!Array.isArray(incoming) || incoming.length > 5000 || incoming.some(p => !p || typeof p.id !== 'string' || !Array.isArray(p.observations))) throw new Error('Файл истории имеет неверный формат.');
      const map = new Map(history.map(p => [p.id, p]));
      for (const p of incoming) {
        const normalized = { ...p, observations: p.observations.filter(o => o && typeof o === 'object' && !Array.isArray(o)) };
        map.set(normalized.id, normalized);
      }
      history = [...map.values()].slice(-500); api.saveHistory(history); renderHistory();
      window.alert('Импортировано записей: ' + incoming.length + '. Совпадающие ID обновлены.');
    } catch (error) { window.alert('Не удалось импортировать историю: ' + error.message); }
    finally { event.target.value = ''; }
  });
  populateCatalog(); deriveConditionFactor(selectedItem()); renderHistory();
})();
