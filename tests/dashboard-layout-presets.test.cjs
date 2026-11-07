'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const expectedWidgets = new Set(['kpis', 'attention', 'finance', 'pipeline', 'portfolio', 'progress', 'recent']);

function parseIds(value) {
  return [...value.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

test('dashboard workspace presets only reference real widgets', () => {
  const match = renderer.match(/const presets=\{\s*overview:\{order:\[\.\.\.DASHBOARD_DEFAULT_ORDER\],hidden:\[\]\},\s*sales:\{order:\[([^\]]*)\],hidden:\[([^\]]*)\]\},\s*finance:\{order:\[([^\]]*)\],hidden:\[([^\]]*)\]\}\s*\};/);
  assert.ok(match, 'workspace preset configuration must remain explicit and testable');

  const salesOrder = parseIds(match[1]);
  const salesHidden = parseIds(match[2]);
  const financeOrder = parseIds(match[3]);
  const financeHidden = parseIds(match[4]);

  for (const [name, order, hidden] of [
    ['sales', salesOrder, salesHidden],
    ['finance', financeOrder, financeHidden]
  ]) {
    assert.equal(new Set(order).size, order.length, name + ' preset must not contain duplicate widgets');
    assert.deepEqual(new Set(order), expectedWidgets, name + ' preset must order every real widget exactly once');
    for (const id of hidden) assert.ok(expectedWidgets.has(id), name + ' preset hides an unknown widget: ' + id);
  }

  assert.deepEqual(salesHidden, ['finance'], 'sales preset should hide the finance widget');
  assert.deepEqual(financeHidden, ['pipeline', 'attention'], 'finance preset should hide sales and attention widgets');
});
