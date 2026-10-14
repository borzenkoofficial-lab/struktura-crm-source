'use strict';

function buildProductionIntelligence(data = {}, options = {}) {
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const history = Array.isArray(data.history) ? data.history : [];
  const totals = data.totals || {};
  const today = validDate(options.today) || new Date().toISOString().slice(0, 10);
  const alerts = [];
  const performanceByWork = new Map();
  let forecastableCount = 0;
  const add = (level, title, message, projectId = null) => alerts.push({ level, title, message, projectId });

  for (const project of projects) {
    const title = String(project.title || `Объект ${project.id ?? ''}`).trim();
    const planCount = finiteNonNegative(project.planCount);
    const shiftCount = finiteNonNegative(project.shiftCount);
    const forecast = project.forecast || {};
    if (planCount > 0 && forecast.estimated === true) forecastableCount += 1;
    if (planCount === 0) {
      add('warning', `Нет производственного плана: ${title}`, `По объекту «${title}» не заполнен производственный план. Прогноз срока недоступен.`, project.id ?? null);
    }
    if (planCount > 0 && forecast.estimated !== true) {
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

  for (const shift of history) {
    const shiftHours = Number(shift.shift_hours);
    const downtimeHours = Number(shift.downtime_hours);
    if (Number.isFinite(shiftHours) && shiftHours > 0 && Number.isFinite(downtimeHours) && downtimeHours >= 1 && downtimeHours / shiftHours >= 0.25) {
      const project = projects.find(item => Number(item.id) === Number(shift.project_id));
      const projectName = project?.title ? ` · ${project.title}` : '';
      const percent = Math.round(downtimeHours / shiftHours * 100);
      add(percent >= 50 ? 'danger' : 'warning', `Высокий простой${projectName}`, `В смене ${shift.shift_date || 'без даты'} простой составил ${downtimeHours} ч. (${percent}% смены). Зафиксируй причину и проверь, что можно устранить до следующей смены.`, shift.project_id ?? null);
    }
    for (const performance of (Array.isArray(shift.performance) ? shift.performance : [])) {
      const deviation = Number(performance.deviationPct);
      const workName = String(performance.work_name || 'Без названия').trim();
      const workKey = `${shift.project_id ?? 'unknown'}::${workName.toLocaleLowerCase('ru-RU')}`;
      if (!performanceByWork.has(workKey)) performanceByWork.set(workKey, { projectId: shift.project_id ?? null, workName, deviations: [] });
      if (Number.isFinite(deviation)) performanceByWork.get(workKey).deviations.push(deviation);
      if (Number.isFinite(deviation) && deviation <= -20) {
        const project = projects.find(item => Number(item.id) === Number(shift.project_id));
        const projectName = project?.title ? ` · ${project.title}` : '';
        add(deviation <= -35 ? 'danger' : 'warning', `Выработка ниже нормы${projectName}`, `Работа «${workName}» выработка на ${Math.abs(Math.round(deviation))}% ниже нормы. Проверь условия, простой и точность трудозатрат.`, shift.project_id ?? null);
      } else if (Number.isFinite(deviation) && deviation >= 150) {
        const project = projects.find(item => Number(item.id) === Number(shift.project_id));
        const projectName = project?.title ? ` · ${project.title}` : '';
        add('warning', `Аномально высокая выработка${projectName}`, `По работе «${workName}» факт выше нормы в ${((100 + deviation) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} раза. Это может быть реальный хороший результат, но сначала проверь единицы измерения, объём, часы и численность.`, shift.project_id ?? null);
      }
    }
  }

  for (const group of performanceByWork.values()) {
    const lowCount = group.deviations.filter(value => value <= -20).length;
    if (group.deviations.length >= 3 && lowCount >= 2) {
      const project = projects.find(item => Number(item.id) === Number(group.projectId));
      const projectName = project?.title ? ` · ${project.title}` : '';
      add('warning', `Повторяющееся отставание${projectName}`, `По работе «${group.workName}» отставание от нормы повторилось в ${lowCount} из ${group.deviations.length} учтённых записей. Сверь условия, норму производительности и состав бригады; не меняй норму по одной смене.`, group.projectId);
    }
  }

  const shiftCount = finiteNonNegative(totals.shifts);
  const workRecords = finiteNonNegative(totals.work_records);
  const summary = projects.length === 0
    ? 'Нет активных объектов для анализа.'
    : forecastableCount === 0
      ? 'Недостаточно данных для надёжного прогноза. Заполни планы и фиксируй фактические смены.'
      : `Прогноз доступен по ${forecastableCount} из ${projects.length} объектов. Учтено ${shiftCount} смен и ${workRecords} записей выработки.`;

  return { projectCount: projects.length, forecastableCount, shiftCount, workRecords, summary, alerts };
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
