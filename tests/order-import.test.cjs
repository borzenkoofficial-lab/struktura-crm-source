'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {parseCommercialOrdersCsv}=require('../src/order-import.cjs');

test('imports semicolon-separated commercial orders with Russian headers',()=>{
 const result=parseCommercialOrdersCsv('Название;Ссылка;Описание;Услуга;Регион;Бюджет;Объём;Срок\nДемонтаж офиса;https://example.ru/tender/1;Заказчик ищет подрядчика;Демонтаж;Москва;1500000;1000 м2;до 25.10.2026');
 assert.equal(result.orders.length,1);
 assert.equal(result.skipped,0);
 assert.equal(result.orders[0].service,'demolition');
 assert.ok(result.orders[0].snippet.includes('Бюджет/цена: 1500000'));
 assert.match(result.orders[0].snippet,/Объём: 1000 м2/);
});

test('skips rows without a title or valid original source URL',()=>{
 const result=parseCommercialOrdersCsv('title,url\nБез ссылки,\nЗаказ,ftp://example.ru/order');
 assert.equal(result.orders.length,0);
 assert.equal(result.skipped,2);
});

test('rejects files that lack the source URL column',()=>{
 assert.throws(()=>parseCommercialOrdersCsv('title,description\nЗаказ,текст'),/ссылкой на первоисточник/);
});
