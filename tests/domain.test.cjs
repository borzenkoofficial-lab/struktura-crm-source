const test = require('node:test');
const assert = require('node:assert/strict');
const { projectMetrics, rub, SERVICE_LABELS, SOURCE_LABELS } = require('../src/domain.cjs');

test('project metrics keep contract debt separate from cash after paid expenses', () => {
  assert.deepEqual(projectMetrics(150000, 100000, 0, 35000, 35000), {
    debtRub: 50000,
    cashAfterPaidExpensesRub: 65000,
    estimatedProfitRub: 115000,
    receivedRub: 100000,
    paidExpensesRub: 35000
  });
});
test('refunds reduce net receipts and may not create negative client debt', () => {
  const result = projectMetrics(10000, 5000, 2000, 1000, 4000);
  assert.equal(result.receivedRub, 3000);
  assert.equal(result.debtRub, 7000);
  assert.equal(result.cashAfterPaidExpensesRub, 2000);
  assert.equal(result.estimatedProfitRub, 6000);
});
test('invalid negative amounts are rejected', () => {
  assert.throws(() => projectMetrics(100, -1, 0, 0, 0), RangeError);
  assert.throws(() => projectMetrics(100, 10, 0, 0, -1), RangeError);
});
test('Russian labels exist for the three business services and lead sources', () => {
  assert.equal(SERVICE_LABELS.demolition, 'Демонтаж');
  assert.equal(SERVICE_LABELS.finishing, 'Отделочные работы');
  assert.equal(SERVICE_LABELS.raised_floor, 'Фальшполы');
  assert.equal(SOURCE_LABELS.avito, 'Авито');
  assert.equal(SOURCE_LABELS.recommendation, 'Рекомендация');
});
test('currency formatter does not throw for zero and integer rubles', () => {
  assert.match(rub(0), /0/);
  assert.match(rub(125000), /125/);
});

test('CSV import parses semicolon-separated Russian headers and quoted separators', () => {
  const { parseCsv } = require('../src/csv.cjs');
  const rows = parseCsv('Компания;Город;Телефон;Комментарий\r\n"ООО; Пример";Москва;+79990000000;"Объект, офис"');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].company_name, 'ООО; Пример');
  assert.equal(rows[0].region, 'Москва');
  assert.equal(rows[0].notes, 'Объект, офис');
});
test('CSV import rejects files without a company name column', () => {
  const { parseCsv } = require('../src/csv.cjs');
  assert.throws(() => parseCsv('Телефон;Город\n+79990000000;Москва'), /не найдена колонка/);
});

test('CSV parser detects comma, semicolon and tab delimiters and preserves quoted separators', () => {
  const { parseCsv } = require('../src/csv.cjs');
  const comma = parseCsv('company_name,phone,notes\n"ООО Пример, Москва",+79990000000,"Демонтаж, офис"');
  assert.equal(comma[0].company_name, 'ООО Пример, Москва');
  assert.equal(comma[0].notes, 'Демонтаж, офис');
  const tab = parseCsv('Компания\tТелефон\tГород\nООО Ремонт\t+79991112233\tМосква');
  assert.equal(tab[0].company_name, 'ООО Ремонт');
  assert.equal(tab[0].region, 'Москва');
});

test('CSV parser accepts service and source aliases in Russian', () => {
  const { parseCsv } = require('../src/csv.cjs');
  const rows = parseCsv('Компания;Услуга;Источник данных;Ссылка на источник\nООО Демонтаж;Демонтаж;Telegram;https://t.me/example');
  assert.equal(rows[0].service, 'Демонтаж');
  assert.equal(rows[0].source_name, 'Telegram');
  assert.equal(rows[0].source_url, 'https://t.me/example');
});

test('CSV parser reports malformed quoted cells instead of silently importing corrupt data', () => {
  const { parseCsv } = require('../src/csv.cjs');
  assert.throws(() => parseCsv('Компания;Заметки\nООО Пример;"незакрытая заметка'), /незакрытая кавычка/);
});

test('prospect duplicate detection normalizes phone, URL and company spelling', () => {
  const { prospectDuplicateKeys, normalizePhone, normalizeUrl } = require('../src/csv.cjs');
  assert.equal(normalizePhone('+7 (999) 123-45-67'), '79991234567');
  assert.equal(normalizePhone('8 999 123 45 67'), '79991234567');
  assert.equal(normalizeUrl('https://WWW.Example.ru/?utm_source=telegram#contact'), 'https://example.ru');
  const a = prospectDuplicateKeys({ company_name: 'ООО «РЕМОНТ-СЕРВИС»', region: 'Москва', phone: '+7 (999) 123-45-67' });
  const b = prospectDuplicateKeys({ company_name: 'ООО Ремонт сервис', region: 'Москва', phone: '8 999 123 45 67' });
  assert.ok(a.some(key => b.includes(key)));
});


 test('site crawler extracts public contacts and same-site links from HTML', () => {
  const { extractPage } = require('../src/site-crawler.cjs');
  const page = extractPage('<html><head><title>ООО Стройсервис</title></head><body><h1>Контакты</h1><p>Телефон +7 (495) 123-45-67</p><a href="/about">О компании</a><a href="mailto:info@stroi.example">Email</a></body></html>', 'https://stroi.example/contacts');
  assert.equal(page.title, 'ООО Стройсервис');
  assert.ok(page.emails.includes('info@stroi.example'));
  assert.ok(page.phones.some(phone => phone.replace(/\D/g, '').length >= 10));
  assert.ok(page.links.includes('https://stroi.example/about'));
});

