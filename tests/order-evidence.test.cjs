'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractOrderEvidence, parseBudget, parseVolume, parseDeadline } = require('../src/order-evidence.cjs');

test('extracts an explicit ruble budget with Russian thousands and million suffix', () => {
  assert.equal(parseBudget('НМЦК: 2,5 млн ₽').value, 2500000);
  assert.equal(parseBudget('Бюджет/цена: 1 500 000').value, 1500000);
  assert.equal(parseBudget('Стоимость контракта — 750 тыс. рублей').value, 750000);
});

test('extracts volume and a deadline only when explicitly labelled', () => {
  assert.deepEqual(parseVolume('Объём работ — 1 250,5 м2'), {
    value: 1250.5, unit: 'м²', excerpt: '1 250,5 м2'
  });
  assert.equal(parseDeadline('Срок подачи заявок до 25.11.2026').value, 'Срок подачи заявок до 25.11.2026');
  assert.equal(parseDeadline('Работы занимают 25.11.2026'), null);
});

test('extracts contacts, customer, procurement number and exact evidence excerpts', () => {
  const result = extractOrderEvidence(
    'Заказчик: ООО СтройИнвест; Номер закупки 0373100000126000001. ' +
    'Бюджет: 1 200 000 руб.; Объём: 800 м²; срок подачи до 20.11.2026. ' +
    'Контактное лицо: Иван Петрович Сидоров; Телефон +7 (999) 123-45-67, email tender@example.ru. Адрес объекта: Москва, ул. Примерная, 10'
  );
  assert.equal(result.customer_name, 'ООО СтройИнвест');
  assert.equal(result.contact_name, 'Иван Петрович Сидоров');
  assert.equal(result.phone, '+7 (999) 123-45-67');
  assert.equal(result.email, 'tender@example.ru');
  assert.equal(result.budget_rub, 1200000);
  assert.equal(result.volume_value, 800);
  assert.equal(result.volume_unit, 'м²');
  assert.equal(result.procurement_number, '0373100000126000001');
  assert.equal(result.work_address, 'Москва, ул. Примерная, 10');
  const evidence = JSON.parse(result.fact_evidence_json);
  assert.ok(evidence.some(item => item.field === 'budget_rub' && /1 200 000/.test(item.excerpt)));
});

test('does not invent budget, volume, deadline or contacts from generic text', () => {
  const result = extractOrderEvidence('Демонтаж офисного помещения. Работы займут 20 дней. Новый объект.');
  assert.equal(result.budget_rub, 0);
  assert.equal(result.volume_value, 0);
  assert.equal(result.deadline_text, '');
  assert.equal(result.phone, '');
  assert.equal(result.email, '');
  assert.deepEqual(JSON.parse(result.fact_evidence_json), []);
});
