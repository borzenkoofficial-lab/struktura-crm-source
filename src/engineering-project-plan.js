'use strict';
(function(root) {
  const round = (n, digits = 2) => {
    const p = 10 ** digits;
    return Math.round((n + Number.EPSILON) * p) / p;
  };
  const positive = (value, label, allowZero = false, max = 1e9) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error(label + ': требуется ' + (allowZero ? 'неотрицательное' : 'положительное') + ' число.');
    if (n > max) throw new Error(label + ': значение не должно превышать ' + max + '.');
    return n;
  };
  function normalizeOperations(operations) {
    if (!Array.isArray(operations) || operations.length === 0) throw new Error('Добавь хотя бы одну технологическую операцию.');
    if (operations.length > 100) throw new Error('В одном объекте допускается не более 100 операций.');
    const ids = new Set();
    const normalized = operations.map((op, index) => {
      const id = String(op.id || '').trim();
      const name = String(op.name || '').trim();
      if (!id || ids.has(id)) throw new Error('У каждой операции должен быть уникальный ID.');
      ids.add(id);
      if (!name) throw new Error('Укажи название операции №' + (index + 1) + '.');
      const quantity = positive(op.quantity, name + ' · объём');
      const productivity = positive(op.productivity, name + ' · производительность');
      const crewSize = positive(op.crewSize ?? 5, name + ' · бригада');
      const hoursPerShift = positive(op.hoursPerShift ?? 8, name + ' · часы смены');
      if (!Number.isInteger(crewSize) || crewSize < 1 || crewSize > 200) throw new Error(name + ': численность бригады должна быть целым числом от 1 до 200.');
      if (hoursPerShift < 1 || hoursPerShift > 24) throw new Error(name + ': длительность смены должна быть от 1 до 24 часов.');
      const difficultyFactor = positive(op.difficultyFactor ?? 1, name + ' · коэффициент сложности');
      if (difficultyFactor < 0.1 || difficultyFactor > 3) throw new Error(name + ': коэффициент сложности должен быть от 0,1 до 3.');
      const observations = Array.isArray(op.observations) ? op.observations : [];
      const predecessors = Array.isArray(op.predecessors) ? [...new Set(op.predecessors.map(String))] : [];
      if (predecessors.includes(id)) throw new Error(name + ': операция не может зависеть сама от себя.');
      return {
        ...op, id, name, quantity, productivity, crewSize, hoursPerShift, difficultyFactor, observations, predecessors,
        wagePerWorkerShift: positive(op.wagePerWorkerShift ?? 0, name + ' · оплата', true),
        pricePerUnit: positive(op.pricePerUnit ?? 0, name + ' · цена', true),
        extraCostPerUnit: positive(op.extraCostPerUnit ?? 0, name + ' · доп. расходы', true),
        fixedCosts: positive(op.fixedCosts ?? 0, name + ' · постоянные расходы', true),
        overheadPercent: positive(op.overheadPercent ?? 0, name + ' · накладные расходы', true, 100),
        taxPercent: positive(op.taxPercent ?? 0, name + ' · налог', true, 100),
        reservePercent: positive(op.reservePercent ?? 15, name + ' · резерв срока', true, 100)
      };
    });
    for (const op of normalized) {
      for (const predecessor of op.predecessors) {
        if (!ids.has(predecessor)) throw new Error(op.name + ': зависимость "' + predecessor + '" не найдена.');
      }
    }
    return normalized;
  }
  function schedulePass(ordered, durationFor, availableWorkers, finishField) {
    const scheduled = new Map();
    const resourceTimeline = [];
    for (const op of ordered) {
      const duration = durationFor(op);
      const readyAt = op.predecessors.reduce((max, id) => Math.max(max, scheduled.get(id)[finishField]), 0);
      let start = readyAt;
      if (op.crewSize > availableWorkers) {
        throw new Error(op.name + ': требуется ' + op.crewSize + ' рабочих, но в пуле только ' + availableWorkers + '. Увеличь общую численность или уменьши бригаду операции.');
      }
      let attempts = 0;
      while (attempts++ < 10000) {
        const end = start + duration;
        const checkpoints = [start, ...resourceTimeline
          .filter(task => task.start > start && task.start < end)
          .map(task => task.start)
          .sort((a,b) => a-b)];
        let conflict = null;
        for (const point of checkpoints) {
          const active = resourceTimeline.filter(task => task.start <= point + 1e-9 && task.finish > point + 1e-9);
          const used = active.reduce((sum, task) => sum + task.workers, 0);
          if (used + op.crewSize > availableWorkers) {
            conflict = active;
            break;
          }
        }
        if (!conflict) break;
        const next = Math.min(...conflict.map(task => task.finish));
        if (!Number.isFinite(next) || next <= start + 1e-9) {
          throw new Error('Не удалось распределить рабочую силу для операции «' + op.name + '».');
        }
        start = next;
      }
      if (attempts >= 10000) throw new Error('Слишком сложный график ресурсов. Раздели объект на несколько этапов.');
      const finish = start + duration;
      scheduled.set(op.id, { start, finish, duration });
      resourceTimeline.push({ id: op.id, start, finish, workers: op.crewSize });
    }
    return scheduled;
  }
  function calculateProjectPlan(operations, options = {}) {
    const items = normalizeOperations(operations);
    const totalCrew = items.reduce((sum, op) => sum + op.crewSize, 0);
    const availableWorkers = positive(options.availableWorkers ?? totalCrew, 'Общее число доступных рабочих');
    if (!Number.isInteger(availableWorkers) || availableWorkers > 2000) throw new Error('Общее число рабочих должно быть целым от 1 до 2000.');
    const byId = new Map(items.map(op => [op.id, op]));
    const state = new Map();
    const ordered = [];
    function visit(op, chain = []) {
      const status = state.get(op.id);
      if (status === 'done') return;
      if (status === 'visiting') throw new Error('Обнаружен цикл технологических зависимостей: ' + [...chain, op.name].join(' → '));
      state.set(op.id, 'visiting');
      op.predecessors.forEach(id => visit(byId.get(id), [...chain, op.name]));
      state.set(op.id, 'done');
      ordered.push(op);
    }
    items.forEach(op => visit(op));
    const rateCore = root.StrukturaProductionRateCore ||
      (typeof require === 'function' ? require('./production-model.js') : null);
    const durations = new Map();
    for (const op of ordered) {
      const rateModel = op.observations.length && rateCore && typeof rateCore.buildRateModel === 'function'
        ? rateCore.buildRateModel({
            baselineProductivity: op.productivity,
            observations: op.observations,
            targetDifficulty: op.difficultyFactor,
            targetCrewSize: op.crewSize
          })
        : null;
      const effectiveProductivity = rateModel ? rateModel.effectiveProductivity : op.productivity / op.difficultyFactor;
      const personShifts = op.quantity / effectiveProductivity;
      const duration = personShifts / op.crewSize * 8 / op.hoursPerShift;
      if (![effectiveProductivity, personShifts, duration].every(Number.isFinite) ||
          effectiveProductivity <= 0 || personShifts <= 0 || duration <= 0) {
        throw new Error(op.name + ': расчёт вышел за допустимый числовой диапазон. Проверь объём, производительность и размер бригады.');
      }
      durations.set(op.id, { effectiveProductivity, personShifts, duration, observations: rateModel ? rateModel.observations : 0 });
    }
    const actualSchedule = schedulePass(ordered, op => durations.get(op.id).duration, availableWorkers, 'finish');
    const plannedSchedule = schedulePass(ordered, op => durations.get(op.id).duration * (1 + op.reservePercent / 100), availableWorkers, 'finish');
    const scheduled = new Map();
    for (const op of ordered) {
      const { effectiveProductivity, personShifts, duration, observations } = durations.get(op.id);
      const actual = actualSchedule.get(op.id);
      const planned = plannedSchedule.get(op.id);
      const laborCost = personShifts * (8 / op.hoursPerShift) * op.wagePerWorkerShift;
      const directCost = laborCost + op.quantity * op.extraCostPerUnit + op.fixedCosts;
      const overhead = directCost * op.overheadPercent / 100;
      const revenue = op.quantity * op.pricePerUnit;
      const tax = revenue * op.taxPercent / 100;
      const totalCost = directCost + overhead + tax;
      const profit = revenue - totalCost;
      scheduled.set(op.id, {
        id: op.id, name: op.name, predecessors: op.predecessors,
        quantity: op.quantity, productivity: round(effectiveProductivity, 3), observationsCount: observations,
        personShifts: round(personShifts), crewShifts: round(duration),
        startShift: round(actual.start), finishShift: round(actual.finish),
        plannedStartShift: round(planned.start), plannedFinishShift: round(planned.finish),
        laborCost: round(laborCost), directCost: round(directCost), overhead: round(overhead),
        tax: round(tax), totalCost: round(totalCost), revenue: round(revenue), profit: round(profit),
        marginPercent: revenue > 0 ? round(profit / revenue * 100) : null,
        crewSize: op.crewSize, hoursPerShift: op.hoursPerShift, reservePercent: op.reservePercent
      });
    }
    const results = items.map(op => scheduled.get(op.id));
    const totalCost = results.reduce((sum, op) => sum + op.totalCost, 0);
    const revenue = results.reduce((sum, op) => sum + op.revenue, 0);
    const laborCost = results.reduce((sum, op) => sum + op.laborCost, 0);
    const directCost = results.reduce((sum, op) => sum + op.directCost, 0);
    const overhead = results.reduce((sum, op) => sum + op.overhead, 0);
    const tax = results.reduce((sum, op) => sum + op.tax, 0);
    const profit = revenue - totalCost;
    return {
      operations: results, operationCount: results.length, availableWorkers,
      totalPersonShifts: round(results.reduce((sum, op) => sum + op.personShifts, 0)),
      totalLaborCost: round(laborCost), directCost: round(directCost), overhead: round(overhead),
      tax: round(tax), totalCost: round(totalCost), revenue: round(revenue), profit: round(profit),
      marginPercent: revenue > 0 ? round(profit / revenue * 100) : null,
      durationShifts: round(Math.max(...results.map(op => op.finishShift))),
      plannedDurationShifts: round(Math.max(...results.map(op => op.plannedFinishShift))),
      parallelismNote: 'График распределяет доступных рабочих между операциями. Параллельная работа разрешена только в пределах указанной общей численности; зависимости и резерв срока учитываются отдельно.'
    };
  }
  function buildCalendarSchedule(result, options = {}) {
    if (!result || !Array.isArray(result.operations) || result.operations.length === 0) {
      throw new Error('Сначала рассчитай комплексный объект.');
    }
    const startDate = String(options.startDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Дата начала объекта не указана.');
    const parsed = new Date(startDate + 'T12:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== startDate) {
      throw new Error('Дата начала объекта указана некорректно.');
    }
    const weekdaysOnly = options.weekdaysOnly !== false;
    function dateAtShift(shift, isFinish) {
      const offset = isFinish ? Math.max(0, Math.ceil(shift - 1e-9) - 1) : Math.max(0, Math.floor(shift + 1e-9));
      const date = new Date(parsed.getTime());
      if (weekdaysOnly) {
        while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
      }
      let workday = 0;
      while (workday < offset) {
        date.setUTCDate(date.getUTCDate() + 1);
        const day = date.getUTCDay();
        if (!weekdaysOnly || (day !== 0 && day !== 6)) workday++;
      }
      return date.toISOString().slice(0, 10);
    }
    const dateLabel = value => {
      const [year, month, day] = value.split('-');
      return day + '.' + month + '.' + year;
    };
    return {
      startDate, weekdaysOnly,
      operations: result.operations.map(op => ({
        id: op.id, name: op.name, crewSize: op.crewSize,
        startShift: op.startShift, finishShift: op.finishShift,
        plannedStartShift: op.plannedStartShift, plannedFinishShift: op.plannedFinishShift,
        startDate: dateAtShift(op.startShift, false),
        finishDate: dateAtShift(op.finishShift, true),
        plannedStartDate: dateAtShift(op.plannedStartShift, false),
        plannedFinishDate: dateAtShift(op.plannedFinishShift, true)
      })).sort((a, b) => a.plannedStartShift - b.plannedStartShift || a.plannedFinishShift - b.plannedFinishShift)
        .map(op => ({ ...op, startDateLabel: dateLabel(op.startDate), finishDateLabel: dateLabel(op.finishDate),
          plannedStartDateLabel: dateLabel(op.plannedStartDate), plannedFinishDateLabel: dateLabel(op.plannedFinishDate) }))
    };
  }
  const api = { calculateProjectPlan, normalizeOperations, buildCalendarSchedule };
  root.StrukturaEngineeringProjectPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
