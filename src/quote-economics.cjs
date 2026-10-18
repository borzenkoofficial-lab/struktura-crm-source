'use strict';

function calculateQuoteTotals(lines, discountInput = 0) {
  const safeLines = Array.isArray(lines) ? lines.slice(0, 500) : [];
  const grossRevenueRub = safeLines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.price) || 0), 0);
  const costRub = safeLines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.cost) || 0), 0);
  const discountRub = Math.min(grossRevenueRub, Math.max(0, Number(discountInput) || 0));
  const revenueRub = Math.max(0, grossRevenueRub - discountRub);
  const profitRub = revenueRub - costRub;
  return { grossRevenueRub, revenueRub, costRub, profitRub, discountRub, marginPct: revenueRub > 0 ? profitRub / revenueRub * 100 : 0 };
}
module.exports = { calculateQuoteTotals };
