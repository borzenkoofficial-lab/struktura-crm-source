'use strict';

function buildProductionIntelligence(data = {}, options = {}) {
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const history = Array.isArray(data.history) ? data.history : [];
  const totals = data.totals || {};
  const today = validDate(options.today) || new Date().toISOString().slice(0, 10);
  const alerts = [];
  const add = (level, title, message, projectId = null, key = '') => alerts.push({ level, title, message, projectId, key: key || title });

  let forecastableCount = 0;
  let plannedCount = 0;
  let projectsNeedingData = 0;
  for (const project of projects) {
    const title = String(project.title || `Объект ${project.id ?? ''}`).trim();
    const planCount = finiteNonNegative(project.planCount);
    const shiftCount = finiteNonNegative(project.shiftCount);
    const forecast = project.forecast || {};
    if (planCount > 0) plannedCount += 1;
    if (planCount > 0 && forecast.estimated === true) forecastableCount += 1;
    if (planCount === 0) {
      projectsNeedingData += 1;
      add('warning', `Нет производственного плана: ${title}`, `По объекту «${title}» не заполнен производственный план. Прогноз срока недоступен.`, project.id ?? null);
    } else if (forecast.estimated !== true) {
      projectsNeedingData += 1;
      add('warning', `Недостаточно данных: ${title}`, `По объекту «${title}» недостаточно данных для надёжного прогноза. Проверь план и отчёты смен.`, project.id ?? null);
    }
    for (const line of (Array.isArray(forecast.lines) ? forecast.lines : [])) {
      if (line?.overPlan) add('warning', `Превышен план: ${title}`, `По работе «${String(line.name || 'Без названия')}» превышен плановый объём. Проверь исходный объём и факт.`, project.id ?? null);
    }
    if (shiftCount > 0 && validDate(project.lastShiftDate)) {
      const age = daysBetween(project.lastShiftDate, today);
      if (age !== null && age >= 7) add('warning', `Нет свежих отчётов: ${title}`, `Последняя смена зафиксирована ${age} дн. назад. Проверь, ведётся ли производство и внесены ли отчёты смен.`, project.id ?? null);
    }
  }

  const workHistory = new Map();
  let validPerformanceCount = 0;
  let invalidPerformanceCount = 0;
  let highDowntimeCount = 0;
  for (const shift of history) {
    const shiftHours = Number(shift.shift_hours);
    const downtimeHours = Number(shift.downtime_hours);
    if (Number.isFinite(shiftHours) && shiftHours > 0 && Number.isFinite(downtimeHours) && downtimeHours >= 1 && downtimeHours / shiftHours >= 0.25) {
      const project = projects.find(item => Number(item.id) === Number(shift.project_id));
      const projectName = project?.title ? ` · ${project.title}` : '';
      const percent = Math.round(downtimeHours / shiftHours * 100);
      highDowntimeCount += 1;
      add(percent >= 50 ? 'danger' : 'warning', `Высокий простой${projectName}`, `В смене ${shift.shift_date || 'без даты'} простой составил ${downtimeHours} ч. (${percent}% смены). Зафиксируй причину и проверь, что можно устранить до следующей смены.`, shift.project_id ?? null, `downtime:${shift.project_id}:${shift.shift_date}`);
    }
    for (const performance of (Array.isArray(shift.performance) ? shift.performance : [])) {
      const name = String(performance.work_name || 'Без названия').trim();
      const unit = String(performance.unit || '').trim();
      const actualRate = Number(performance.actualRate);
      const expectedRate = Number(performance.expectedRate);
      const deviation = Number(performance.deviationPct);
      if (!name || !Number.isFinite(actualRate) || actualRate <= 0 || !Number.isFinite(expectedRate) || expectedRate <= 0 || !Number.isFinite(deviation)) {
        invalidPerformanceCount += 1;
        continue;
      }
      validPerformanceCount += 1;
      const key = `${name.toLocaleLowerCase('ru-RU')}|${unit.toLocaleLowerCase('ru-RU')}`;
      if (!workHistory.has(key)) workHistory.set(key, { name, unit, observations: [] });
      workHistory.get(key).observations.push({
        date: validDate(shift.shift_date) || '0000-00-00',
        projectId: shift.project_id ?? null,
        actualRate,
        expectedRate,
        deviation
      });
    }
  }

  let comparableWorkTypes = 0;
  let decliningWorkTypes = 0;
  let lowProductivityWorkTypes = 0;
  let unstableWorkTypes = 0;
  for (const work of workHistory.values()) {
    const rows = work.observations.sort((a, b) => b.date.localeCompare(a.date));
    if (rows.length < 3) continue;
    comparableWorkTypes += 1;
    const recent = rows.slice(0, 3);
    const recentMedian = median(recent.map(row => row.deviation));
    const projectId = recent[0].projectId;
    const label = work.unit ? `${work.name} (${work.unit})` : work.name;
    if (recentMedian <= -15) {
      lowProductivityWorkTypes += 1;
      const reasons = recent.map(row => `${row.date}: ${Math.round(row.deviation)}%`).join(', ');
      add('warning', `Устойчивая выработка ниже нормы: ${work.name}`,
        `Медианное отклонение за последние ${recent.length} учтённые наблюдения — ${Math.round(recentMedian)}% от скорректированной нормы (${label}). Проверь состав бригады, простой, перенос/вынос, сложность основания и корректность объёма. Наблюдения: ${reasons}.`,
        projectId, `low-productivity:${work.name}:${work.unit}`);
    }
    if (rows.length >= 6) {
      const previousMedian = median(rows.slice(3, 6).map(row => row.deviation));
      if (previousMedian - recentMedian >= 15) {
        decliningWorkTypes += 1;
        add('warning', `Выработка ухудшается: ${work.name}`,
          `Медианное отклонение последних 3 наблюдений — ${Math.round(recentMedian)}%, предыдущих 3 — ${Math.round(previousMedian)}%. Сравни условия смен, доступность фронта работ, простой и фактические трудозатраты прежде, чем менять норму.`,
          projectId, `decline:${work.name}:${work.unit}`);
      }
      const recentValues = recent.map(row => row.deviation);
      const spread = Math.max(...recentValues) - Math.min(...recentValues);
      if (spread >= 40) {
        unstableWorkTypes += 1;
        add('warning', `Нестабильная выработка: ${work.name}`,
          `Разброс отклонения в последних 3 наблюдениях — ${Math.round(spread)} п.п. Данных пока недостаточно для одной надёжной нормы: сравни условия и исключи ошибки ввода.`,
          projectId, `unstable:${work.name}:${work.unit}`);
      }
    }
  }

  const shiftCount = finiteNonNegative(totals.shifts);
  const workRecords = finiteNonNegative(totals.work_records);
  const summary = projects.length === 0
    ? 'Нет активных объектов для анализа. Добавь производственный план и отчёты смен, чтобы ПИ мог рассчитывать сроки и сравнивать фактическую выработку.'
    : forecastableCount === 0
      ? `Надёжный прогноз пока недоступен: заполненные планы с расчётным прогнозом есть по 0 из ${projects.length} объектов. Учтено ${shiftCount} смен; зафиксировано ${workRecords} записей выработки.`
      : `Прогноз доступен по ${forecastableCount} из ${projects.length} объектов. Учтено ${shiftCount} смен и ${workRecords} записей выработки; сравнение по истории доступно для ${comparableWorkTypes} видов работ.`;

  const dataQuality = {
    projectsWithoutForecast: projectsNeedingData,
    validPerformanceObservations: validPerformanceCount,
    invalidPerformanceObservations: invalidPerformanceCount,
    comparableWorkTypes,
    highDowntimeShifts: highDowntimeCount,
    lowProductivityWorkTypes,
    decliningWorkTypes,
    unstableWorkTypes
  };
  // Local adaptive calibration: estimate a conservative correction from observed/expected
  // productivity ratios. This is a recommendation only; it never silently rewrites catalog norms.
  const learningModels = [...workHistory.values()].map(work => {
    const rows = work.observations.slice().sort((a, b) => b.date.localeCompare(a.date));
    const ratios = rows.map(row => row.actualRate / row.expectedRate).filter(value => Number.isFinite(value) && value > 0);
    const observedFactor = median(ratios);
    const count = ratios.length;
    const weight = count / (count + 5);
    const suggestedFactor = count >= 5
      ? Math.max(0.85, Math.min(1.15, 1 + (observedFactor - 1) * weight))
      : 1;
    return {
      workName: work.name,
      unit: work.unit,
      observations: count,
      observedFactor: Number(observedFactor.toFixed(3)),
      suggestedFactor: Number(suggestedFactor.toFixed(3)),
      medianDeviationPct: Math.round((observedFactor - 1) * 100),
      status: count >= 5 && Math.abs(suggestedFactor - 1) >= 0.03 ? 'candidate' : count >= 3 ? 'watch' : 'collecting'
    };
  }).sort((a, b) => b.observations - a.observations);

  const calibrationCandidates = learningModels.filter(model => model.status === 'candidate');
  const learningSummary = calibrationCandidates.length
    ? `Есть ${calibrationCandidates.length} кандидатов на осторожную калибровку норм по накопленному факту. Изменения пока предложены, но не применяются автоматически.`
    : 'Автокалибровка пока не предлагает менять нормы: нужно не менее 5 корректных наблюдений по одному виду работ и устойчивое отклонение от нормы.';

  const uniqueAlerts = [];
  const seen = new Set();
  for (const alert of alerts) {
    if (seen.has(alert.key)) continue;
    seen.add(alert.key);
    uniqueAlerts.push(alert);
  }
  const priority = { danger: 0, warning: 1, info: 2 };
  uniqueAlerts.sort((a, b) => (priority[a.level] ?? 9) - (priority[b.level] ?? 9));
  return { projectCount: projects.length, forecastableCount, shiftCount, workRecords, summary, alerts: uniqueAlerts, dataQuality, learningModels, learningSummary };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}
function daysBetween(from, to) {
  const a = validDate(from), b = validDate(to);
  if (!a || !b) return null;
  return Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildProductionIntelligence };
if (typeof window !== 'undefined') window.StrukturaProductionIntelligence = { buildProductionIntelligence };
