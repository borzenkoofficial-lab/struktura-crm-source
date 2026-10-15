'use strict';
const ORDER_QUERIES={
 demolition:['тендер закупка демонтаж коммерческих помещений Москва','"ищем подрядчика" демонтаж офисов Москва','закупка демонтаж ремонт реконструкция коммерческий объект Москва Московская область','site:b2b-center.ru демонтаж ремонт Москва'],
 finishing:['тендер закупка отделка офисов fit out Москва','"ищем подрядчика" отделочные работы коммерческие помещения Москва','закупка ремонт реконструкция коммерческий объект Москва Московская область','site:b2b-center.ru отделка ремонт Москва'],
 raised_floor:['тендер закупка демонтаж фальшпол Москва','заказчик ищет подрядчика фальшпол серверная Москва','закупка ремонт серверной коммерческий объект Москва Московская область','site:b2b-center.ru фальшпол демонтаж Москва']
};
const SIGNALS=[
 {key:'tender',label:'Закупка / тендер',weight:30,re:/тендер|закупк|запрос предложен|электронн.{0,12}торг|коммерческ.{0,12}предлож/iu},
 {key:'contractor',label:'Поиск подрядчика',weight:30,re:/ищ.{0,12}подрядчик|требуется подрядчик|приглашаем подрядчик|выбор подрядчик|подрядн.{0,12}организац/iu},
 {key:'demolition',label:'Демонтаж',weight:25,re:/демонтаж|демонтир|разборк.{0,12}(помещ|перегород|покрыт|здан)/iu},
 {key:'renovation',label:'Ремонт / реконструкция',weight:15,re:/ремонт|реконструкц|отделк|fit.?out|капитальн.{0,12}ремонт/iu},
 {key:'commercial',label:'Коммерческий объект',weight:10,re:/офис|магазин|торгов.{0,12}центр|бизнес.?центр|склад|коммерческ.{0,12}помещ|нежил.{0,12}помещ/iu}
];
function buildOrderQueries(service='demolition',region='Москва и Московская область'){
 const qs=ORDER_QUERIES[service]||ORDER_QUERIES.demolition;
 const r=String(region||'Москва и Московская область').replace(/[\r\n]+/g,' ').trim().slice(0,120);
 return qs.map(q=>(q+' '+r).trim());
}
function normalizeOrderResult(item={},query='',service='demolition',region='Москва и Московская область'){
 let url;try{url=new URL(String(item.url||''))}catch{return null}
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return null;
 url.hash='';
 const title=String(item.title||'').replace(/\s+/g,' ').trim().slice(0,240);if(!title)return null;
 const snippet=String(item.description||item.extra_snippets?.[0]||'').replace(/\s+/g,' ').trim().slice(0,1200);
 const signals=SIGNALS.filter(s=>s.re.test(title+' '+snippet+' '+query)).map(({key,label,weight})=>({key,label,weight}));
 return {title,source_url:url.toString().slice(0,700),source_name:url.hostname.replace(/^www\./i,''),snippet,search_query:String(query).slice(0,500),service:['demolition','finishing','raised_floor'].includes(service)?service:'demolition',region:String(region||'Москва и Московская область').slice(0,120),signal_score:Math.min(100,signals.reduce((sum,s)=>sum+s.weight,0)),signal_labels:signals.map(s=>s.label),relevance:signals.some(s=>['tender','contractor','demolition'].includes(s.key))?'potential_order':'review'};
}
function deduplicateOrders(items=[]){const seen=new Set();return items.filter(x=>{if(!x?.source_url||seen.has(x.source_url))return false;seen.add(x.source_url);return true})}
module.exports={buildOrderQueries,normalizeOrderResult,deduplicateOrders};
