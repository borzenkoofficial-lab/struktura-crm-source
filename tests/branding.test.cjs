'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { skolWordmarkSvg } = require('../src/branding.cjs');
const { buildProductionReportHtml } = require('../src/production-report.cjs');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('СКОЛ wordmark is a custom geometric Cyrillic SVG with safe color options', () => {
  const svg = skolWordmarkSvg({ fill: '#F5F3EF', className: 'quote-brand-mark' });
  assert.match(svg, /aria-label="СКОЛ"/);
  assert.match(svg, /class="quote-brand-mark"/);
  assert.match(svg, /#F5F3EF/);
  assert.match(svg, /viewBox="0 0 735 180"/);
  assert.doesNotMatch(skolWordmarkSvg({ fill: 'red" onclick="bad', className: 'logo<script>' }), /onclick|<script>/);
});

test('customer quote and production report show СКОЛ instead of the former brand', () => {
  const main = read('src/main.cjs');
  const quoteStart = main.indexOf("ipcMain.handle('estimate:exportQuotePdf'");
  const quoteEnd = main.indexOf("ipcMain.handle('updates:status'", quoteStart);
  assert.ok(quoteStart >= 0 && quoteEnd > quoteStart);
  const quote = main.slice(quoteStart, quoteEnd);
  assert.match(quote, /skolWordmarkSvg\(\{ fill: '#F5F3EF', className: 'quote-brand-mark' \}\)/);
  assert.match(quote, /СКОЛ/);
  assert.doesNotMatch(quote, /STRUKTURA|Struktura CRM|СКОЛ CRM/);

  const report = buildProductionReportHtml({
    project: { title: 'Тестовый объект', client_name: 'Тест', address: 'Москва' },
    startDate: '2026-10-01', endDate: '2026-10-02', documentType: 'report',
    plan: [], shifts: [], actualByPeriod: [], payments: [], expenses: []
  });
  assert.match(report, /aria-label="СКОЛ"/);
  assert.match(report, /Сформировано в СКОЛ/);
  assert.doesNotMatch(report, /STRUKTURA|Struktura CRM|данным смен CRM|СКОЛ СКОЛ/);
});


test('all downloaded estimates and planning archives carry the СКОЛ prefix', () => {
  const renderer = read('src/renderer.js');
  const calculatorUi = read('src/engineering-calculator-ui.js');
  const planUi = read('src/engineering-project-plan-ui.js');
  const crawler = read('src/site-crawler.cjs');
  assert.match(renderer, /a\.download = `СКОЛ-/);
  assert.match(calculatorUi, /СКОЛ-инженерная-история-/);
  assert.match(planUi, /СКОЛ-планы-объекта-/);
  assert.match(crawler, /User-Agent': 'SKOL\/1\.16\.9/);
  assert.doesNotMatch(calculatorUi, /struktura-engineering-history-/);
  assert.doesNotMatch(planUi, /struktura-project-plans-/);
});

test('rebrand retains existing local database discovery and internal storage keys', () => {
  const main = read('src/main.cjs');
  assert.match(main, /app\.setName\('СКОЛ'\)/);
  assert.match(main, /legacyDataCandidates = \['Struktura CRM', 'struktura-crm', 'struktura-crm-source'\]/);
  assert.match(main, /struktura-crm\.sqlite/);
  const estimate = read('src/estimate-calculator.js');
  assert.match(estimate, /struktura\.estimate\.catalog\.v1/);
});

test('visible application screens use the СКОЛ wordmark and no former brand name', () => {
  const html = read('src/index.html');
  const renderer = read('src/renderer.js');
  assert.match(html, /<title>СКОЛ<\/title>/);
  assert.match(html, /assets\/skol-wordmark-inverse\.svg/);
  assert.match(html, /assets\/skol-monogram\.svg/);
  assert.doesNotMatch(html, /STRUKTURA|Struktura CRM/);
  assert.match(renderer, /О продукте СКОЛ/);
  assert.doesNotMatch(renderer, /STRUKTURA|Struktura CRM/);
});
