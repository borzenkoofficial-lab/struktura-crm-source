'use strict';
const { validatePublicUrl, robotsAllows, plainText } = require('./site-crawler.cjs');
const DEFAULT_MAX_BYTES=1_200_000, MAX_ROBOTS_BYTES=100_000, MAX_PAGE_TEXT=18_000;
const MAX_RESOURCE_BYTES=20*1024*1024;
const REDIRECT_STATUSES=new Set([301,302,303,307,308]);

function getAttribute(tag,name){
 const source=String(tag);
 const doubleQuoted=source.match(new RegExp('\\b'+name+'\\s*=\\s*"([^"]*)"','i'));
 if(doubleQuoted)return doubleQuoted[1];
 const singleQuoted=source.match(new RegExp("\\b"+name+"\\s*=\\s*'([^']*)'",'i'));
 if(singleQuoted)return singleQuoted[1];
 const unquoted=source.match(new RegExp('\\b'+name+'\\s*=\\s*([^\\s>]+)','i'));
 return unquoted?unquoted[1]:'';
}
function metaContent(html,key,attribute='name'){
 for(const match of String(html).matchAll(/<meta\b[^>]*>/gi)){
  const tag=match[0];
  if(getAttribute(tag,attribute).toLowerCase()===key.toLowerCase())return plainText(getAttribute(tag,'content')).trim();
 }
 return '';
}
function extractPdfAttachments(html,pageUrl){
 const attachments=[],seen=new Set();
 for(const match of String(html||'').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)){
  const tag=match[0].slice(0,match[0].indexOf('>')+1);
  const href=getAttribute(tag,'href').trim();
  if(!href||/^javascript:|^data:|^mailto:/i.test(href))continue;
  let url;
  try{url=new URL(href,pageUrl)}catch{continue}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;
  url.hash='';
  const label=plainText(match[1]).replace(/\s+/g,' ').trim().slice(0,180);
  const pathLooksPdf=/\.pdf$/i.test(url.pathname)||/^(pdf)$/i.test(url.searchParams.get('format')||'')||/^(pdf)$/i.test(url.searchParams.get('type')||'');
  const downloadHint=Boolean(getAttribute(tag,'download'))&&/(?:pdf|документ|приложен|техническ|смет|ведомост)/iu.test(label);
  const labelHint=/(?:\.pdf\b|\bpdf\b|скачать\s+(?:документ|файл|техническ|смет)|техническ\w*\s+задан|ведомост\w*\s+(?:об[ъы]?[её]м|работ)|смет\w*)/iu.test(label)&&/(?:download|file|document|attachment|\.pdf)/iu.test(url.pathname+' '+url.search);
  if(!pathLooksPdf&&!downloadHint&&!labelHint)continue;
  const key=url.toString();
  if(seen.has(key))continue;
  seen.add(key);
  const rawName=url.pathname.split('/').pop()||'';
  let fileName=rawName;
  try{fileName=decodeURIComponent(rawName)}catch{}
  attachments.push({title:label||fileName||'PDF-документ',url:key,file_name:fileName.slice(0,240)});
  if(attachments.length>=20)break;
 }
 return attachments;
}
function extractOrderPageContent(html,pageUrl){
 const source=String(html||'');
 const h1=(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)||[,''])[1];
 const titleTag=(source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)||[,''])[1];
 const heading=plainText(h1).replace(/\s+/g,' ').trim();
 const documentTitle=plainText(titleTag).replace(/\s+/g,' ').trim();
 const openGraphTitle=metaContent(source,'og:title','property');
 const title=(heading||openGraphTitle||documentTitle||new URL(pageUrl).hostname).slice(0,180);
 const description=metaContent(source,'description')||metaContent(source,'og:description','property');
 const mainMatch=source.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i);
 const bodyMatch=source.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
 const mainText=plainText(mainMatch?.[2]||'').replace(/\n{3,}/g,'\n\n').trim();
 const fallbackHtml=(bodyMatch?.[1]||source).replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
 const fallbackText=plainText(fallbackHtml).replace(/\n{3,}/g,'\n\n').trim();
 const content=mainText.length>=120?mainText:fallbackText;
 const text=[description,content].filter(Boolean).join('\n\n').slice(0,MAX_PAGE_TEXT);
 return {title,text,page_url:String(pageUrl).slice(0,700),attachments:extractPdfAttachments(source,pageUrl)};
}
async function readLimitedBuffer(response,maxBytes){
 const declaredLength=Number(response.headers?.get?.('content-length')||0);
 if(Number.isFinite(declaredLength)&&declaredLength>maxBytes)throw new Error('Страница слишком большая: превышен лимит загрузки.');
 const reader=response.body?.getReader?.();
 if(!reader){
  const buffer=Buffer.from(await response.arrayBuffer());
  if(buffer.length>maxBytes)throw new Error('Страница слишком большая: превышен лимит загрузки.');
  return buffer;
 }
 const chunks=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   const chunk=Buffer.from(value);total+=chunk.length;
   if(total>maxBytes){try{await reader.cancel()}catch{}throw new Error('Страница слишком большая: превышен лимит загрузки.')}
   chunks.push(chunk);
  }
 }finally{try{reader.releaseLock()}catch{}}
 return Buffer.concat(chunks);
}
async function readLimitedText(response,maxBytes){
 return (await readLimitedBuffer(response,maxBytes)).toString('utf8');
}
async function fetchPublicResource(sourceUrl,options={}){
 const validateUrl=options.validateUrl||validatePublicUrl,fetchImpl=options.fetchImpl||fetch;
 const cap=Math.max(32_768,Math.min(Number(options.maxAllowedBytes)||MAX_RESOURCE_BYTES,MAX_RESOURCE_BYTES));
 const maxBytes=Math.max(32_768,Math.min(Number(options.maxBytes)||DEFAULT_MAX_BYTES,cap));
 const timeoutMs=Math.max(2_500,Math.min(Number(options.timeoutMs)||10_000,15_000));
 const maxRedirects=Math.max(0,Math.min(Number(options.maxRedirects??3),5));
 const allowedTypes=Array.isArray(options.contentTypes)?options.contentTypes.map(x=>String(x).toLowerCase()):['text/html','application/xhtml+xml','text/plain'];
 const headers={'User-Agent':'SKOL (+public commercial order review; respects robots.txt)',Accept:allowedTypes.join(',')+',application/octet-stream;q=0.5','Accept-Language':'ru,en;q=0.5'};
 const robotsCache=new Map();
 async function requestValidated(rawUrl,purpose='page'){
  let current=await validateUrl(String(rawUrl));
  if(!current||typeof current.toString!=='function'||!current.origin)throw new Error('Не удалось проверить адрес публичной страницы.');
  const initialOrigin=current.origin,visited=new Set();
  for(let redirects=0;redirects<=maxRedirects;redirects++){
   if(purpose==='page')await ensureRobotsAllowed(current);
   const key=current.toString();if(visited.has(key))throw new Error('Обнаружен цикл перенаправлений.');visited.add(key);
   const response=await fetchImpl(key,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers});
   if(!REDIRECT_STATUSES.has(response.status))return {response,url:current};
   const location=response.headers?.get?.('location');
   if(!location||redirects===maxRedirects)throw new Error('Слишком много перенаправлений.');
   const next=await validateUrl(new URL(location,current).toString());
   if(purpose==='robots'&&next.origin!==initialOrigin)throw new Error('Перенаправление robots.txt на другой домен запрещено.');
   current=next;
  }
  throw new Error('Не удалось открыть страницу после перенаправлений.');
 }
 async function ensureRobotsAllowed(url){
  if(!robotsCache.has(url.origin)){
   const {response}=await requestValidated(new URL('/robots.txt',url.origin).toString(),'robots');
   let rules='';
   if(response.status===404||response.status===410||(response.status>=400&&response.status<500&&![401,403,429].includes(response.status)))rules='';
   else if(!response.ok)throw new Error('Не удалось проверить robots.txt (HTTP '+response.status+'). Загрузка страницы остановлена.');
   else rules=await readLimitedText(response,MAX_ROBOTS_BYTES);
   robotsCache.set(url.origin,rules);
  }
  if(!robotsAllows(robotsCache.get(url.origin),url.pathname+url.search))throw new Error('robots.txt запрещает автоматическое чтение этой страницы.');
 }
 const {response,url}=await requestValidated(sourceUrl,'page');
 if(!response.ok)throw new Error('Источник вернул HTTP '+response.status+'.');
 const contentType=String(response.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!allowedTypes.includes(contentType))throw new Error('Источник вернул неподдерживаемый формат: '+(contentType||'неизвестно')+'.');
 const buffer=await readLimitedBuffer(response,maxBytes);
 return {buffer,url:url.toString(),contentType,bytes:buffer.length};
}
async function fetchOrderPage(sourceUrl,options={}){
 const resource=await fetchPublicResource(sourceUrl,{
  ...options,
  maxBytes:options.maxBytes||DEFAULT_MAX_BYTES,
  maxAllowedBytes:DEFAULT_MAX_BYTES,
  contentTypes:['text/html','application/xhtml+xml','text/plain']
 });
 const result=extractOrderPageContent(resource.buffer.toString('utf8'),resource.url);
 return {title:result.title,text:result.text,page_url:result.page_url,bytes:resource.bytes,attachments:result.attachments};
}
module.exports={fetchPublicResource,fetchOrderPage,extractOrderPageContent,extractPdfAttachments,readLimitedBuffer,readLimitedText};
