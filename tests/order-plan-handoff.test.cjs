'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {MAX_PLAN_LINES,canonicalUnit,unitsCompatible,toEstimateImportText}=require('../src/order-plan-handoff.cjs');

test('formats extracted work items for the existing catalog-matching importer',()=>{
 const text=toEstimateImportText([
  {work_name:'Демонтаж "сложных"; перегородок',quantity:150,unit:'м²',unit_price_rub:1200,amount_rub:180000},
  {work_name:'Снятие цементной стяжки',quantity:40,unit:'м2'}
 ]);
 assert.equal(text,'"Демонтаж ""сложных""; перегородок";150;"м²"\n"Снятие цементной стяжки";40;"м2"');
 assert.doesNotMatch(text,/1200|180000/);
});
test('canonicalizes compatible Russian area and length units',()=>{
 assert.equal(canonicalUnit('кв. м'),'м²');
 assert.equal(canonicalUnit('м2'),'м²');
 assert.equal(canonicalUnit('пог. м'),'пог.м');
 assert.equal(unitsCompatible('м²','кв. м'),true);
 assert.equal(unitsCompatible('шт.','м²'),false);
 assert.equal(unitsCompatible('т','м³'),false);
 assert.equal(unitsCompatible('','м²'),true);
});
test('rejects invalid, empty or oversized document line lists',()=>{
 assert.throws(()=>toEstimateImportText([]),/нет распознанных строк/);
 assert.throws(()=>toEstimateImportText([{work_name:'',quantity:1}]),/отсутствует наименование/);
 assert.throws(()=>toEstimateImportText([{work_name:'Демонтаж',quantity:0}]),/некорректное количество/);
 assert.equal(MAX_PLAN_LINES,100);
 assert.throws(()=>toEstimateImportText(Array.from({length:101},(_,i)=>({work_name:'Работа '+i,quantity:1,unit:'м²'}))),/не более 100/);
});
