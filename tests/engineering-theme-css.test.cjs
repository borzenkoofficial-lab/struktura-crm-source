'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = [
  ['engineering calculator', 'engineering-calculator.css'],
  ['engineering project plan', 'engineering-project-plan.css']
].map(([name, file]) => ({
  name,
  css: fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
}));

test('engineering workspaces use the active Salesforce theme tokens', () => {
  for (const { name, css } of styles) {
    assert.match(css, /var\\(--sf-/u, name + ' must use theme variables');
  }
});

test('engineering workspaces preserve narrow-layout overflow safety', () => {
  for (const { name, css } of styles) {
    assert.match(css, /min-width\\s*:\\s*0/u, name + ' must allow grid children to shrink');
    assert.match(css, /overflow\\s*:\\s*(?:auto|hidden)/u, name + ' must contain overflow');
  }
});
