'use strict';

const ALLOWED_DIFFICULTIES = new Set([0.7, 1, 1.25, 1.5, 2]);
function clean(value, max = 200) { return String(value ?? '').trim().slice(0, max); }

function normalizeProductionPlan(input = {}) {
  const people = Number(input.planned_people ?? 5);
  if (!Number.isInteger(people) || people < 1 || people > 200) throw new Error('Численность бригады должна быть от 1 до 200 человек.');
  const factor = Number(input.complexity_factor ?? 1);
  if (!ALLOWED_DIFFICULTIES.has(factor)) throw new Error('Выбери допустимый коэффициент сложности.');
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) throw new Error('Добавь от 1 до 100 позиций плана работ.');
  const seen = new Set();
  const lines = input.lines.map((line) => {
    const catalogId = clean(line.catalog_id, 120);
    const name = clean(line.work_name, 180);
    const unit = clean(line.unit, 24);
    const quantity = Number(line.planned_quantity);
    const baseline = Number(line.baseline_productivity);
    if (!catalogId || !name || !unit || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9 || !Number.isFinite(baseline) || baseline < 0 || baseline > 1e8) {
      throw new Error('В плане у каждой работы должны быть название, единица и реалистичный объём; норма может быть 0, если её нужно уточнить.');
    }
    if (seen.has(catalogId)) throw new Error('Одна и та же работа добавлена в план дважды. Объедини объём в одной строке.');
    seen.add(catalogId);
    return { catalog_id: catalogId, work_name: name, unit, planned_quantity: quantity, baseline_productivity: baseline };
  });
  return { planned_people: people, complexity_factor: factor, lines };
}

function normalizeShiftWorkLines({ lines, workers, shiftHours, downtimeHours = 0 } = {}) {
  if (!Array.isArray(lines) || lines.length > 40) throw new Error('В отчёте можно указать не более 40 видов работ.');
  const crew = Number(workers), totalHours = Number(shiftHours), downtime = Number(downtimeHours);
  if (!Number.isInteger(crew) || crew < 1 || crew > 200 || !Number.isFinite(totalHours) || totalHours < 0.5 || totalHours > 24 || !Number.isFinite(downtime) || downtime < 0 || downtime > totalHours) {
    throw new Error('Проверь численность бригады и продолжительность смены.');
  }
  const seen = new Set();
  let allocatedPersonHours = 0;
  const normalized = lines.map((line) => {
    const catalogId = clean(line.catalog_id, 120), name = clean(line.work_name, 180), unit = clean(line.unit, 24);
    const quantity = Number(line.quantity_done), people = Number(line.workers_count), hours = Number(line.hours), baseline = Number(line.baseline_productivity);
    if (!catalogId || !name || !unit || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9 || !Number.isInteger(people) || people < 1 || people > crew || !Number.isFinite(hours) || hours < 0.25 || hours > totalHours || !Number.isFinite(baseline) || baseline <= 0 || baseline > 1e8) {
      throw new Error('Проверь объём, людей, часы и базовую норму по каждой выполненной работе.');
    }
    if (seen.has(catalogId)) throw new Error('Одна и та же работа встречается в отчёте дважды. Объедини фактический объём в одной строке.');
    seen.add(catalogId);
    allocatedPersonHours += people * hours;
    return { catalog_id: catalogId, work_name: name, unit, quantity_done: quantity, workers_count: people, hours, baseline_productivity: baseline };
  });
  const availablePersonHours = crew * (totalHours - downtime);
  if (allocatedPersonHours > availablePersonHours + 0.01) {
    throw new Error(`Распределено ${allocatedPersonHours.toLocaleString('ru-RU')} чел.-ч, а вся бригада могла отработать максимум ${availablePersonHours.toLocaleString('ru-RU')} чел.-ч. Проверь людей и часы по каждой работе: одни и те же часы нельзя учитывать дважды.`);
  }
  return normalized;
}

module.exports = { normalizeProductionPlan, normalizeShiftWorkLines };
