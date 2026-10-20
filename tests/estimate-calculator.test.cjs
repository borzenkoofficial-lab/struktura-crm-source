const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, calculateDuration, getCatalog } = require('../src/estimate-calculator.js');
const base = { area: 100, laborPerM2: 1500, materialsPerM2: 300, disposal: 15000, transport: 10000, overheadPercent: 10, marginPercent: 25 };

test('calculates direct cost, overhead, target-margin price and profit', () => {
  const r = calculate(base);
  assert.equal(r.labor, 150000);
  assert.equal(r.materials, 30000);
  assert.equal(r.directCost, 205000);
  assert.equal(r.overhead, 20500);
  assert.equal(r.totalCost, 225500);
  assert.equal(r.price, 225500 / 0.75);
  assert.equal(r.profit, r.price - r.totalCost);
  assert.ok(Math.abs(r.marginPercent - 25) < 1e-9);
});

test('rejects zero area and unrealistic target margin', () => {
  assert.throws(() => calculate({ ...base, area: 0 }), /Площадь/);
  assert.throws(() => calculate({ ...base, marginPercent: 90 }), /маржа/);
});

test('rejects negative or non-finite values', () => {
  assert.throws(() => calculate({ ...base, disposal: -1 }), /Некорректное/);
  assert.throws(() => calculate({ ...base, transport: 'abc' }), /Некорректное/);
});

const { calculateDetailed, DEFAULT_CATALOG } = require('../src/estimate-calculator.js');

test('detailed estimate calculates a 10-person crew at 5000 rubles per 9-hour shift', () => {
  const result = calculateDetailed({
    workArea: 100,
    lines: [{ name: 'Демонтаж перегородки ГКЛ', category: 'Демонтаж', unit: 'м²', quantity: 100, price: 300, cost: 0 }],
    crew: { people: 10, mode: 'shift', rate: 5000, hoursPerDay: 9, days: 1 },
    materialsCost: 0, disposalCost: 0, transportCost: 0, equipmentCost: 0, otherCost: 0,
    overheadPercent: 10, taxPercent: 6, discountPercent: 0, marginPercent: 25
  });
  assert.equal(result.workRevenue, 30000);
  assert.equal(result.payroll, 50000);
  assert.equal(result.overhead, 5000);
  assert.equal(result.taxReserve, 1800);
  assert.equal(result.totalCost, 56800);
  assert.equal(result.profit, -26800);
  assert.ok(result.targetPrice > result.revenue);
});

test('detailed estimate supports hourly, per-square-metre, fixed and percentage payment modes', () => {
  const common = { workArea: 120, lines: [{ name: 'Работа', unit: 'м²', quantity: 120, price: 1000, cost: 200 }], materialsCost: 0, disposalCost: 0, transportCost: 0, equipmentCost: 0, otherCost: 0, overheadPercent: 0, taxPercent: 0, discountPercent: 0, marginPercent: 20 };
  assert.equal(calculateDetailed({ ...common, crew: { people: 4, mode: 'hourly', rate: 500, hoursPerDay: 8, days: 2 } }).payroll, 32000);
  assert.equal(calculateDetailed({ ...common, crew: { people: 4, mode: 'per_m2', rate: 150, hoursPerDay: 8, days: 2 } }).payroll, 18000);
  assert.equal(calculateDetailed({ ...common, crew: { people: 4, mode: 'fixed', rate: 25000, hoursPerDay: 8, days: 2 } }).payroll, 25000);
  assert.equal(calculateDetailed({ ...common, crew: { people: 4, mode: 'percent', rate: 10, hoursPerDay: 8, days: 2 } }).payroll, 12000);
});

test('starter price catalog contains broad demolition, finishing, flooring and raised-floor categories', () => {
  assert.ok(DEFAULT_CATALOG.length >= 50);
  const categories = new Set(DEFAULT_CATALOG.map(item => item.category));
  for (const category of ['Демонтаж', 'Стены и перегородки', 'Полы', 'Фальшполы', 'Потолки']) assert.ok(categories.has(category));
  assert.ok(DEFAULT_CATALOG.every(item => item.id && item.name && item.unit && item.price >= 0 && item.cost >= 0));
});

