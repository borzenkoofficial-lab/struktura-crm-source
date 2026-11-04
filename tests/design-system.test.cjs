'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'theme-boot.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'struktura-design-system.css'), 'utf8');

test('theme bootstrap runs before styles to prevent first-paint theme flash', () => {
  assert.ok(html.indexOf('theme-boot.js') < html.indexOf('styles.css'));
  assert.ok(boot.includes('localStorage.getItem(KEY)'));
  assert.ok(boot.includes('document.documentElement.dataset.theme = theme'));
});

test('theme switch is accessible and persistent', () => {
  assert.ok(html.includes('id="themeToggleBtn"'));
  assert.ok(renderer.includes("skol-theme-preference-v1"));
  assert.ok(renderer.includes("button.setAttribute('aria-pressed'"));
  assert.ok(renderer.includes("$('themeToggleBtn')?.addEventListener('click'"));
  assert.ok(renderer.includes("strukturaTheme === 'dark' ? 'light' : 'dark'"));
});

test('design system defines semantic dark and light tokens and reduced motion', () => {
  for (const token of ['--st-bg', '--st-surface', '--st-line', '--st-ink', '--st-muted', '--st-accent', '--st-positive', '--st-warning', '--st-danger']) {
    assert.ok(css.includes(token), 'missing token ' + token);
  }
  assert.ok(css.includes('html[data-theme="dark"]'));
  assert.ok(css.includes('html[data-theme="light"]'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
});

test('existing page routes and feature code remain in place', () => {
  for (const id of ['view-dashboard', 'view-leads', 'view-clients', 'view-projects', 'view-production', 'view-finance', 'view-prospects', 'view-tasks', 'view-reports']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing existing workspace ' + id);
  }
  assert.ok(renderer.includes('function showView(name, options = {})'));
});

test('PI companion does not automatically cover workspaces and uses a technical mark', () => {
  assert.ok(renderer.includes('if (unseen && options.force === true && canAutoOpen)'));
  assert.ok(!renderer.includes('unseen.severity === \'danger\' || unseen.priority >= 88'));
  assert.ok(html.includes('class="pi-avatar-mark"'));
  assert.ok(!html.includes('class="pi-avatar-face"'));
  assert.ok(css.includes('.main { padding-bottom: 104px !important; }'));
});
