'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {calculateOrderEconomics}=require('../src/order-economics.cjs');

test('calculates a conservative duration, costs, profit and margin from explicit inputs',()=>{
 const result=calculateOrderEconomics({
  quantity:1000,budget_rub:0,price_per_unit:500,cost_per_unit:100,
  baseline_productivity:8,crew_size:5,wage_per_worker_shift:3000,
  other_costs_rub:20000,difficulty_factor:1,reserve_percent:15,
  catalog_id:'d-floor-screed',work_name:'Демонтаж стяжки',unit:'м²'
 },[]);
 assert.equal(result.revenue_rub,500000);
 assert.equal(result.estimated_days,28.75);
 assert.equal(result.estimated_cost_rub,551250);
 assert.equal(result.estimated_profit_rub,-51250);
 assert.equal(result.estimated_margin_pct,-10.25);
 assert.equal(result.observations_count,0);
});

test('uses the stated contract budget as revenue when supplied',()=>{
 const result=calculateOrderEconomics({
  quantity:100,budget_rub:200000,price_per_unit:0,cost_per_unit:100,
  baseline_productivity:10,crew_size:2,wage_per_worker_shift:1000,
  other_costs_rub:5000,difficulty_factor:1.5,reserve_percent:20
 },[]);
 assert.equal(result.revenue_rub,200000);
 assert.ok(result.estimated_days>0);
 assert.ok(result.estimated_cost_rub>0);
});

test('rejects missing revenue basis, impossible crew size and zero-cost estimates',()=>{
 const base={quantity:10,budget_rub:0,price_per_unit:0,cost_per_unit:0,baseline_productivity:8,crew_size:5,wage_per_worker_shift:0,other_costs_rub:0};
 assert.throws(()=>calculateOrderEconomics(base,[]),/бюджет заказа или цену за единицу/);
 assert.throws(()=>calculateOrderEconomics({...base,budget_rub:1000,crew_size:0},[]),/от 1 до 200/);
 assert.throws(()=>calculateOrderEconomics({...base,budget_rub:1000},[]),/Не указаны расходы/);
});