test('target list price accounts for discount while preserving target net revenue', () => {
  const result = calculateDetailed({
    workArea: 100,
    lines: [{ name: 'Работа', unit: 'м²', quantity: 100, price: 1000, cost: 100 }],
    crew: { people: 0, mode: 'shift', rate: 0, hoursPerDay: 8, days: 1 },
    materialsCost: 0, disposalCost: 0, transportCost: 0, equipmentCost: 0, otherCost: 0,
    overheadPercent: 0, taxPercent: 6, discountPercent: 10, marginPercent: 25
  });
  assert.ok(result.targetListPrice > result.targetPrice);
  assert.ok(Math.abs(result.targetListPrice * 0.9 - result.targetPrice) < 1e-8);
  assert.ok(result.warnings.some(w => w.title === 'Налоговый резерв — оценка'));
});

test('detailed estimate warns on loss and possible duplicated crew payroll', () => {
  const result = calculateDetailed({
    workArea: 100,
    lines: [{ name: 'Работа', unit: 'м²', quantity: 100, price: 100, cost: 200 }],
    crew: { people: 2, mode: 'shift', rate: 5000, hoursPerDay: 8, days: 1 },
    materialsCost: 0, disposalCost: 0, transportCost: 0, equipmentCost: 0, otherCost: 0,
    overheadPercent: 0, taxPercent: 0, discountPercent: 0, marginPercent: 25
  });
  assert.ok(result.warnings.some(w => w.title === 'Смета убыточна'));
  assert.ok(result.warnings.some(w => w.title === 'Проверь двойной учёт зарплаты'));
});

test('100 percent discount is explicitly marked as impossible to price before discount', () => {
  const result = calculateDetailed({
    workArea: 1,
    lines: [{ name: 'Работа', unit: 'м²', quantity: 1, price: 1000, cost: 0 }],
    crew: { people: 0, mode: 'shift', rate: 0, hoursPerDay: 8, days: 1 },
    materialsCost: 0, disposalCost: 0, transportCost: 0, equipmentCost: 0, otherCost: 0,
    overheadPercent: 0, taxPercent: 0, discountPercent: 100, marginPercent: 25
  });
  assert.equal(result.targetListPrice, null);
  assert.ok(result.warnings.some(w => w.title === 'Скидка обнуляет выручку'));
});


const { calculateActuals } = require('../src/estimate-calculator.js');

test('plan/fact calculator tracks actual profit, outstanding receivable and cash balance', () => {
  const r = calculateActuals({
    contractRevenue: 250000, received: 180000, wagesPaid: 80000,
    materialsPaid: 25000, disposalPaid: 10000, transportPaid: 5000,
    equipmentPaid: 4000, otherPaid: 6000, plannedCost: 120000
  });
  assert.equal(r.actualCosts, 130000);
  assert.equal(r.actualProfit, 120000);
  assert.equal(r.actualMargin, 48);
  assert.equal(r.receivable, 70000);
  assert.equal(r.cashBalance, 50000);
  assert.equal(r.overrun, 10000);
  assert.ok(r.warnings.some(w => w.title === 'Перерасход бюджета'));
});

test('plan/fact calculator warns when actual expenses exceed contract revenue', () => {
  const r = calculateActuals({
    contractRevenue: 90000, received: 50000, wagesPaid: 70000,
    materialsPaid: 25000, disposalPaid: 0, transportPaid: 0,
    equipmentPaid: 0, otherPaid: 0, plannedCost: 80000
  });
  assert.equal(r.actualProfit, -5000);
  assert.ok(r.warnings.some(w => w.title === 'Фактический убыток'));
});

test('plan/fact calculator rejects negative actual expense values', () => {
  assert.throws(() => calculateActuals({ contractRevenue: 100, otherPaid: -1 }), /Некорректное/);
});

test('plan/fact calculator rejects a negative planned cost instead of silently clamping it', () => {
  assert.throws(() => calculateActuals({ contractRevenue: 100, wagesPaid: 10, plannedCost: -50 }), /Плановая себестоимость/);
  assert.equal(calculateActuals({ contractRevenue: 100, wagesPaid: 10 }).overrun, 10);
});


