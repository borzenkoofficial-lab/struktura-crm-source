'use strict';

const SERVICE_ALIASES = {
  demolition: 'demolition', demo: 'demolition', 'демонтаж': 'demolition',
  finishing: 'finishing', renovation: 'finishing', 'отделка': 'finishing', 'ремонт': 'finishing',
  raised_floor: 'raised_floor', raisedfloor: 'raised_floor', 'фальшпол': 'raised_floor', 'фальшполы': 'raised_floor'
};
const ALIASES = {
  title: ['title','name','order','order_title','название','заказ','название заказа','предмет закупки','предмет','объект','наименование'],
  source_url: ['source_url','url','link','ссылка','ссылка на источник','ссылка на заказ','url источника','источник url'],
  snippet: ['snippet','description','summary','notes','описание','фрагмент','условия','комментарий'],
  service: ['service','work_type','услуга','вид работ','направление'],
  region: ['region','location','регион','город','место выполнения'],
  source_name: ['source_name','source','источник','площадка'],
  budget: ['budget','budget_rub','price','contract_price','бюджет','цена','стоимость','нмцк'],
  volume: ['volume','quantity','объём','объем','количество'],
  deadline: ['deadline','due_date','срок','срок подачи','дедлайн']
};
function normalizeHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
function detectDelimiter(line) {
  const options = [';', ',', '\t'];
  let quoted = false, counts = new Map(options.map(ch => [ch, 0]));
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch) + 1);
  }
  return options.sort((a,b) => counts.get(b)-counts.get(a))[0] || ';';
}
function parseRows(text, delimiter) {
  const rows=[]; let row=[], cell='', quoted=false;
  const input=String(text ?? '').replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){
      if(ch==='"'&&input[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
    }else if(ch==='"'&&cell.length===0)quoted=true;
    else if(ch===delimiter){row.push(cell.trim());cell='';}
    else if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&input[i+1]==='\n')i++;
      row.push(cell.trim());cell='';
      if(row.some(v=>v!==''))rows.push(row);
      row=[];
    }else cell+=ch;
  }
  if(quoted)throw new Error('В CSV есть незакрытая кавычка.');
  row.push(cell.trim());if(row.some(v=>v!==''))rows.push(row);
  return rows;
}
function normalizeService(value) {
  const raw=String(value ?? '').trim().toLowerCase().replace(/ё/g,'е');
  if(SERVICE_ALIASES[raw])return SERVICE_ALIASES[raw];
  if(/фальш|raised/.test(raw))return 'raised_floor';
  if(/отдел|ремонт|finishing|renovat/.test(raw))return 'finishing';
  return 'demolition';
}
function parseCommercialOrdersCsv(text) {
  const firstLine=String(text ?? '').replace(/^\uFEFF/,'').split(/\r?\n/,1)[0] || '';
  const rows=parseRows(text,detectDelimiter(firstLine));
  if(rows.length<2)throw new Error('В файле нет строк для импорта. Нужны заголовки и хотя бы одна строка.');
  const headers=rows.shift().map(normalizeHeader);
  const indexes={};
  for(const [field,aliases] of Object.entries(ALIASES))indexes[field]=headers.findIndex(header=>aliases.map(normalizeHeader).includes(header));
  if(indexes.title<0)throw new Error('Не найдена колонка с названием заказа. Используй «Название», title или «Предмет закупки».');
  if(indexes.source_url<0)throw new Error('Не найдена колонка со ссылкой на первоисточник. Используй «Ссылка» или source_url.');
  const result=[];let skipped=0;
  for(const cols of rows){
    const row=Object.fromEntries(Object.entries(indexes).map(([key,index])=>[key,index<0?'':String(cols[index]??'').trim()]));
    if(!row.title||!/^https?:\/\//i.test(row.source_url)){skipped++;continue;}
    const details=[row.snippet,row.budget?'Бюджет/цена: '+row.budget:'',row.volume?'Объём: '+row.volume:'',row.deadline?'Срок: '+row.deadline:''].filter(Boolean).join(' · ').slice(0,1200);
    result.push({
      title:row.title.slice(0,240),source_url:row.source_url.slice(0,700),snippet:details,
      service:normalizeService(row.service),region:(row.region||'Москва и Московская область').slice(0,120),
      source_name:(row.source_name||'').slice(0,120)
    });
  }
  return {orders:result,skipped};
}
module.exports={parseCommercialOrdersCsv,normalizeService};
