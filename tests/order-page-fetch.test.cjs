'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fetchOrderPage,extractOrderPageContent}=require('../src/order-page-fetch.cjs');
const {extractOrderEvidence}=require('../src/order-evidence.cjs');
function publicUrl(value){
 const url=new URL(value);
 if(['127.0.0.1','localhost','169.254.169.254'].includes(url.hostname))throw new Error('Непубличный адрес заблокирован.');
 return url;
}
function response(body,status=200,headers={}){return new Response(body,{status,headers})}

test('reads server-rendered order conditions from the full public page',async()=>{
 const requests=[];
 const html='<!doctype html>'+
  '<html><head><title>Закупка демонтажа офисного здания</title>'+
  '<meta name="description" content="Заказчик ищет подрядчика для демонтажа."></head>'+
  '<body><header>Навигация и рекламный блок</header>'+
  '<main><h1>Тендер на демонтаж офисного здания</h1>'+
  '<p>Заказчик: ООО СтройИнвест</p><p>Бюджет: 1 200 000 руб.</p>'+
  '<p>Объём работ: 800 м²</p><p>Контактное лицо: Иван Петрович Сидоров</p>'+
  '<p>Срок подачи заявок до 25.11.2026</p><p>Email tender@example.ru</p></main>'+
  '<a href="/files/technical-spec.pdf">Техническое задание PDF</a>'+
  '<footer>Сайт и политика конфиденциальности</footer>'+
  '<script>const privateValue = "не включать";</script></body></html>';
 const result=await fetchOrderPage('https://orders.example/tender/42',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>{
   requests.push(url);
   if(url.endsWith('/robots.txt'))return response('User-agent: *\nAllow: /',200,{'content-type':'text/plain'});
   return response(html,200,{'content-type':'text/html; charset=utf-8'});
  }
 });
 assert.equal(requests.length,2);
 assert.equal(result.title,'Тендер на демонтаж офисного здания');
 assert.deepEqual(result.attachments,[{title:'Техническое задание PDF',url:'https://orders.example/files/technical-spec.pdf',file_name:'technical-spec.pdf'}]);
 assert.match(result.text,/ООО СтройИнвест/);
 assert.match(result.text,/1 200 000 руб/);
 assert.doesNotMatch(result.text,/Навигация и рекламный блок/);
 assert.doesNotMatch(result.text,/privateValue/);
 const facts=extractOrderEvidence(result.title+'\n'+result.text);
 assert.equal(facts.customer_name,'ООО СтройИнвест');
 assert.equal(facts.budget_rub,1200000);
 assert.equal(facts.volume_value,800);
 assert.equal(facts.contact_name,'Иван Петрович Сидоров');
 assert.equal(facts.email,'tender@example.ru');
 assert.match(facts.deadline_text,/25\.11\.2026/);
});

test('respects robots.txt and does not request a disallowed order page',async()=>{
 const requests=[];
 await assert.rejects(fetchOrderPage('https://orders.example/private/tender',{
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>{requests.push(url);return response('User-agent: *\nDisallow: /private/',200,{'content-type':'text/plain'})}
 }),/robots\.txt запрещает/);
 assert.deepEqual(requests,['https://orders.example/robots.txt']);
});

test('validates every redirect target and rejects a redirect to a private IP',async()=>{
 const requests=[];
 await assert.rejects(fetchOrderPage('https://orders.example/tender',{
  validateUrl:async value=>publicUrl(value),
  fetchImpl:async url=>{
   requests.push(url);
   if(url.endsWith('/robots.txt'))return response('User-agent: *\nAllow: /',200,{'content-type':'text/plain'});
   return response(null,302,{location:'http://127.0.0.1/internal'});
  }
 }),/Непубличный адрес заблокирован/);
 assert.equal(requests.at(-1),'https://orders.example/tender');
});

test('rejects non-HTML content and responses above the byte limit',async()=>{
 const base={
  validateUrl:async value=>new URL(value),
  fetchImpl:async url=>url.endsWith('/robots.txt')
   ?response('User-agent: *\nAllow: /',200,{'content-type':'text/plain'})
   :response('not a web page',200,{'content-type':'application/pdf'})
 };
 await assert.rejects(fetchOrderPage('https://orders.example/tender',base),/не является доступной HTML\/TXT/);
 await assert.rejects(fetchOrderPage('https://orders.example/large',{
  ...base,maxBytes:32_768,
  fetchImpl:async url=>url.endsWith('/robots.txt')
   ?response('User-agent: *\nAllow: /',200,{'content-type':'text/plain'})
   :response('x'.repeat(40_000),200,{'content-type':'text/html'})
 }),/превышен лимит загрузки/);
});

test('extractor falls back to body text when no main or article exists',()=>{
 const page=extractOrderPageContent('<html><head><meta property="og:title" content="Объект демонтажа"></head><body><h2>Условия</h2><p>Заказчик ищет подрядчика</p></body></html>','https://orders.example/');
 assert.equal(page.title,'Объект демонтажа');
 assert.match(page.text,/Заказчик ищет подрядчика/);
});