test('duration estimator estimates 1000 square metres of screed removal for a ten-person crew', () => {
  const catalog = getCatalog();
  const screed = catalog.find(item => item.id === 'd-floor-screed');
  assert.ok(screed, 'screed removal service exists in catalog');
  assert.equal(screed.productivity, 8, 'starter productivity is explicitly an editable planning assumption');
  const r = calculateDuration({ lines: [{ name: screed.name, unit: screed.unit, quantity: 1000, productivity: screed.productivity }], crew: { people: 10, hoursPerDay: 8 }, difficulty: 1, targetDays: 5 });
  assert.equal(r.personShifts, 125);
  assert.equal(r.daysForCrew, 12.5);
  assert.equal(r.calendarHours, 100);
  assert.equal(r.requiredPeople, 25, '25 workers are required to finish the estimated 125 person-shifts in 5 shifts');
});

test('duration estimator scales with crew size and difficulty and handles zero workers', () => {
  const line = [{ name: 'Демонтаж стяжки', unit: 'м²', quantity: 800, productivity: 8 }];
  const smallCrew = calculateDuration({ lines: line, crew: { people: 4, hoursPerDay: 8 }, difficulty: 1 });
  const largeCrew = calculateDuration({ lines: line, crew: { people: 8, hoursPerDay: 8 }, difficulty: 1 });
  const difficult = calculateDuration({ lines: line, crew: { people: 4, hoursPerDay: 8 }, difficulty: 1.5 });
  const noCrew = calculateDuration({ lines: line, crew: { people: 0, hoursPerDay: 8 }, difficulty: 1 });
  assert.equal(smallCrew.daysForCrew, 25);
  assert.equal(largeCrew.daysForCrew, 12.5);
  assert.ok(Math.abs(difficult.daysForCrew - 37.5) < 1e-9);
  assert.equal(noCrew.daysForCrew, null);
});

test('starter catalog has usable productivity assumptions across all services', () => {
  const catalog = getCatalog();
  assert.ok(catalog.length >= 50);
  assert.ok(catalog.every(item => Number.isFinite(item.productivity) && item.productivity > 0));
});


test('фактическая производительность рассчитывается по объёму, рабочим и сменам', () => {
  const { calculateObservedProductivity } = require('../src/estimate-calculator.js');
  assert.equal(calculateObservedProductivity({ quantity: 1000, people: 10, shifts: 12.5 }), 8);
  assert.throws(() => calculateObservedProductivity({ quantity: 1000, people: 0, shifts: 12.5 }), /больше нуля/);
});

test('duration forecast accounts for 9-hour shifts and an explicit planning reserve', () => {
  const line = [{ name: 'Демонтаж стяжки', unit: 'м²', quantity: 720, productivity: 8 }];
  const eightHour = calculateDuration({ lines: line, crew: { people: 10, hoursPerDay: 8 }, difficulty: 1, reservePercent: 0 });
  const nineHour = calculateDuration({ lines: line, crew: { people: 10, hoursPerDay: 9 }, difficulty: 1, reservePercent: 0 });
  const reserved = calculateDuration({ lines: line, crew: { people: 10, hoursPerDay: 9 }, difficulty: 1, reservePercent: 15 });
  assert.equal(eightHour.daysForCrew, 9);
  assert.equal(nineHour.daysForCrew, 8);
  assert.equal(reserved.daysForCrew, 9.2);
  assert.equal(reserved.requiredPeople, 19, 'required crew should include the schedule reserve and actual shift length');
  assert.equal(reserved.reservePercent, 15);
});

test('observed productivity normalizes real shift length to an eight-hour worker shift', () => {
  const { calculateObservedProductivity } = require('../src/estimate-calculator.js');
  assert.equal(calculateObservedProductivity({ quantity: 90, people: 1, shifts: 1, hoursPerShift: 9 }), 80);
  assert.throws(() => calculateObservedProductivity({ quantity: 90, people: 1, shifts: 1, hoursPerShift: 0 }), /часы/);
});

test('duration estimator applies visible shift-efficiency adjustment to starter rates', () => {
  const line = [{ name: 'Демонтаж стяжки', unit: 'м²', quantity: 680, productivity: 8 }];
  const full = calculateDuration({ lines: line, crew: { people: 10, hoursPerDay: 8 }, difficulty: 1, reservePercent: 0, efficiencyPercent: 100 });
  const realistic = calculateDuration({ lines: line, crew: { people: 10, hoursPerDay: 8 }, difficulty: 1, reservePercent: 0, efficiencyPercent: 85 });
  assert.equal(full.daysForCrew, 8.5);
  assert.ok(realistic.daysForCrew > full.daysForCrew);
  assert.ok(realistic.highDaysForCrew > realistic.daysForCrew);
  assert.equal(realistic.lines[0].effectiveEfficiency, 85);
});

