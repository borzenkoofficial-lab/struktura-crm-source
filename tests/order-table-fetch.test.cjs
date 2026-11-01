'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {fetchAndParseOrderTable}=require('../src/order-table-fetch.cjs');

function response(body,status=200,headers={}){return new Response(body,{status,headers})}
function allowRobots(){return response('User-agent: *\nAllow: /',200,{'content-type':'text/plain'})}
function makeWorkbook(){
 const workbook=XLSX.utils.book_new();
 const sheet=XLSX.utils.aoa_to_sheet([['Заказчик: ООО СтройИнвест'],['Бюджет: 1 200 000 руб.'],['Объём работ: 800 м²'],['Контактное лицо: Иван Петрович Сидоров']]);
 XLSX.utils.book_append_sheet(workbook,sheet,'Сведения');
 const volumeSheet=XLSX.utils.aoa_to_sheet([
  ['№','Наименование работ','Ед. изм.','Количество','Цена за ед.','Сумма'],
  [1,'Демонтаж кирпичных перегородок','м²','150','1 200','180 000'],
  [2,'Снятие цементной стяжки','м²','40','800','32 000']
 ]);
 XLSX.utils.book_append_sheet(workbook,volumeSheet,'Ведомость объёмов');
 return Buffer.from(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
}
test('downloads an XLSX tender attachment and extracts facts from worksheet rows',async()=>{
 const buffer=makeWorkbook();
 const result=await fetchAndParseOrderTable('https://orders.example/docs/volumes.xlsx',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>url.endsWith('/robots.txt')?allowRobots():response(buffer,200,{
   'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'content-disposition':"attachment; filename*=UTF-8''volumes.xlsx"
  })
 });
 assert.equal(result.file_name,'volumes.xlsx');
 assert.equal(result.document_type,'table');
 assert.equal(result.sheet_count,2);
 assert.equal(result.row_count,7);
 assert.equal(result.line_items.length,2);
 assert.equal(result.line_items[0].work_name,'Демонтаж кирпичных перегородок');
 assert.equal(result.line_items[0].quantity,150);
 assert.equal(result.line_items[0].unit,'м²');
 assert.equal(result.line_items[0].unit_price_rub,1200);
 assert.equal(result.line_items[0].amount_rub,180000);
 assert.match(result.text,/Бюджет: 1 200 000 руб/);
 assert.equal(result.facts.customer_name,'ООО СтройИнвест');
 assert.equal(result.facts.budget_rub,1200000);
 assert.equal(result.facts.volume_value,800);
 assert.ok(/^[a-f0-9]{64}$/.test(result.sha256));
});
test('parses CSV tabular conditions with explicit source fields',async()=>{
 const csv=Buffer.from('Заказчик: ООО СтройИнвест;Бюджет: 900 000 руб.;Объём работ: 600 м2');
 const result=await fetchAndParseOrderTable('https://orders.example/docs/volume.csv',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>url.endsWith('/robots.txt')?allowRobots():response(csv,200,{'content-type':'text/csv','content-disposition':'attachment; filename="volume.csv"'})
 });
 assert.equal(result.file_name,'volume.csv');
 assert.equal(result.facts.customer_name,'ООО СтройИнвест');
 assert.equal(result.facts.budget_rub,900000);
 assert.equal(result.facts.volume_value,600);
});
test('rejects an XLSX file with the wrong container signature',async()=>{
 await assert.rejects(fetchAndParseOrderTable('https://orders.example/docs/bad.xlsx',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>url.endsWith('/robots.txt')?allowRobots():response('not excel',200,{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
 }),/не является ZIP-контейнером Excel/);
});
test('respects robots.txt and does not request a blocked table attachment',async()=>{
 const requests=[];
 await assert.rejects(fetchAndParseOrderTable('https://orders.example/private/volume.xlsx',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>{requests.push(url);return response('User-agent: *\nDisallow: /private/',200,{'content-type':'text/plain'})}
 }),/robots\.txt запрещает/);
 assert.deepEqual(requests,['https://orders.example/robots.txt']);
});
test('enforces the table attachment byte limit',async()=>{
 await assert.rejects(fetchAndParseOrderTable('https://orders.example/large.xlsx',{
  maxBytes:32768,
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>url.endsWith('/robots.txt')?allowRobots():response(Buffer.concat([makeWorkbook(),Buffer.alloc(40000)]),200,{
   'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
 }),/превышен лимит загрузки/);
});
