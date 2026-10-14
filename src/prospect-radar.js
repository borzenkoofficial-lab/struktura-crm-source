(function (root) {
  'use strict';
  const RULES = [
    { key: 'tender', label: 'Тендер / закупка', weight: 32, re: /тендер[\p{L}]*|закупк[\p{L}]*|конкурсн[\p{L}]+ процедур|запрос коммерческ[\p{L}]+ предлож/iu },
    { key: 'contractor', label: 'Ищут подрядчика', weight: 30, re: /ищем подрядчик\w*|требуется подрядчик\w*|приглашаем подрядчик\w*|поиск подрядчик\w*|выбор подрядчик\w*/i },
    { key: 'new-site', label: 'Новый объект / открытие', weight: 22, re: /нов\w+ объект\w*|начало строительств\w*|строительство начн\w*|открыти\w+ (?:нов\w+ )?(?:объект\w*|офис\w*|магазин\w*|бизнес.?центр\w*)|ввод в эксплуатаци\w*/i },
    { key: 'renovation', label: 'Ремонт / реконструкция', weight: 18, re: /реконструкц\w*|капитальн\w+ ремонт\w*|реновац\w*|ремонт офис\w*|отделк\w+ коммерческ\w+ помещени/i },
    { key: 'fit-out', label: 'Коммерческий fit-out', weight: 12, re: /fit.?out|фальшпол\w*|демонтаж офис\w*|коммерческ\w+ недвижим\w*|бизнес.?центр\w*/i }
  ];
  function analyze(prospect = {}) {
    const text = [prospect.company_name, prospect.category, prospect.notes, prospect.source_name, prospect.source_url].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const signals = RULES.filter(rule => rule.re.test(text)).map(rule => ({ key: rule.key, label: rule.label, weight: rule.weight }));
    const hasContact = Boolean(String(prospect.phone || '').trim() || String(prospect.email || '').trim());
    const hasSite = Boolean(String(prospect.website || '').trim());
    const excluded = ['converted', 'rejected'].includes(prospect.status);
    let nextAction = 'Проверить сайт и определить, подходит ли компания';
    if (excluded) nextAction = prospect.status === 'converted' ? 'Уже передана в заявки' : 'Исключена из работы';
    else if (signals.length && !hasContact && hasSite) nextAction = 'Открыть сайт и найти ответственного за закупки';
    else if (signals.length && hasContact && prospect.status === 'new') nextAction = 'Проверить сигнал и подготовить персональный контакт';
    else if (!hasContact && !hasSite) nextAction = 'Найти официальный сайт и публичные контакты';
    else if (prospect.status === 'contacted') nextAction = 'Зафиксировать итог контакта и следующий шаг';
    else if (hasContact && prospect.status === 'reviewed') nextAction = 'Связаться по подходящему каналу, если есть законное основание';
    const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
    return { signals, signalScore: score, hasContact, hasSite, excluded, nextAction, priority: signals.length ? Math.max(...signals.map(s => s.weight)) : 0 };
  }
  function summarize(rows = []) {
    const active = rows.filter(row => !['converted', 'rejected'].includes(row.status));
    const enriched = active.map(row => ({ ...row, radar: analyze(row) }));
    const signalCount = enriched.filter(row => row.radar.signals.length > 0).length;
    const contactCount = enriched.filter(row => row.radar.hasContact).length;
    const missingCount = enriched.filter(row => !row.radar.hasContact && row.radar.hasSite).length;
    const queue = enriched.filter(row => row.radar.signals.length > 0 || row.radar.hasContact || row.radar.hasSite)
      .sort((a, b) => b.radar.signalScore - a.radar.signalScore || (b.radar.hasContact ? 1 : 0) - (a.radar.hasContact ? 1 : 0) || String(a.company_name).localeCompare(String(b.company_name), 'ru'))
      .slice(0, 5);
    return { signalCount, contactCount, missingCount, queue };
  }
  root.StrukturaProspectRadar = { analyze, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = { analyze, summarize };
})(typeof globalThis !== 'undefined' ? globalThis : window);
