'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fetchAndParseOrderPdf}=require('../src/order-pdf-fetch.cjs');

function response(body,status=200,headers={}){return new Response(body,{status,headers})}
function allowRobots(){return response('User-agent: *\nAllow: /',200,{'content-type':'text/plain'})}
function isPublic(value){
 const url=new URL(value);
 if(['127.0.0.1','localhost','169.254.169.254'].includes(url.hostname))throw new Error('Непубличный адрес заблокирован.');
 return url;
}
const pdfBuffer=Buffer.from('%PDF-1.7\nfake-document-body');

test('downloads a public PDF and extracts text facts with page and hash metadata',async()=>{
 const requests=[];
 let parserOptions;
 const result=await fetchAndParseOrderPdf('https://orders.example/files/tender.pdf',{
  validateUrl:async value=>isPublic(value),
  fetchImpl:async url=>{
   requests.push(url);
   if(url.endsWith('/robots.txt'))return allowRobots();
   return response(pdfBuffer,200,{'content-type':'application/pdf','content-disposition':"attachment; filename*=UTF-8''technical-spec.pdf"});
  },
  parsePdf:async(buffer,options)=>{
   assert.equal(buffer.toString('ascii',0,5),'%PDF-');
   parserOptions=options;
   return {numpages:3,info:{Title:'Техническое задание'},text:'Заказчик: ООО СтройИнвест\nБюджет: 1 200 000 руб.\nОбъём работ: 800 м²\nКонтактное лицо: Иван Петрович Сидоров'};
  }
 });
 assert.equal(requests.length,2);
 assert.equal(result.file_name,'technical-spec.pdf');
 assert.equal(result.page_count,3);
 assert.equal(parserOptions.max,40);
 assert.equal(result.facts.customer_name,'ООО СтройИнвест');
 assert.equal(result.facts.budget_rub,1200000);
 assert.equal(result.facts.volume_value,800);
 assert.ok(/^[a-f0-9]{64}$/.test(result.sha256));
 assert.equal(result.mime_type,'application/pdf');
});

test('does not parse a response that lacks a PDF signature',async()=>{
 await assert.rejects(fetchAndParseOrderPdf('https://orders.example/files/not-pdf',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>url.endsWith('/robots.txt')?allowRobots():response('ordinary HTML',200,{'content-type':'application/pdf'}),
  parsePdf:async()=>{throw new Error('parser must not run')}
 }),/не найден корректный PDF/);
});

test('respects robots.txt before downloading the attachment',async()=>{
 const requests=[];
 await assert.rejects(fetchAndParseOrderPdf('https://orders.example/private/tender.pdf',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>{requests.push(url);return response('User-agent: *\nDisallow: /private/',200,{'content-type':'text/plain'})},
  parsePdf:async()=>({text:'unexpected'})
 }),/robots\.txt запрещает/);
 assert.deepEqual(requests,['https://orders.example/robots.txt']);
});

test('rejects scanned PDFs without a text layer instead of claiming OCR succeeded',async()=>{
 await assert.rejects(fetchAndParseOrderPdf('https://orders.example/scanned.pdf',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>url.endsWith('/robots.txt')?allowRobots():response(pdfBuffer,200,{'content-type':'application/pdf'}),
  parsePdf:async()=>({numpages:2,text:'   '})
 }),/нет текстового слоя/);
});

test('enforces the configured PDF response byte limit',async()=>{
 await assert.rejects(fetchAndParseOrderPdf('https://orders.example/large.pdf',{
  maxBytes:32768,
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>url.endsWith('/robots.txt')?allowRobots():response(Buffer.concat([pdfBuffer,Buffer.alloc(40000)]),200,{'content-type':'application/pdf'}),
  parsePdf:async()=>({text:'should not parse'})
 }),/превышен лимит загрузки/);
});
