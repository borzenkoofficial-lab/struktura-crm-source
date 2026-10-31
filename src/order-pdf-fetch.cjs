'use strict';
const crypto=require('node:crypto');
const {fetchPublicResource}=require('./order-page-fetch.cjs');
const {extractOrderEvidence}=require('./order-evidence.cjs');
const MAX_PDF_BYTES=15*1024*1024;
const MAX_PDF_PAGES=40;
const MAX_STORED_TEXT=80_000;

function fileNameFromResponse(disposition,finalUrl){
 const value=String(disposition||'');
 let name='';
 const encoded=value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
 const ordinary=value.match(/filename\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;]+))/i);
 try{
  if(encoded)name=decodeURIComponent(encoded[1].trim());
  else if(ordinary)name=String(ordinary[1]||ordinary[2]||ordinary[3]||'').trim();
 }catch{}
 if(!name){
  try{name=decodeURIComponent(new URL(finalUrl).pathname.split('/').pop()||'')}catch{}
 }
 return name.replace(/[\\/\0\r\n]/g,'_').slice(0,240)||'document.pdf';
}
async function fetchAndParseOrderPdf(sourceUrl,options={}){
 const maxBytes=Math.max(32_768,Math.min(Number(options.maxBytes)||MAX_PDF_BYTES,MAX_PDF_BYTES));
 const resource=await fetchPublicResource(sourceUrl,{
  validateUrl:options.validateUrl,
  fetchImpl:options.fetchImpl,
  timeoutMs:options.timeoutMs,
  maxRedirects:options.maxRedirects,
  maxBytes,
  maxAllowedBytes:MAX_PDF_BYTES,
  contentTypes:['application/pdf','application/octet-stream']
 });
 if(resource.buffer.length<5||resource.buffer.subarray(0,5).toString('ascii')!=='%PDF-')throw new Error('По указанной ссылке не найден корректный PDF-файл.');
 const parsePdf=options.parsePdf||require('pdf-parse');
 const parsed=await parsePdf(resource.buffer,{max:MAX_PDF_PAGES});
 const text=String(parsed?.text||'').replace(/\u0000/g,'').trim();
 if(!text)throw new Error('В PDF нет текстового слоя. Вероятно, это скан: документ сохранён не будет, требуется отдельное OCR-распознавание.');
 const storedText=text.slice(0,MAX_STORED_TEXT);
 const extracted=extractOrderEvidence(storedText);
 const pageCount=Math.max(0,Math.min(Number(parsed?.numpages)||0,MAX_PDF_PAGES));
 const fileName=fileNameFromResponse(resource.contentDisposition||'',resource.url);
 return {
  source_url:resource.url,
  file_name:fileName,
  mime_type:'application/pdf',
  page_count:pageCount,
  text:storedText,
  bytes:resource.bytes,
  sha256:crypto.createHash('sha256').update(resource.buffer).digest('hex'),
  facts:extracted,
  extracted_fact_count:(JSON.parse(extracted.fact_evidence_json||'[]')||[]).length
 };
}
module.exports={fetchAndParseOrderPdf,fileNameFromResponse,MAX_PDF_BYTES,MAX_PDF_PAGES,MAX_STORED_TEXT};
