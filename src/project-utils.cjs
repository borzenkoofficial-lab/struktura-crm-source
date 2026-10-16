'use strict';

const SERVICES = new Set(['demolition', 'finishing', 'raised_floor']);
const STATUSES = new Set(['planned', 'active', 'completed', 'cancelled']);

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeProjectInput(input = {}) {
  const title = String(input.title ?? '').trim().slice(0, 180);
  if (!title) throw new Error('Укажи название объекта.');
  const startDate = String(input.start_date ?? '').trim();
  const endDate = String(input.end_date ?? '').trim();
  if (!validDate(startDate)) throw new Error('Проверь дату начала работ.');
  if (!validDate(endDate)) throw new Error('Проверь дату окончания работ.');
  if (startDate && endDate && endDate < startDate) throw new Error('Дата окончания не может быть раньше даты начала.');
  const contract = Number(input.contract_rub ?? 0);
  if (!Number.isFinite(contract) || contract < 0) throw new Error('Сумма договора должна быть неотрицательной.');
  const plannedPeople = Number(input.planned_people ?? 5);
  if (!Number.isInteger(plannedPeople) || plannedPeople < 1 || plannedPeople > 200) throw new Error('Численность бригады должна быть от 1 до 200 человек.');
  const complexity = Number(input.complexity_factor ?? 1);
  if (![0.7, 1, 1.25, 1.5, 2].includes(complexity)) throw new Error('Выбери допустимый коэффициент сложности объекта.');
  return {
    title,
    service: SERVICES.has(input.service) ? input.service : 'demolition',
    status: STATUSES.has(input.status) ? input.status : 'planned',
    contract_rub: Math.round(contract),
    address: String(input.address ?? '').trim().slice(0, 250),
    client_id: input.client_id ? Number(input.client_id) : null,
    lead_id: input.lead_id ? Number(input.lead_id) : null,
    start_date: startDate || null,
    end_date: endDate || null,
    planned_people: plannedPeople,
    complexity_factor: complexity,
    notes: String(input.notes ?? '').trim().slice(0, 4000)
  };
}

module.exports = { normalizeProjectInput, validDate };
