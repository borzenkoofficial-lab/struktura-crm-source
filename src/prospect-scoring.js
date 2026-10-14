(function (root) {
  'use strict';
  function evaluate(p = {}) {
    const score = { value: 0, reasons: [] };
    const add = (points, reason) => { score.value += points; score.reasons.push(reason); };
    const text = `${p.company_name || ''} ${p.category || ''} ${p.notes || ''}`.toLowerCase();
    const service = p.service || 'demolition';
    const contacts = Number(Boolean(p.phone)) + Number(Boolean(p.email));
    if (p.phone) add(12, 'Есть телефон');
    if (p.email) add(10, 'Есть email');
    if (p.website) add(8, 'Есть сайт');
    if (p.source_url) add(5, 'Есть ссылка на источник');
    if (p.region && /москв|московск/i.test(p.region)) add(10, 'Целевой регион');
    if (/генподряд|генеральн.{0,12}подряд|строительн.{0,12}компан|подрядчик|девелопер/i.test(text)) add(12, 'Подрядчик или девелопер');
    if (/бизнес.?центр|торгов.{0,12}центр|коммерческ.{0,12}недвижим|офисн.{0,12}центр|складск.{0,12}комплекс/i.test(text)) add(10, 'Коммерческий объект');
    if (/демонтаж|реновац|капитальн.{0,12}ремонт|реконструкц/i.test(text) && service === 'demolition') add(8, 'Упоминание демонтажа или реконструкции');
    if (/отделк|fit.?out|ремонт офис|интерьерн.{0,12}работ/i.test(text) && service === 'finishing') add(8, 'Упоминание отделки или fit-out');
    if (/фальшпол|поднят.{0,8}пол|серверн.{0,12}комнат|дата.?центр/i.test(text) && service === 'raised_floor') add(8, 'Упоминание фальшпола или серверной');
    if (/тендер|ищем подрядчик|требуется подрядчик|начало строительств|строительство начн|новый объект|открытие объекта|запрос коммерческ.{0,12}предлож/i.test(text)) add(15, 'Возможный сигнал закупки/нового объекта');
    if (p.status === 'reviewed') add(5, 'Карточка проверена');
    score.value = Math.min(100, score.value);
    if (!contacts) score.reasons.push('Контакт не найден');
    return { score: score.value, reasons: score.reasons };
  }
  root.StrukturaProspectScoring = { evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = { evaluate };
})(typeof globalThis !== 'undefined' ? globalThis : window);
