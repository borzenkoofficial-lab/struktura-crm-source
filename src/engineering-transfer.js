'use strict';
(function(root){
const MAX_LINES=100,n=(v,l,d=0)=>{const x=Number(v??d);if(!Number.isFinite(x))throw new Error(l+': значение должно быть числом.');return x;};
const bounded=(v,l,min=0,max=1e12)=>{const x=n(v,l);if(x<min||x>max)throw new Error(l+': значение должно быть от '+min+' до '+max+'.');return x;};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),money=x=>Math.round((Number(x)+Number.EPSILON)*100)/100;
function normalizeLines(lines){
 if(!Array.isArray(lines))throw new Error('В смете нет списка работ для переноса.');
 const valid=lines.filter(line=>n(line?.quantity,'Объём',0)>0).map((line,i)=>{
  if(!line||typeof line!=='object')throw new Error('Строка сметы №'+(i+1)+' имеет неверный формат.');
  const name=String(line.name||'').trim()||'Работа '+(i+1);
  return {...line,lineId:String(line.lineId||line.id||'line-'+(i+1)),catalogId:String(line.catalogId||''),name,unit:String(line.unit||'ед.'),
   quantity:bounded(line.quantity,'Объём «'+name+'»',0.000001,1e9),price:bounded(line.price,'Цена «'+name+'»',0,1e9),
   cost:bounded(line.cost,'Себестоимость «'+name+'»',0,1e9),productivity:bounded(line.productivity,'Производительность «'+name+'»',0,1e9)};
 });
 if(!valid.length)throw new Error('Добавь хотя бы одну работу с объёмом больше нуля в калькуляторе сметы.');
 if(valid.length>MAX_LINES)throw new Error('Для переноса в ПИ допускается не более '+MAX_LINES+' строк сметы.');
 return valid;
}
function buildEngineeringTransfer(source={}){
 const mode=source.mode==='complex'?'complex':source.mode==='standard'?'standard':'';
 if(!mode)throw new Error('Выбери стандартный или комплексный расчёт.');
 const metadata={...(source.metadata||{})},settings={...(source.settings||{})},crew={...(settings.crew||{})};
 const lines=normalizeLines(source.lines),duration=Array.isArray(source.durationLines)?source.durationLines:[],totals={...(source.totals||{})};
 const people=bounded(crew.people,'Количество работников',1,200);
 if(!Number.isInteger(people))throw new Error('Количество работников должно быть целым числом от 1 до 200.');
 const hours=bounded(crew.hoursPerDay,'Длительность смены',1,24),difficultyInput=bounded(settings.difficulty,'Сложность объекта',0.25,5),difficulty=clamp(difficultyInput,0.25,3);
 const efficiency=clamp(n(settings.efficiencyPercent,'Полезное время смены',85),25,100);
 const overhead=bounded(settings.overheadPercent,'Накладные расходы',0,100),tax=bounded(settings.taxPercent,'Резерв на налоги',0,50);
 const discount=bounded(settings.discountPercent,'Скидка',0,100),reserve=bounded(settings.reservePercent,'Резерв срока',0,100);
 const sourceMargin=bounded(settings.marginPercent,'Целевая маржа',0.01,99),targetMargin=clamp(sourceMargin,0.01,Math.min(79.99,99.99-tax));
 const targetShiftsInput=bounded(settings.targetDays,'Целевой срок',0.1,3650),targetShifts=clamp(targetShiftsInput,1,365);
 const commonCost=['materialsCost','disposalCost','transportCost','equipmentCost','otherCost'].reduce((s,k)=>s+bounded(settings[k],k,0,1e12),0);
 const payroll=bounded(totals.payroll,'Оплата бригады',0,1e12),listRevenue=lines.reduce((s,l)=>s+l.quantity*l.price,0);
 const netPrices=lines.map(l=>money(l.price*(1-discount/100)));
 const rates=lines.map((line,i)=>{
  const d=duration[i]||{},observations=Math.max(0,Math.floor(n(d.learningObservations,'Количество наблюдений',0)));
  const reliable=d.hasReliableHistory===true||observations>=4,effectiveRate=n(d.effectiveProductivity,'Эффективная производительность «'+line.name+'»',0);
  const catalogRate=n(d.productivity,'Норма «'+line.name+'»',line.productivity);
  const eff=Number.isFinite(Number(d.effectiveEfficiency))?clamp(Number(d.effectiveEfficiency),25,100):(reliable?100:efficiency);
  const base=effectiveRate>0?effectiveRate*difficulty:catalogRate*eff/100,effective=base/difficulty;
  return {observations,baseProductivity:base,effectiveProductivity:effective,personShifts:effective>0?line.quantity/effective:null};
 });
 const missing=lines.filter((l,i)=>!(l.productivity>0)||!(rates[i].effectiveProductivity>0)||!Number.isFinite(rates[i].personShifts)||rates[i].personShifts<=0);
 const shiftLoad=rates.reduce((s,r)=>s+(Number.isFinite(r.personShifts)&&r.personShifts>0?r.personShifts:0),0);
 const wageRate=shiftLoad>0?payroll*hours/(shiftLoad*8):0;
 const revenueWeights=lines.map(l=>Math.max(0,l.quantity*l.price)),revenueTotal=revenueWeights.reduce((s,x)=>s+x,0);
 const fallback=lines.map((l,i)=>Math.max(0,l.quantity*l.cost)+Math.max(0,rates[i].personShifts||0)),fallbackTotal=fallback.reduce((s,x)=>s+x,0);
 const weights=revenueTotal>0?revenueWeights.map(x=>x/revenueTotal):fallbackTotal>0?fallback.map(x=>x/fallbackTotal):lines.map(()=>1/lines.length);
 const alloc=i=>money(commonCost*weights[i]);
 const economics={listRevenue:n(totals.listRevenue,'Сумма сметы до скидки',listRevenue),discount:n(totals.discount,'Скидка сметы',listRevenue*discount/100),
  revenue:n(totals.revenue,'Выручка сметы',listRevenue*(1-discount/100)),payroll,
  lineCosts:n(totals.lineCosts,'Себестоимость строк',lines.reduce((s,l)=>s+l.quantity*l.cost,0)),
  materials:n(settings.materialsCost,'Материалы'),disposal:n(settings.disposalCost,'Вывоз'),transport:n(settings.transportCost,'Транспорт'),equipment:n(settings.equipmentCost,'Техника'),
  other:n(settings.otherCost,'Прочие расходы'),overhead:n(totals.overhead,'Накладные расходы'),taxReserve:n(totals.taxReserve,'Налоговый резерв'),
  totalCost:n(totals.totalCost,'Полная себестоимость'),profit:n(totals.profit,'Расчётная прибыль'),actualMargin:n(totals.actualMargin,'Фактическая маржа'),
  sourceTargetMargin:sourceMargin,discountPercent:discount,overheadPercent:overhead,taxPercent:tax};
 const meta={title:String(metadata.title||'Предварительная смета').slice(0,180),customer:String(metadata.customer||'').slice(0,180),address:String(metadata.address||'').slice(0,240),
  contact:String(metadata.contact||'').slice(0,120),service:String(metadata.service||''),validity:String(metadata.validity||''),workArea:n(metadata.workArea,'Площадь объекта',0)};
 const note=['Перенесено из калькулятора сметы СКОЛ.',meta.customer?'Заказчик: '+meta.customer:'',meta.address?'Адрес: '+meta.address:'',meta.contact?'Контакт: '+meta.contact:'',
  'Исходная смета: '+Math.round(economics.revenue).toLocaleString('ru-RU')+' ₽ после скидки.','Позиции: '+lines.length+'.',
  'Нормы уже содержат поправки, учтённые калькулятором сметы.','Проверь технологические зависимости перед подтверждением.'].filter(Boolean).join('\n').slice(0,4500);
 const warnings=[];
 if(targetMargin!==sourceMargin)warnings.push('Целевая маржа '+sourceMargin+'% ограничена '+targetMargin+'% в ПИ: исходная формула допускает маржу ниже 80% с учётом налога.');
 if(difficulty!==difficultyInput)warnings.push('Сложность '+difficultyInput+' ограничена '+difficulty+' в ПИ: это максимальное значение, поддерживаемое обоими калькуляторами.');
 if(mode==='standard'&&targetShifts!==targetShiftsInput)warnings.push('Целевой срок '+targetShiftsInput+' смен ограничен '+targetShifts+' сменами в стандартном калькуляторе ПИ.');
 if(mode==='standard'){
  const selected=String(source.selectedLineId||''),found=selected?lines.findIndex(l=>l.lineId===selected):0;
  if(selected&&found<0)throw new Error('Выбранная строка сметы больше не найдена. Обнови окно переноса и выбери работу заново.');
  const i=Math.max(0,found),line=lines[i],rate=rates[i];
  if(!(line.productivity>0)||!(rate.effectiveProductivity>0)||!Number.isFinite(rate.personShifts))throw new Error('Для работы «'+line.name+'» не задана производительность. Укажи норму в прайсе и повтори перенос.');
  const payrollShare=shiftLoad>0?payroll*rate.personShifts/shiftLoad:0;
  const input={title:meta.title,description:(note+'\nПозиция: '+line.name+' · '+line.quantity+' '+line.unit+'.').slice(0,5000),catalogId:line.catalogId,workName:line.name,unit:line.unit,quantity:line.quantity,
   baselineProductivity:money(rate.baseProductivity),preAdjusted:true,observationCount:rate.observations,crewSize:people,hoursPerShift:hours,
   wagePerWorkerShift:rate.personShifts>0?payrollShare*hours/(rate.personShifts*8):0,pricePerUnit:netPrices[i],extraCostPerUnit:line.cost,fixedCosts:alloc(i),
   overheadPercent:overhead,taxPercent:tax,targetMarginPercent:targetMargin,reservePercent:reserve,targetShifts,difficultyFactor:difficulty,
   conditions:{thicknessMm:0,reinforced:'no',floor:1,elevator:'yes',carryDistanceM:10,method:'mechanized',difficultyFactor:difficulty}};
  return {mode,title:meta.title,description:input.description,input,sourceLineId:line.lineId,metadata:meta,sourceEconomics:economics,warnings};
 }
 if(missing.length)throw new Error('Не удалось перенести комплексный объект: для следующих работ не задана корректная производительность — '+missing.slice(0,8).map(l=>l.name).join(', ')+(missing.length>8?' и ещё '+(missing.length-8):'')+'. Заполни норму в прайсе.');
 const operations=lines.map((l,i)=>({catalogId:l.catalogId,name:l.name,quantity:l.quantity,productivity:money(rates[i].baseProductivity),crewSize:people,hoursPerShift:hours,
  wagePerWorkerShift:wageRate,pricePerUnit:netPrices[i],extraCostPerUnit:l.cost,fixedCosts:alloc(i),overheadPercent:overhead,taxPercent:tax,reservePercent:reserve,difficultyFactor:difficulty,predecessors:[]}));
 return {mode,title:meta.title,description:note,metadata:meta,sourceEconomics:economics,availableWorkers:people,operations,
  calendarOptions:{startDate:String(source.startDate||'').match(/^\d{4}-\d{2}-\d{2}$/)?source.startDate:'',weekdaysOnly:source.weekdaysOnly!==false},warnings};
}
const api={buildEngineeringTransfer,normalizeLines};root.SkolEngineeringTransfer=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
