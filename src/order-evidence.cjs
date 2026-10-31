'use strict';

// Conservative extraction of facts explicitly present in a public order notice.
// Every extracted value carries its source excerpt; missing data stays empty/zero.
function parseLocalizedNumber(value) {
  let raw = String(value ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!raw) return 0;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseBudget(text) {
  const patterns = [
    /(?:бюджет(?:а)?(?:\/цена)?|нмцк|начальн\w{0,20}\s+цен\w{0,20}\s+контракт\w*|стоимост\w{0,15}\s+контракт\w*|цен\w{0,15}\s+договор\w*)\s*(?:(?:составляет|равен|равна|до|—|:|-)\s*)?(\d[\d\s\u00a0\u202f]*(?:[,.]\d+)?)\s*(млрд|млн|миллион(?:а|ов)?|тыс\\.?(?:яч[а-я]*)?)?\s*(₽|руб(?:\.|лей|ля)?|р\.)?/iu,
    /(\d[\d\s\u00a0\u202f]*(?:[,.]\d+)?)\s*(млрд|млн|миллион(?:а|ов)?|тыс\\.?(?:яч[а-я]*)?)\s*(₽|руб(?:\.|лей|ля)?|р\.)/iu
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (!match) continue;
    const amount = parseLocalizedNumber(match[1]);
    if (!amount) continue;
    const scale = String(match[2] || '').toLowerCase();
    const multiplier = /млрд/.test(scale) ? 1_000_000_000
      : /млн|миллион/.test(scale) ? 1_000_000
        : /тыс/.test(scale) ? 1_000 : 1;
    const result = Math.round(amount * multiplier);
    const hasCurrency = Boolean(match[3]);
    if (!hasCurrency && !multiplier && result < 1000) continue;
    if (!hasCurrency && !scale && result < 1000) continue;
    if (!Number.isSafeInteger(result) || result > 1_000_000_000_000) continue;
    return { value: result, excerpt: match[0].trim() };
  }
  return null;
}

function parseVolume(text) {
  const match = text.match(/(\d[\d\s\u00a0\u202f]*(?:[,.]\d+)?)\s*(м²|м2|кв\.?\s*м|погонн\w*|п\.?\s*м|тонн\w*|т\.?|шт\.?|ед\.?)/iu);
  if (!match) return null;
  const value = parseLocalizedNumber(match[1]);
  if (!value || value > 1_000_000_000) return null;
  const unitText = match[2].toLowerCase().replace(/\s+/g, '');
  const unit = /^(м²|м2|кв\.?м)$/.test(unitText) ? 'м²'
    : /погонн|^п\.?м$/.test(unitText) ? 'пог. м'
      : /тонн|^т\.?$/.test(unitText) ? 'т'
        : /шт/.test(unitText) ? 'шт.'
          : 'ед.';
  return { value, unit, excerpt: match[0].trim() };
}

function parseDeadline(text) {
  const match = text.match(/(?:до|крайний срок|срок подачи(?: заявок)?|при[её]м заявок(?: до)?|дедлайн|окончание подачи заявок)[^\n.;]{0,45}(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})/iu);
  return match ? { value: match[0].replace(/\s+/g, ' ').trim().slice(0, 160), excerpt: match[0].replace(/\s+/g, ' ').trim().slice(0, 200) } : null;
}

function addEvidence(evidence, field, value, excerpt) {
  if (value !== undefined && value !== null && value !== '' && value !== 0) {
    evidence.push({ field, value, excerpt: String(excerpt || '').slice(0, 200), parser_version: 1 });
  }
}

function extractOrderEvidence(input = '') {
  const text = String(input || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
  const result = {
    customer_name: '',
    contact_name: '',
    phone: '',
    email: '',
    budget_rub: 0,
    volume_value: 0,
    volume_unit: '',
    deadline_text: '',
    procurement_number: '',
    work_address: '',
    fact_evidence_json: '[]'
  };
  const evidence = [];

  const customer = text.match(/(?:заказчик|организатор(?: закупки)?|генеральный заказчик)\s*[:—-]\s*((?:ООО|АО|ПАО|ОАО|ИП|ГБУ|ФГБУ|МБУ|МУП)\s+[^\n,;]{2,120})/iu);
  if (customer) {
    result.customer_name = customer[1].trim().replace(/[.)]+$/, '').slice(0, 180);
    addEvidence(evidence, 'customer_name', result.customer_name, customer[0]);
  }

  const contact = text.match(/(?:контактное лицо|контакт|ответственный за закупк\w*|представитель заказчика)\s*[:—-]\s*([А-ЯЁ][А-ЯЁа-яё-]{1,35}(?:\s+[А-ЯЁ][А-ЯЁа-яё-]{1,35}){1,2})/u);
  if (contact) {
    result.contact_name = contact[1].trim().slice(0, 120);
    addEvidence(evidence, 'contact_name', result.contact_name, contact[0]);
  }

  const email = text.match(/[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/iu);
  if (email) {
    result.email = email[0].toLowerCase().slice(0, 180);
    addEvidence(evidence, 'email', result.email, email[0]);
  }

  const phoneMatches = text.match(/(?:\+7|8)[\s().-]*(?:\d[\s().-]*){9,10}/gu) || [];
  const phone = phoneMatches.find(value => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 11 && /^[78]/.test(digits);
  });
  if (phone) {
    result.phone = phone.replace(/\s+/g, ' ').trim().slice(0, 60);
    addEvidence(evidence, 'phone', result.phone, phone);
  }

  const budget = parseBudget(text);
  if (budget) {
    result.budget_rub = budget.value;
    addEvidence(evidence, 'budget_rub', budget.value, budget.excerpt);
  }

  const volume = parseVolume(text);
  if (volume) {
    result.volume_value = volume.value;
    result.volume_unit = volume.unit;
    addEvidence(evidence, 'volume_value', volume.value, volume.excerpt);
  }

  const deadline = parseDeadline(text);
  if (deadline) {
    result.deadline_text = deadline.value;
    addEvidence(evidence, 'deadline_text', deadline.value, deadline.excerpt);
  }

  const procurement = text.match(/(?:номер закупки|номер извещения|извещение|реестровый номер|икз)\s*[:№#]?\s*(\d{10,25})/iu);
  if (procurement) {
    result.procurement_number = procurement[1].slice(0, 40);
    addEvidence(evidence, 'procurement_number', result.procurement_number, procurement[0]);
  }

  const address = text.match(/(?:адрес объекта|место выполнения работ|место поставки)\s*[:—-]\s*([^;\n]{5,250})/iu);
  if (address) {
    result.work_address = address[1].trim().slice(0, 250);
    addEvidence(evidence, 'work_address', result.work_address, address[0]);
  }

  result.fact_evidence_json = JSON.stringify(evidence);
  return result;
}

module.exports = { extractOrderEvidence, parseLocalizedNumber, parseBudget, parseVolume, parseDeadline };
