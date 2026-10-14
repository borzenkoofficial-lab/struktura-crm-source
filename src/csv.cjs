const FIELD_ALIASES = {
  company_name: ['company_name', 'company', 'name', 'компания', 'название', 'организация', 'название компании'],
  category: ['category', 'категория', 'сфера', 'тип компании'],
  region: ['region', 'город', 'регион', 'город/регион'],
  phone: ['phone', 'телефон', 'номер', 'контактный телефон'],
  email: ['email', 'e-mail', 'почта', 'электронная почта'],
  website: ['website', 'site', 'сайт', 'веб-сайт'],
  source_url: ['source_url', 'url', 'ссылка', 'источник_url', 'ссылка на источник'],
  source_name: ['source_name', 'source', 'источник', 'источник данных'],
  notes: ['notes', 'комментарий', 'заметки', 'описание'],
  service: ['service', 'услуга', 'направление'],
  status: ['status', 'статус']
};

function parseRecords(text, delimiter) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('В CSV есть незакрытая кавычка. Проверь строку с текстом в кавычках.');
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function detectDelimiter(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  let line = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && quoted && input[i + 1] === '"') { i++; continue; }
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === '\n' || ch === '\r')) break;
    if (!quoted) line += ch;
  }
  const counts = [ ';', ',', '\t' ].map(delimiter => ({ delimiter, count: [...line].filter(ch => ch === delimiter).length }));
  counts.sort((a, b) => b.count - a.count);
  if (!counts[0] || counts[0].count === 0) return ';';
  return counts[0].delimiter;
}

function normalizeHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
function parseCsv(text) {
  const rows = parseRecords(text, detectDelimiter(text));
  if (rows.length < 2) return [];
  const headers = rows.shift().map(normalizeHeader);
  const index = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    index[field] = headers.findIndex(header => aliases.map(normalizeHeader).includes(header));
  }
  if (index.company_name < 0) throw new Error('В CSV не найдена колонка с названием компании. Используй company_name или «Компания».');
  return rows.map(cols => Object.fromEntries(Object.entries(index).map(([field, col]) => [field, col < 0 ? '' : String(cols[col] ?? '').trim()])))
    .filter(item => item.company_name);
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
}
function normalizeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|yclid|gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch { return raw.toLowerCase().replace(/\/+$/, ''); }
}
function normalizeCompany(value) {
  return String(value ?? '').toLowerCase().replace(/ё/g, 'е').replace(/["'«»“”]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function prospectDuplicateKeys(item) {
  const keys = [];
  const url = normalizeUrl(item.source_url);
  const phone = normalizePhone(item.phone);
  const email = String(item.email ?? '').trim().toLowerCase();
  const website = normalizeUrl(item.website);
  const company = normalizeCompany(item.company_name);
  const region = normalizeCompany(item.region);
  if (url) keys.push(`url:${url}`);
  if (phone) keys.push(`phone:${phone}`);
  if (email) keys.push(`email:${email}`);
  if (website) keys.push(`website:${website}`);
  if (company) keys.push(`company:${company}|${region}`);
  return [...new Set(keys)];
}

function safeCsvCell(value) {
  const text = String(value ?? '');
  const first = text.trimStart()[0];
  return first && '=+-@'.includes(first) ? "'" + text : text;
}

module.exports = { parseCsv, detectDelimiter, normalizePhone, normalizeUrl, normalizeCompany, prospectDuplicateKeys, safeCsvCell };
