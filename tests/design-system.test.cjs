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
  assert.match(boot, /localStorage\\.getItem\\(KEY\\)/);
  assert.match(boot, /document\\.documentElement\\.dataset\\.theme = theme/);
});

test('theme switch is accessible, persistent and limited to supported values', () => {
  assert.match(html, /id="themeToggleBtn"/);
  assert.match(renderer, /struktura-source-theme-v1/);
  assert.match(renderer, /setAttribute\\('aria-pressed'/);
  assert.match(renderer, /themeToggleBtn.*addEventListener\\('click'/s);
  assert.match(renderer, /strukturaTheme === 'dark' \\? 'light' : 'dark'/);
});

test('design system defines semantic dark and light tokens and reduced motion', () => {
  for (const token of ['--st-bg', '--st-surface', '--st-line', '--st-ink', '--st-muted', '--st-accent', '--st-positive', '--st-warning', '--st-danger']) {
    assert.ok(css.includes(token), 'missing token ' + token);
  }
  assert.match(css, /html\\[data-theme="dark"\\]/);
  assert.match(css, /html\\[data-theme="light"\\]/);
  assert.match(css, /prefers-reduced-motion:\\s*reduce/);
});

test('existing page routes and feature code remain in place', () => {
  for (const id of ['view-dashboard', 'view-leads', 'view-clients', 'view-projects', 'view-production', 'view-finance', 'view-prospects', 'view-tasks', 'view-reports']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing existing workspace ' + id);
  }
  assert.match(renderer, /function showView\\(name, options = \\{\\}\\)/);
});