test('site crawler respects robots.txt allow and disallow rules', () => {
  const { robotsAllows } = require('../src/site-crawler.cjs');
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/contact';
  assert.equal(robotsAllows(robots, '/private/page'), false);
  assert.equal(robotsAllows(robots, '/private/contact'), true);
  assert.equal(robotsAllows(robots, '/about'), true);
});

test('site crawler rejects local addresses and non-http protocols', async () => {
  const { validatePublicUrl } = require('../src/site-crawler.cjs');
  await assert.rejects(validatePublicUrl('http://localhost:3000'), /публичн/);
  await assert.rejects(validatePublicUrl('file:///etc/passwd'), /HTTP и HTTPS/);
  await assert.rejects(validatePublicUrl('http://127.0.0.1'), /публичн/);
});

test('finance insights forecasts dated receivables and unpaid expenses without hiding unscheduled debt', () => {
  const { buildFinanceInsights } = require('../src/finance-insights.cjs');
  const result = buildFinanceInsights({
    today: '2026-10-13', cash: 50000,
    projects: [
      { id: 1, title: 'Объект А', status: 'active', contract_rub: 200000, received_rub: 50000, end_date: '2026-10-18', paid_expenses_rub: 130000, planned_expenses_rub: 30000 },
      { id: 2, title: 'Объект Б', status: 'active', contract_rub: 100000, received_rub: 20000, end_date: null, paid_expenses_rub: 10000, planned_expenses_rub: 0 }
    ],
    expenses: [
      { amount_rub: 12000, expense_date: '2026-10-15', is_paid: 0 },
      { amount_rub: 5000, expense_date: '2026-10-10', is_paid: 0 },
      { amount_rub: 3000, expense_date: '2026-10-20', is_paid: 1 }
    ]
  });
  assert.equal(result.forecasts.find(x => x.days === 7).expectedReceipts, 0);
  assert.equal(result.forecasts.find(x => x.days === 7).plannedOutflow, 17000);
  assert.equal(result.forecasts.find(x => x.days === 7).projectedCash, 33000);
  assert.equal(result.unscheduledReceivablesTotal, 230000);
  assert.ok(result.dataWarnings.some(warning => /нет графика платежей/u.test(warning)));
  assert.equal(result.overdueExpensesTotal, 5000);
  assert.equal(result.risks[0].level, 'warning');
});

test('finance insights rejects invalid dates and ignores cancelled projects', () => {
  const { buildFinanceInsights } = require('../src/finance-insights.cjs');
  assert.throws(() => buildFinanceInsights({ today: 'today' }), /YYYY-MM-DD/);
  const result = buildFinanceInsights({ today: '2026-10-13', cash: 0,
    projects: [{ id: 1, title: 'Отменён', status: 'cancelled', contract_rub: 100000, received_rub: 0, end_date: '2026-10-14' }], expenses: [] });
  assert.equal(result.receivablesTotal, 0);
  assert.equal(result.forecasts[0].expectedReceipts, 0);
});

test('finance insights validates real calendar dates instead of accepting impossible YYYY-MM-DD values', () => {
  const { buildFinanceInsights } = require('../src/finance-insights.cjs');
  assert.throws(() => buildFinanceInsights({ today: '2026-02-30' }), /YYYY-MM-DD/);
  const result = buildFinanceInsights({ today: '2026-10-13', cash: 1000,
    projects: [{ id: 4, title: 'Склад', status: 'active', contract_rub: 50000, received_rub: 10000, end_date: '2026-02-30', paid_expenses_rub: 0, planned_expenses_rub: 0 }],
    expenses: [{ id: 8, description: 'Вывоз', amount_rub: 5000, expense_date: '2026-02-30', is_paid: 0 }] });
  assert.equal(result.forecasts[0].expectedReceipts, 0);
  assert.equal(result.forecasts[0].plannedOutflow, 0);
  assert.ok(result.dataWarnings.some(warning => /дата окончания некорректна/u.test(warning)));
  assert.ok(result.dataWarnings.some(warning => /дата некорректна/u.test(warning)));
});

test('finance insights flags invalid monetary records instead of allowing NaN to poison totals', () => {
  const { buildFinanceInsights } = require('../src/finance-insights.cjs');
  const result = buildFinanceInsights({ today: '2026-10-13', cash: 'не число',
    projects: [{ id: 5, title: 'Офис', status: 'active', contract_rub: 'ошибка', received_rub: 0, end_date: '2026-10-18', paid_expenses_rub: 0, planned_expenses_rub: 0 }],
    expenses: [{ id: 9, description: 'Материалы', amount_rub: 'ошибка', expense_date: '2026-10-15', is_paid: 0 }] });
  assert.equal(result.cash, 0);
  assert.equal(result.forecasts[0].projectedCash, 0);
  assert.equal(result.forecasts[0].plannedOutflow, 0);
  assert.ok(result.dataWarnings.length >= 3);
  assert.ok(result.dataWarnings.every(warning => typeof warning === 'string'));
});
