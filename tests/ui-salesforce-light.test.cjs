'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
const baseTheme = fs.readFileSync(path.join(root, 'src/theme-salesforce.css'), 'utf8');
const lightTheme = fs.readFileSync(path.join(root, 'src/theme-salesforce-light.css'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function luminance(hex) {
  const raw = hex.replace('#', '');
  const values = raw.match(/.{2}/g).map(value => parseInt(value, 16) / 255);
  const linear = values.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function token(name) {
  const match = lightTheme.match(new RegExp(name + ':\\s*(#[0-9a-fA-F]{6})'));
  assert.ok(match, 'light token exists: ' + name);
  return match[1];
}

test('the Salesforce design is recoloured in place on the requested SKOL 1.24.0 codebase', () => {
  assert.equal(pkg.version, '1.24.0');
  assert.equal(pkg.build.productName, 'СКОЛ');
  assert.equal(pkg.build.win.artifactName, 'SKOL-Setup-${version}.${ext}');
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+\\.css)">/g)].map(match => match[1]);
  assert.deepEqual(links.slice(-5), [
    'styles.css',
    'engineering-calculator.css',
    'engineering-project-plan.css',
    'theme-salesforce.css',
    'theme-salesforce-light.css'
  ]);
  assert.match(baseTheme, /\.sidebar\\s*\\{[\\s\\S]*?flex-direction:row/);
  assert.match(baseTheme, /\.records-workspace\\s*\\{/);
  assert.match(baseTheme, /\.record-detail-panel\\s*\\{/);
  assert.match(lightTheme, /color-scheme:light/);
});

test('all 14 SKOL workspaces remain present after applying the Salesforce composition', () => {
  const expected = [
    'dashboard', 'leads', 'clients', 'projects', 'production', 'engineering', 'finance',
    'browser', 'prospects', 'tasks', 'reports', 'plans', 'about', 'settings'
  ];
  assert.deepEqual([...html.matchAll(/id="view-([^"]+)"/g)].map(match => match[1]), expected);
});

test('new record split panes and finance detail cards are present in the actual 1.24.0 markup', () => {
  for (const id of [
    'leadDetailPanel', 'clientDetailPanel', 'projectDetailPanel',
    'paymentDetailPanel', 'expenseDetailPanel'
  ]) assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' appears once');
  for (const id of ['leadsTable', 'clientsTable', 'projectsTable', 'paymentsTable', 'expensesTable']) {
    assert.match(html, new RegExp('id="' + id + '" class="table-wrap records-list"'));
  }
  const projectStart = html.indexOf('id="view-projects"');
  const estimate = html.indexOf('class="estimate-panel estimate-pro-panel"', projectStart);
  const projectList = html.indexOf('id="projectsTable"', projectStart);
  assert.ok(projectList > projectStart && projectList < estimate, 'object list is above the estimate calculator');
  assert.match(html, /class="panel records-panel finance-records-panel"/);
});

test('renderer supports live row selection, record detail cards and finance detail cards', () => {
  assert.match(renderer, /const recordCaches = \\{ leads: \\[\\], clients: \\[\\], projects: \\[\\] \\}/);
  assert.match(renderer, /function renderRecordDetailPanel\\(kind, record\\)/);
  assert.match(renderer, /function selectRecord\\(kind, id\\)/);
  assert.match(renderer, /data-record-kind="lead"/);
  assert.match(renderer, /data-record-kind="client"/);
  assert.match(renderer, /data-record-kind="project"/);
  assert.match(renderer, /function renderFinanceDetailPanel\\(kind, record\\)/);
  assert.match(renderer, /function selectFinanceRecord\\(kind, id\\)/);
  assert.match(renderer, /data-finance-kind="payment"/);
  assert.match(renderer, /data-finance-kind="expense"/);
  assert.match(renderer, /record\\.contact_name/);
  assert.match(renderer, /data-lead-status=/);
  assert.match(renderer, /data-project-status=/);
});

test('light palette has high contrast and keeps the lime accent with dark text', () => {
  const paper = token('--sf-shell');
  const ink = token('--sf-text');
  const muted = token('--sf-muted');
  const lime = token('--sf-lime');
  const limeInk = token('--sf-lime-ink');
  assert.ok(contrast(ink, paper) >= 7, 'main text contrast >= 7:1');
  assert.ok(contrast(muted, paper) >= 4.5, 'secondary text contrast >= 4.5:1');
  assert.ok(contrast(limeInk, lime) >= 4.5, 'dark text on lime controls contrast >= 4.5:1');
});

test('white colourway preserves the Salesforce layout and styles all interactive states', () => {
  for (const selector of [
    '.sidebar {', '.nav-item.active', '.button.primary', '.records-workspace {',
    '.record-detail-panel {', '.records-list .data-table', 'dialog.modal'
  ]) assert.ok(lightTheme.includes(selector), 'light colourway defines ' + selector);
  assert.match(lightTheme, /\\.nav-item\\.active[\\s\\S]*?background:var\\(--sf-lime\\)!important/);
  assert.match(lightTheme, /button:focus-visible[\\s\\S]*?outline:3px solid/);
  assert.match(lightTheme, /button:disabled[\\s\\S]*?cursor:not-allowed/);
  assert.match(lightTheme, /input::placeholder,textarea::placeholder[\\s\\S]*?opacity:1/);
});

test('brand wordmarks on the white application shell and startup screen use the dark artwork', () => {
  assert.match(html, /class="brand-wordmark" src="assets\\/skol-wordmark\\.svg"/);
  assert.match(html, /class="startup-brand"><img src="assets\\/skol-wordmark\\.svg"/);
});
