'use strict';

function buildProductionIntelligence(data = {}, options = {}) {
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const history = Array.isArray(data.history) ? data.history : [];
  const totals = data.totals || {};
  const today = validDate(options.today) || new Date().toISOString().slice(0, 10);
  const alerts = [];
  const recommendations = [];
  const performanceByWork = new Map();
  const downtimeByProject = new Map();
  const projectAssessments = [];
  let forecastableCount = 0;
  const add = (level, title, message, projectId = null) => alerts.push({ level, title, message, projectId });
  const recommend = (priority, title, reason, nextStep, projectId = null, evidence = 'CRM') => {
    recommendations.push({ priority, title, reason, nextStep, projectId, evidence });
  };

  // Assess each active object using only recorded plan, forecast and shift data.
  for (const project of projects) {
    const title = String(project.title || `Объект ${project.id ?? ''}`).trim();
    const planCount = finiteNonNegative(project.planCount);
    const shiftCount = finiteNonNegative(project.shiftCount);
    const forecast = project.forecast || {};
    const lines = Array.isArray(forecast.lines) ? forecast.lines : [];
    const riskFactors = [];
    const actions = [];
    if (planCount > 0 && forecast.estimated === true) forecastableCount += 1;
    if (planCount === 0) {
      add('warning', `Нет производственного плана: ${title}`, `По объекту «${title}» не заполнен производственный план. Прогноз срока недоступен.`, project.id ?? null);
      riskFactors.push('нет плана');
      actions.push('Заполни производственный план и нормы выработки');
    }
    if (planCount > 0 && forecast.estimated !== true) {
      add('warning', `Недостаточно данных: ${title}`, `По объекту «${title}» недостаточно данных для надёжного прогноза. Проверь план и отчёты смен.`, project.id ?? null);
      riskFactors.push('неполный прогноз');
      actions.push('Проверь нормы по каждой позиции и сохрани план');
    }
    for (const line of lines) {
      if (line?.overPlan) {
        const workName = String(line.name || 'Без названия');
        add('warning', `Превышен план: ${title}`, `По работе «${workName}» превышен плановый объём. Проверь исходный объём и факт.`, project.id ?? null);
        riskFactors.push('превышение объёма');
        actions.push(`Сверь план и факт по работе «${workName}»`);
      }
      const remaining = Number(line?.remainingQuantity);
      const teamShifts = Number(line?.teamShiftsRemaining);
      if (Number.isFinite(remaining) && remaining > 0 && (!Number.isFinite(teamShifts) || teamShifts < 0)) {
        riskFactors.push('неполный прогноз остатка');
        actions.push('Проверь расчёт остатка и производительности');
      }
    }
    if (shiftCount > 0 && validDate(project.lastShiftDate)) {
      const age = daysBetween(project.lastShiftDate, today);
      if (age !== null && age >= 7) {
        add('warning', `Нет свежих отчётов: ${title}`, `Последняя смена зафиксирована ${age} дн. назад. Проверь, ведётся ли производство и внесены ли отчёты смен.`, project.id ?? null);
        riskFactors.push('нет свежего факта');
        actions.push('Внеси актуальный отчёт смены или обнови статус объекта');
      }
    }
    const remainingShifts = Number(forecast.teamShiftsRemaining);
    const estimated = forecast.estimated === true && Number.isFinite(remainingShifts) && remainingShifts >= 0;
    projectAssessments.push({
      projectId: project.id ?? null,
      title,
      confidence: confidenceFor({ hasPlan: planCount > 0, estimated, shiftCount, observations: finiteNonNegative(forecast.observations) }),
      estimated,
      remainingTeamShifts: estimated ? round(remainingShifts, 1) : null,
      riskScore: Math.min(100, riskFactors.length * 25),
      riskFactors: [...new Set(riskFactors)],
      actions: [...new Set(actions)]
    });
    if (actions.length) recommend(riskFactors.includes('превышение объёма') ? 'high' : 'medium',
      `Проверить объект «${title}»`, [...new Set(riskFactors)].join(', '), [...new Set(actions)].slice(0, 2).join('; '), project.id ?? null);
  }

  // Analyse individual shifts, but never infer a productivity deviation without a valid comparison norm.
  for (const shift of history) {
    const shiftHours = Number(shift.shift_hours);
    const downtimeHours = Number(shift.downtime_hours);
    const workers = Number(shift.workers_count);
    const project = projects.find(item => Number(item.id) === Number(shift.project_id));
    const projectName = project?.title ? ` · ${project.title}` : '';
    if (Number.isFinite(shiftHours) && shiftHours > 0 && Number.isFinite(downtimeHours) && downtimeHours >= 0 && downtimeHours <= shiftHours && shift.project_id != null) {
      if (!downtimeByProject.has(Number(shift.project_id))) downtimeByProject.set(Number(shift.project_id), []);
      downtimeByProject.get(Number(shift.project_id)).push({ hours: downtimeHours, shiftHours, date: shift.shift_date || '' });
    }
    if (Number.isFinite(shiftHours) && shiftHours > 0 && Number.isFinite(downtimeHours) && downtimeHours >= 1 && downtimeHours <= shiftHours && downtimeHours / shiftHours >= 0.25) {
      const percent = Math.round(downtimeHours / shiftHours * 100);
      add(percent >= 50 ? 'danger' : 'warning', `Высокий простой${projectName}`, `В смене ${shift.shift_date || 'без даты'} простой составил ${downtimeHours} ч. (${percent}% смены). Зафиксируй причину и проверь, что можно устранить до следующей смены.`, shift.project_id ?? null);
    }
    // Work-hour allocations cannot exceed the shift's available crew capacity.
    if (Number.isFinite(workers) && workers > 0 && Number.isFinite(shiftHours) && shiftHours > 0 && Number.isFinite(downtimeHours) && downtimeHours >= 0 && downtimeHours <= shiftHours) {
      const lines = Array.isArray(shift.performance) ? shift.performance : [];
      const allocated = lines.reduce((sum, item) => {
        const people = Number(item.workers_count), hours = Number(item.hours);
        return Number.isFinite(people) && people > 0 && Number.isFinite(hours) && hours > 0 ? sum + people * hours : sum;
      }, 0);
      const capacity = workers * (shiftHours - downtimeHours);
      if (allocated > capacity + 0.05) {
        add('danger', `Проверь трудозатраты${projectName}`, `В смене ${shift.shift_date || 'без даты'} по работам распределено ${round(allocated, 1)} чел.-ч, а после простоя доступно ${round(capacity, 1)} чел.-ч. Возможен двойной учёт часов.`, shift.project_id ?? null);
        recommend('high', `Исправить часы смены ${shift.shift_date || ''}`.trim(), 'Сумма трудозатрат превышает доступную ёмкость бригады', 'Сверь людей и часы по каждой работе; не сохраняй двойной учёт как факт', shift.project_id ?? null, 'Проверка арифметики');
      }
    }
    for (const performance of (Array.isArray(shift.performance) ? shift.performance : [])) {
      const deviation = Number(performance.deviationPct);
      const workName = String(performance.work_name || 'Без названия').trim();
      const workKey = `${shift.project_id ?? 'unknown'}::${workName.toLocaleLowerCase('ru-RU')}`;
      if (!performanceByWork.has(workKey)) performanceByWork.set(workKey, { projectId: shift.project_id ?? null, workName, observations: [] });
      if (Number.isFinite(deviation)) performanceByWork.get(workKey).observations.push({ deviation, date: shift.shift_date || '' });
      if (Number.isFinite(deviation) && deviation <= -20) {
        add(deviation <= -35 ? 'danger' : 'warning', `Выработка ниже нормы${projectName}`, `Работа «${workName}» выработка на ${Math.abs(Math.round(deviation))}% ниже нормы. Проверь условия, простой и точность трудозатрат.`, shift.project_id ?? null);
      } else if (Number.isFinite(deviation) && deviation >= 150) {
        add('warning', `Аномально высокая выработка${projectName}`, `По работе «${workName}» факт выше нормы в ${((100 + deviation) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} раза. Это может быть реальный хороший результат, но сначала проверь единицы измерения, объём, часы и численность.`, shift.project_id ?? null);
      }
    }
  }

  // Repeated patterns matter more than one unusual shift. Trend comparison requires six records.
  for (const group of performanceByWork.values()) {
    const values = group.observations.map(item => item.deviation);
    const lowCount = values.filter(value => value <= -20).length;
    if (values.length >= 3 && lowCount >= 2) {
      const project = projects.find(item => Number(item.id) === Number(group.projectId));
      const projectName = project?.title ? ` · ${project.title}` : '';
      add('warning', `Повторяющееся отставание${projectName}`, `По работе «${group.workName}» отставание от нормы повторилось в ${lowCount} из ${values.length} учтённых записей. Сверь условия, норму производительности и состав бригады; не меняй норму по одной смене.`, group.projectId);
      recommend('medium', `Разобрать повторяющееся отставание: ${group.workName}`, `Ниже нормы ${lowCount} из ${values.length} наблюдений`, 'Сравни сложность, простой, состав бригады и часы; корректируй норматив только после проверки сопоставимых смен', group.projectId, `${values.length} наблюдений`);
    }
    if (values.length >= 6) {
      const recent = values.slice(0, 3), previous = values.slice(3, 6);
      const delta = median(recent) - median(previous);
      if (delta <= -15 || delta >= 15) {
        const worsening = delta < 0;
        add(worsening ? 'warning' : 'info', `${worsening ? 'Ухудшение' : 'Улучшение'} динамики: ${group.workName}`,
          `Медианное отклонение последних 3 наблюдений изменилось на ${Math.abs(Math.round(delta))} п.п. относительно предыдущих 3. ${worsening ? 'Проверь причины ухудшения до следующей смены.' : 'Проверь, воспроизводим ли результат на сопоставимых условиях.'}`, group.projectId);
      }
    }
  }

  for (const [projectId, entries] of downtimeByProject) {
    if (entries.length >= 3) {
      const high = entries.filter(entry => entry.hours / entry.shiftHours >= 0.25).length;
      if (high >= 2) {
        const project = projects.find(item => Number(item.id) === projectId);
        recommend('high', `Снизить повторяющиеся простои: ${project?.title || `объект ${projectId}`}`,
          `Существенный простой отмечен в ${high} из ${entries.length} записей в доступной истории`,
          'На ближайшей смене записать причину простоя отдельно: ожидание допуска, вывоз, инструмент, материалы или организация работ', projectId, `${entries.length} смен`);
      }
    }
  }

  const shiftCount = finiteNonNegative(totals.shifts);
  const workRecords = finiteNonNegative(totals.work_records);
  const recentDatedShifts = history.filter(shift => validDate(shift.shift_date) && daysBetween(shift.shift_date, today) >= 0 && daysBetween(shift.shift_date, today) <= 14).length;
  const plannedObjects = projects.filter(project => finiteNonNegative(project.planCount) > 0).length;
  const coverage = projects.length ? Math.round(forecastableCount / projects.length * 100) : 0;
  const confidence = projects.length === 0 ? 'нет активных объектов'
    : forecastableCount === 0 ? 'низкая'
      : coverage >= 80 && shiftCount >= 5 && workRecords >= 10 ? 'высокая'
        : coverage >= 50 && shiftCount >= 2 && workRecords >= 3 ? 'средняя' : 'низкая';
  const dataQuality = {
    confidence,
    forecastCoveragePct: coverage,
    plannedObjects,
    activeObjects: projects.length,
    recentShifts14d: recentDatedShifts,
    warnings: alerts.filter(alert => alert.level === 'danger' || alert.level === 'warning').length
  };
  recommendations.sort((a, b) => priorityValue(b.priority) - priorityValue(a.priority));
  const summary = projects.length === 0
    ? 'Нет активных объектов для анализа.'
    : forecastableCount === 0
      ? `Недостаточно данных для надёжного прогноза. План есть по ${plannedObjects} из ${projects.length} объектов; фиксируй фактические смены.`
      : `Прогноз доступен по ${forecastableCount} из ${projects.length} объектов (${coverage}% покрытия). Достоверность общей картины: ${confidence}. Учтено ${shiftCount} смен и ${workRecords} записей выработки.`;

  return {
    projectCount: projects.length, forecastableCount, shiftCount, workRecords,
    summary, alerts, recommendations: recommendations.slice(0, 8),
    dataQuality, projectAssessments
  };
}

function confidenceFor({ hasPlan, estimated, shiftCount, observations }) {
  if (!hasPlan || !estimated) return 'недостаточно данных';
  if (observations >= 5 && shiftCount >= 5) return 'высокая';
  if (observations >= 3 && shiftCount >= 3) return 'средняя';
  return 'предварительная';
}
function priorityValue(value) { return value === 'high' ? 3 : value === 'medium' ? 2 : 1; }
function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
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
