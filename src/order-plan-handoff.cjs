'use strict';
const MAX_PLAN_LINES=100;
function safeCell(value){return String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim()}
function quoteCell(value){return '"'+safeCell(value).replace(/"/g,'""')+'"'}
function canonicalUnit(value){
 const raw=safeCell(value).toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[\s.]+/g,'');
 if(!raw)return '';
 if(/^(м2|м²|квм|квадратныйметр|квадратныхметров)$/.test(raw))return 'м²';
 if(/^(м3|м³|кубм|кубическийметр|кубическихметров)$/.test(raw))return 'м³';
 if(/^(погм|погонныйметр|пм|мп)$/.test(raw))return 'пог.м';
 if(/^(шт|штука|штук|ед|единица|усл|усл?ед|компл|комплект|комплекта)$/.test(raw))return 'шт.';
 if(/^(т|тонна|тонн)$/.test(raw))return 'т';
 return raw;
}
function unitsCompatible(sourceUnit,targetUnit){
 const source=canonicalUnit(sourceUnit),target=canonicalUnit(targetUnit);
 if(!source||!target)return true;
 return source===target;
}
function toEstimateImportText(lineItems){
 if(!Array.isArray(lineItems)||!lineItems.length)throw new Error('В документе нет распознанных строк работ для передачи.');
 if(lineItems.length>MAX_PLAN_LINES)throw new Error('В один инженерный план можно передать не более '+MAX_PLAN_LINES+' позиций. Отфильтруй ведомость до 100 строк.');
 return lineItems.map((item,index)=>{
  if(!item||typeof item!=='object')throw new Error('Строка №'+(index+1)+' имеет неверный формат.');
  const name=safeCell(item.work_name||item.name),quantity=Number(item.quantity),unit=safeCell(item.unit);
  if(!name)throw new Error('В строке №'+(index+1)+' отсутствует наименование работы.');
  if(!Number.isFinite(quantity)||quantity<=0)throw new Error('В строке №'+(index+1)+' некорректное количество.');
  return quoteCell(name)+';'+String(quantity)+';'+quoteCell(unit);
 }).join('\n');
}
const api={MAX_PLAN_LINES,canonicalUnit,unitsCompatible,toEstimateImportText};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof window!=='undefined')window.SkolOrderPlanHandoff=api;
