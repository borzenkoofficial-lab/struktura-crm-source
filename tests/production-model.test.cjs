const test = require('node:test');
const assert = require('node:assert/strict');
const { median, buildRateModel, forecastRemainingWork } = require('../src/production-model.cjs');

test('median is robust against a single unusually high shift', () => {
  assert.equal(median([8, 9, 10, 11, 100]), 10);
});

test('rate model starts from the editable catalog baseline with no observations', () => {
  const model = buildRateModel({ baselineProductivity: 8, observations: [], targetDifficulty: 1.25 });
  assert.equal(model.effectiveProductivity, 6.4);
  assert.equal(model.observations, 0);
  assert.match(model.confidence, /без факта/);
});

test('observed production is normalized for complexity and blended more as evidence accumulates', () => {
  const observations = [
    { quantity_done: 80, workers_count: 10, hours: 8, complexity_factor: 1 },
    { quantity_done: 88, workers_count: 10, hours: 8, complexity_factor: 1 },
    { quantity_done: 96, workers_count: 10, hours: 8, complexity_factor: 1.25 }
  ];
  const model = buildRateModel({ baselineProductivity: 8, observations });
  assert.equal(model.observations, 3);
  assert.equal(model.observedMedian, 8.8);
  assert.equal(model.learnedNormalRate, 8.4);
  assert.equal(model.effectiveProductivity, 8.4);
  assert.match(model.confidence, /3–4/);
});

test('remaining-time forecast accounts for completed work, crew size, and items already finished', () => {
  const result = forecastRemainingWork({
    planItems: [
      { catalog_id: 'wall', work_name: 'Демонтаж стен', unit: 'м²', planned_quantity: 100, baseline_productivity: 10 },
      { catalog_id: 'floor', work_name: 'Демонтаж пола', unit: 'м²', planned_quantity: 40, baseline_productivity: 8 }
    ],
    actualByCatalog: { wall: 30, floor: 50 },
    observationsByCatalog: {}, targetDifficulty: 1, crewSize: 5
  });
  assert.equal(result.lines[0].remainingQuantity, 70);
  assert.equal(result.lines[1].remainingQuantity, 0);
  assert.equal(result.laborShiftsRemaining, 7);
  assert.equal(result.teamShiftsRemaining, 1.4);
  assert.equal(result.completedLines, 1);
});

test('rate model rejects invalid baseline or difficulty rather than generating a fake forecast', () => {
  assert.throws(() => buildRateModel({ baselineProductivity: 0 }), /больше нуля/);
  assert.throws(() => buildRateModel({ baselineProductivity: 5, targetDifficulty: 0 }), /больше нуля/);
  assert.throws(() => buildRateModel({ baselineProductivity: 5, targetCrewSize: 0 }), /от 1 до 200/);
});


test('learning gives little weight to 1–2 observations and mostly trusts the median after 5+', () => {
  const observation = { quantity_done: 160, workers_count: 8, hours: 8, complexity_factor: 1 };
  const early = buildRateModel({ baselineProductivity: 10, observations: [observation, observation] });
  const mature = buildRateModel({ baselineProductivity: 10, observations: [observation, observation, observation, observation, observation] });
  assert.equal(early.learnedNormalRate, 12.5);
  assert.equal(mature.learnedNormalRate, 17.5);
  assert.equal(early.observedWeight, 0.25);
  assert.equal(mature.observedWeight, 0.75);
});


test('production model learns diminishing per-worker output for larger crews only after repeated evidence at different sizes', () => {
  const observations = [
    ...[20, 21, 19].map(rate => ({ quantity_done: rate * 5, workers_count: 5, hours: 8, complexity_factor: 1 })),
    ...[10, 11, 9].map(rate => ({ quantity_done: rate * 15, workers_count: 15, hours: 8, complexity_factor: 1 }))
  ];
  const smallCrew = buildRateModel({ baselineProductivity: 10, observations, targetCrewSize: 5 });
  const largeCrew = buildRateModel({ baselineProductivity: 10, observations, targetCrewSize: 15 });
  assert.equal(smallCrew.crewScalingApplied, true);
  assert.equal(largeCrew.crewScalingApplied, true);
  assert.ok(largeCrew.effectiveProductivity < smallCrew.effectiveProductivity, 'per-worker productivity should be lower for the observed larger crew');
});

test('production model keeps linear scaling when productivity is similar across crew sizes', () => {
  const observations = [
    { quantity_done: 100, workers_count: 5, hours: 8 },
    { quantity_done: 110, workers_count: 5, hours: 8 },
    { quantity_done: 90, workers_count: 5, hours: 8 },
    { quantity_done: 200, workers_count: 10, hours: 8 },
    { quantity_done: 190, workers_count: 10, hours: 8 }
  ];
  const model = buildRateModel({ baselineProductivity: 10, observations, targetCrewSize: 10 });
  assert.equal(model.crewScalingApplied, false, 'similar per-worker results do not justify a size adjustment');
});

test('production plan retains missing-norm work without fabricating a duration', () => {
  const result = forecastRemainingWork({ planItems: [
    { catalog_id: 'known', work_name: 'Работа с нормой', unit: 'м²', planned_quantity: 20, baseline_productivity: 10 },
    { catalog_id: 'unknown', work_name: 'Работа без нормы', unit: 'м²', planned_quantity: 15, baseline_productivity: 0 }
  ], crewSize: 5 });
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[1].missingRate, true);
  assert.equal(result.lines[1].laborShiftsRemaining, null);
  assert.equal(result.estimated, false);
});


test('production model ignores malformed observations instead of crashing', () => {
  const result = buildRateModel({
    baselineProductivity: 10,
    observations: [null, undefined, 'bad-record', {}, { quantity_done: 50, workers_count: 5, hours: 8 }]
  });
  assert.equal(result.observations, 1);
  assert.equal(result.effectiveProductivity, 10);
});

test('forecast handles malformed observation lists as no evidence', () => {
  const result = forecastRemainingWork({
    planItems: [{ catalog_id: 'demo', name: 'Демонтаж', quantity: 100, productivity: 10 }],
    observationsByCatalog: { demo: [null, {}] },
    crewSize: 5
  });
  assert.equal(result.lines[0].observations, 0);
  assert.equal(result.lines[0].effectiveProductivity, 10);
});
