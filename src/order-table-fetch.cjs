'use strict';
const crypto=require('node:crypto');
const path=require('node:path');
const {fetchPublicResource}=require('./order-page-fetch.cjs');
const {extractOrderEvidence}=require('./order-evidence.cjs');
const MAX_TABLE_BYTES=12*1024*1024;
const MAX_SHEETS=12;
const MAX_ROWS=5000;
const MAX_COLUMNS=80;
const MAX_TEXT=80_000;
const MIME_TYPES=[
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-excel',
 'text/csv',
 'text/tab-separated-values',
 'text/plain',
 'application/octet-stream'
];

function fileNameFromResponse(disposition,finalUrl){
 const value=String(disposition||'');
 let name='';
 const encoded=value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
 const ordinary=value.match(/filename\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;]+))/i);
 try{
  if(encoded)name=decodeURIComponent(encoded[1].trim());
  else if(ordinary)name=String(ordinary[1]||ordinary[2]||ordinary[3]||'').trim();
 }catch{}
 if(!name){try{name=decodeURIComponent(new URL(finalUrl).pathname.split('/').pop()||'')}catch{}}
 return name.replace(/[\\/\0\r\n]/g,'_').slice(0,240)||'document.xlsx';
}
function normalizeCell(value){
 return String(value??'').replace(/\s+/g,' ').trim().slice(0,500);
}
function rowToText(row){
 const cells=(Array.isArray(row)?row:[]).slice(0,MAX_COLUMNS).map(normalizeCell).filter(Boolean);
 if(!cells.length)return '';
 if(cells.length>=2&&/^(?:заказчик|организатор|бюджет|нмцк|об[ъы]?[её]м|объем|количество|срок|контакт|телефон|email|адрес|номер закупки|предмет закупки)$/iu.test(cells[0]))return cells[0]+': '+cells.slice(1).join(' | ');
 return cells.join(' | ');
}
function parseLocalizedAmount(value){
 let raw=String(value??'').replace(/[\s\u00a0\u202f]/g,'').replace(/[^\d,.-]/g,'');
 if(!raw)return null;
 if(raw.includes(','))raw=raw.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(?:\.\d{3})+$/.test(raw))raw=raw.replace(/\./g,'');
 const parsed=Number(raw);
 return Number.isFinite(parsed)&&parsed>0?Math.round(parsed*1000)/1000:null;
}
const HEADER_PATTERNS={
 work:/наименован|вид\s+работ|перечень\s+работ|операци|позици|предмет|услуг|описан|материал|^работ(?:а|ы)?$|^item$|description|work\s*name/iu,
 quantity:/колич|об[ъы]?[её]м|volume|^qty$|quantity/iu,
 unit:/(?:единиц|ед\.?\s*изм|unit)/iu,
 unitPrice:/(?:цена|стоимость)\s*(?:за|\/)\s*(?:ед|шт|м|unit)|расцен|тариф|unit\s*price|^price$|^rate$/iu,
 amount:/итого|сумм|стоимость\s+всего|^amount$|^total$/iu
};
function detectHeaderIndexes(rows){
 let best=null;
 for(let rowIndex=0;rowIndex<Math.min(rows.length,30);rowIndex++){
  const cells=(rows[rowIndex]||[]).map(normalizeCell);
  const find=pattern=>cells.findIndex(value=>pattern.test(value));
  const map={headerRow:rowIndex,work:find(HEADER_PATTERNS.work),quantity:find(HEADER_PATTERNS.quantity),unit:find(HEADER_PATTERNS.unit),unitPrice:find(HEADER_PATTERNS.unitPrice),amount:find(HEADER_PATTERNS.amount)};
  if(map.work<0||map.quantity<0)continue;
  const score=3+(map.unit>=0?1:0)+(map.unitPrice>=0?1:0)+(map.amount>=0?1:0);
  if(!best||score>best.score)best={...map,score};
 }
 return best;
}
function extractWorkLines(rows,sheetName){
 const header=detectHeaderIndexes(rows);if(!header)return [];
 const lines=[];
 for(let index=header.headerRow+1;index<rows.length&&lines.length<2000;index++){
  const row=rows[index]||[],workName=normalizeCell(row[header.work]),quantity=parseLocalizedAmount(row[header.quantity]);
  if(!workName||quantity===null)continue;
  const unit=header.unit>=0?normalizeCell(row[header.unit]):'';
  const unitPrice=header.unitPrice>=0?parseLocalizedAmount(row[header.unitPrice]):null;
  const amount=header.amount>=0?parseLocalizedAmount(row[header.amount]):null;
  lines.push({sheet_name:String(sheetName||'').slice(0,120),row_number:index+1,work_name:workName.slice(0,240),quantity,unit:unit.slice(0,40),unit_price_rub:unitPrice,amount_rub:amount,source_excerpt:row.slice(0,MAX_COLUMNS).map(normalizeCell).filter(Boolean).join(' | ').slice(0,600)});
 }
 return lines;
}
function workbookToText(workbook){
 const chunks=[],lineItems=[],sheetNames=(workbook.SheetNames||[]).slice(0,MAX_SHEETS);let rowCount=0;
 for(const name of sheetNames){
  const sheet=workbook.Sheets[name];if(!sheet)continue;
  const rows=require('xlsx').utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:false});
  const limited=rows.slice(0,MAX_ROWS);rowCount+=limited.length;
  lineItems.push(...extractWorkLines(limited,name));
  const lines=limited.map(rowToText).filter(Boolean);
  if(lines.length)chunks.push('Лист: '+String(name).slice(0,120)+'\n'+lines.join('\n'));
 }
 return {text:chunks.join('\n\n').slice(0,MAX_TEXT),sheet_count:sheetNames.length,row_count:rowCount,line_items:lineItems.slice(0,2000)};
}
async function fetchAndParseOrderTable(sourceUrl,options={}){
 const maxBytes=Math.max(32_768,Math.min(Number(options.maxBytes)||MAX_TABLE_BYTES,MAX_TABLE_BYTES));
 const resource=await fetchPublicResource(sourceUrl,{
  validateUrl:options.validateUrl,fetchImpl:options.fetchImpl,timeoutMs:options.timeoutMs,maxRedirects:options.maxRedirects,
  maxBytes,maxAllowedBytes:MAX_TABLE_BYTES,contentTypes:MIME_TYPES
 });
 const fileName=fileNameFromResponse(resource.contentDisposition||'',resource.url);
 const ext=path.extname(fileName).toLowerCase();
 const typeByMime={
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
  'application/vnd.ms-excel':'xls',
  'text/csv':'csv',
  'text/tab-separated-values':'tsv',
  'text/plain':'txt'
 };
 const format=ext.slice(1)||typeByMime[resource.contentType]||'';
 if(!['xlsx','xls','csv','tsv','txt'].includes(format))throw new Error('Неподдерживаемый тип табличного документа: '+(format||resource.contentType)+'.');
 let text='',sheetCount=0,rowCount=0,lineItems=[];
 if(format==='txt'){
  text=resource.buffer.toString('utf8').replace(/^\uFEFF/,'').trim().slice(0,MAX_TEXT);
  rowCount=text?text.split(/\r?\n/).length:0;
 }else{
  const XLSX=options.xlsx||require('xlsx');
  let workbook;
  if(format==='xlsx'){
   if(resource.buffer.length<4||resource.buffer.subarray(0,2).toString('ascii')!=='PK')throw new Error('Файл имеет расширение XLSX, но не является ZIP-контейнером Excel.');
   workbook=XLSX.read(resource.buffer,{type:'buffer',cellDates:false,dense:false,sheetRows:MAX_ROWS});
  }else if(format==='xls'){
   const signature=resource.buffer.subarray(0,8);
   if(signature.length<8||!signature.equals(Buffer.from([0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1])))throw new Error('Файл имеет расширение XLS, но не распознан как книга Excel.');
   workbook=XLSX.read(resource.buffer,{type:'buffer',cellDates:false,dense:false,sheetRows:MAX_ROWS});
  }else{
   const csv=resource.buffer.toString('utf8').replace(/^\uFEFF/,'');
   if(!csv.trim())throw new Error('Табличный документ пуст.');
   workbook=XLSX.read(csv,{type:'string',cellDates:false,dense:false,FS:format==='tsv'?'\t':undefined,sheetRows:MAX_ROWS});
  }
  const parsed=workbookToText(workbook);
  text=parsed.text;sheetCount=parsed.sheet_count;rowCount=parsed.row_count;lineItems=parsed.line_items;
 }
 if(!text)throw new Error('В документе не найден текст или строки таблицы.');
 const facts=extractOrderEvidence(text);
 return {
  source_url:resource.url,file_name:fileName,mime_type:resource.contentType,document_type:'table',
  sheet_count:sheetCount,row_count:rowCount,text,bytes:resource.bytes,
  sha256:crypto.createHash('sha256').update(resource.buffer).digest('hex'),
  facts,line_items:lineItems,extracted_fact_count:(JSON.parse(facts.fact_evidence_json||'[]')||[]).length
 };
}
module.exports={fetchAndParseOrderTable,fileNameFromResponse,workbookToText,rowToText,MAX_TABLE_BYTES,MAX_SHEETS,MAX_ROWS,MAX_TEXT};