test('reliable observed history avoids applying starter-rate efficiency loss twice', () => {
  const result = calculateDuration({
    lines: [{ name: 'Демонтаж стяжки', unit: 'м²', quantity: 680, productivity: 8, learningObservations: 5 }],
    crew: { people: 10, hoursPerDay: 8 }, difficulty: 1, reservePercent: 0, efficiencyPercent: 85
  });
  assert.equal(result.daysForCrew, 8.5);
  assert.equal(result.reliableHistoryLines, 1);
  assert.equal(result.lines[0].effectiveEfficiency, 100);
});

test('estimate exposes zero-price line and unit-cost/payroll double-count risks', () => {
  const result = calculateDetailed({
    workArea: 10,
    lines: [
      { name: 'Работа с нулевой ценой', unit: 'м²', quantity: 10, price: 0, cost: 100 },
      { name: 'Работа', unit: 'м²', quantity: 10, price: 500, cost: 50 }
    ],
    crew: { people: 2, mode: 'shift', rate: 3000, hoursPerDay: 8, days: 2 },
    materialsCost: 0, disposalCost: 0, transportCost: 0, equipmentCost: 0, otherCost: 0,
    overheadPercent: 0, taxPercent: 0, discountPercent: 0, marginPercent: 20
  });
  assert.ok(result.warnings.some(w => w.title === 'Есть работы с нулевой ценой'));
  assert.ok(result.warnings.some(w => w.title === 'Проверь двойной учёт зарплаты'));
  assert.equal(result.workRevenue, 5000);
  assert.equal(result.lineCosts, 1500);
  assert.equal(result.payroll, 12000);
  assert.equal(result.totalCost, 13500);
  assert.equal(result.profit, -8500);
});


test('partial duration forecast never presents known work as the whole project duration', () => {
  const result = calculateDuration({
    lines: [
      { name: 'Работа с нормой', unit: 'м²', quantity: 100, productivity: 10 },
      { name: 'Работа без нормы', unit: 'м²', quantity: 50, productivity: 0 }
    ],
    crew: { people: 5, hoursPerDay: 8 }, difficulty: 1
  });
  assert.equal(result.missingRates, 1);
  assert.equal(result.isComplete, false);
  assert.equal(result.forecastStatus, 'partial');
  assert.equal(result.daysForCrew, null);
  assert.equal(result.requiredPeople, null);
  assert.ok(result.partialDaysForCrew > 0, 'known work can remain visible as a partial estimate');
});

test('duration forecast is incomplete when no work lines are supplied', () => {
  const result = calculateDuration({ lines: [], crew: { people: 5, hoursPerDay: 8 } });
  assert.equal(result.forecastStatus, 'empty');
  assert.equal(result.isComplete, false);
  assert.equal(result.daysForCrew, null);
});

test('target price solves margin and tax reserve against the same final revenue', () => {
  const result = calculateDetailed({
    workArea: 1,
    lines: [{ name: 'Работа', unit: 'м²', quantity: 1, price: 100, cost: 100 }],
    crew: { people: 0, mode: 'fixed', rate: 0, hoursPerDay: 8, days: 1 },
    materialsCost: 0, disposalCost: 0, transportCost: 0, equipmentCost: 0, otherCost: 0,
    overheadPercent: 0, taxPercent: 6, discountPercent: 0, marginPercent: 25
  });
  assert.ok(Math.abs(result.targetPrice - (100 / (1 - 0.06 - 0.25))) < 1e-9);
  const targetProfitAfterTax = result.targetPrice - 100 - result.targetPrice * 0.06;
  assert.ok(Math.abs(targetProfitAfterTax / result.targetPrice * 100 - 25) < 1e-9);
});

test('target price is rejected when tax reserve plus target margin reaches 100 percent', () => {
  assert.throws(() => calculateDetailed({
    workArea: 1,
    lines: [{ name: 'Работа', unit: 'м²', quantity: 1, price: 100, cost: 10 }],
    crew: { people: 0, mode: 'fixed', rate: 0, hoursPerDay: 8, days: 1 },
    materialsCost: 0, disposalCost: 0, transportCost: 0, equipmentCost: 0, otherCost: 0,
    overheadPercent: 0, taxPercent: 50, discountPercent: 0, marginPercent: 50
  }), /сумма налога и маржи/);
});
