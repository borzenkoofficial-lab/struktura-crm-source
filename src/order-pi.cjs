'use strict';

// Transparent triage for commercial orders. This is not a profitability or win-probability forecast:
// missing commercial terms are scored as unknown and surfaced as follow-up questions.
const SERVICE_TERMS = {
  demolition: /демонтаж|демонтир|разборк|снос/iu,
  finishing: /отделк|ремонт|fit.?out|реконструкц/iu,
  raised_floor: /фальшпол|поднят.{0,8}пол|двойн.{0,8}пол|техническ.{0,8}пол/iu
};
const INTENT_TERMS = /тендер|закупк|ищ.{0,12}подрядчик|требуется подрядчик|запрос предложен|приглашаем подрядчик|коммерческ.{0,12}предлож/iu;
const DEADLINE_TERMS = /до \d{1,2}[.\-/]\d{1,2}|срок подачи|приём заявок|прием заявок|дедлайн|начало работ|срок выполнен/iu;
const BUDGET_TERMS = /(?:бюджет|нмцк|начальн.{0,20}цен|стоимость|цена контракта|цена договора)[^\n]{0,50}\d[\d\s.,]*(?:₽|руб|тыс|млн)?/iu;
const VOLUME_TERMS = /\d[\d\s.,]*\s*(?:м²|м2|кв\.?\s*м|погонн|тонн|шт\.?)/iu;

function assessCommercialOrder(order = {}, analysis = null) {
  const title = String(order.title || '').trim();
  const snippet = String(order.snippet || '').trim();
  const text = title + ' ' + snippet;
  const service = Object.hasOwn(SERVICE_TERMS, order.service) ? order.service : 'demolition';
  const fitEvidence = SERVICE_TERMS[service].test(text);
  const intentEvidence = INTENT_TERMS.test(text) || Number(order.signal_score) >= 30;
  const hasDeadline = DEADLINE_TERMS.test(text);
  const analysisRevenue = Number(analysis?.revenue_rub);
  const analysisMargin = Number(analysis?.estimated_margin_pct);
  const analysisDays = Number(analysis?.estimated_days);
  const hasAnalysis = Boolean(analysis && Number.isFinite(analysisRevenue) && analysisRevenue > 0 && Number.isFinite(analysisMargin) && Number.isFinite(analysisDays) && analysisDays > 0);
  const hasBudget = BUDGET_TERMS.test(text) || Boolean(hasAnalysis && Number(analysis?.budget_rub) > 0);
  const hasVolume = VOLUME_TERMS.test(text) || Boolean(hasAnalysis && Number(analysis?.quantity) > 0);
  const hasOriginalSource = /^https?:\/\//i.test(String(order.source_url || ''));
  const hasDescription = snippet.length >= 80;

  const fit = fitEvidence ? 100 : 20;
  const intent = intentEvidence ? 90 : 25;
  const economics = hasAnalysis
    ? analysisMargin <= 0 ? 0 : analysisMargin < 10 ? 25 : analysisMargin < 20 ? 50 : analysisMargin < 30 ? 75 : 90
    : hasBudget && hasVolume ? 80 : hasBudget || hasVolume ? 45 : null;
  const timing = hasDeadline ? 85 : hasAnalysis ? (analysisDays <= 3 ? 80 : analysisDays <= 7 ? 65 : analysisDays <= 14 ? 50 : 35) : null;
  const sourceQuality = hasOriginalSource && hasDescription ? 90 : hasOriginalSource || title ? 55 : 10;

  const components = [
    { key: 'fit', label: 'Соответствие работ', weight: 25, value: fit },
    { key: 'economics', label: 'Экономика', weight: 30, value: economics },
    { key: 'timing', label: 'Сроки', weight: 15, value: timing },
    { key: 'winLikelihood', label: 'Сигналы закупки', weight: 20, value: intent },
    { key: 'sourceQuality', label: 'Полнота источника', weight: 10, value: sourceQuality }
  ];
  // Unknown inputs contribute zero to the provisional score instead of being silently imputed.
  const score = Math.round(components.reduce((sum, item) => sum + item.weight * (item.value ?? 0) / 100, 0));
  const known = components.filter(item => item.value !== null).length;
  const missing = [];
  if (!hasBudget) missing.push('Уточнить бюджет или цену договора');
  if (!hasVolume) missing.push('Уточнить объём и единицы измерения');
  if (!hasDeadline) missing.push('Уточнить сроки подачи предложения и выполнения работ');
  if (!hasOriginalSource) missing.push('Добавить ссылку на первоисточник');
  if (!hasDescription) missing.push('Проверить условия на первоисточнике');

  const reasons = [];
  if (fitEvidence) reasons.push('Найден сигнал нужного вида работ');
  if (intentEvidence) reasons.push('Есть сигналы закупки или поиска подрядчика');
  if (hasBudget) reasons.push('Бюджет/выручка указаны в источнике или расчёте — проверь подтверждение');
  if (hasVolume) reasons.push('В тексте найден объём работ — требуется проверка');
  if (hasDeadline) reasons.push('В тексте найден сигнал срока — требуется проверка');
  if (hasAnalysis) reasons.push('Расчётная маржа: ' + Math.round(analysisMargin * 10) / 10 + '%; ориентировочно ' + Math.round(analysisDays * 10) / 10 + ' смен — результат зависит от введённых ставок и условий.');
  if (!fitEvidence) reasons.push('Вид работ не подтверждён текстом результата');

  return {
    version: 1,
    score,
    label: score >= 65 ? 'Проверить в первую очередь' : score >= 40 ? 'Нужно уточнить' : 'Недостаточно подтверждений',
    confidence: known >= 4 ? 'средняя' : 'низкая',
    knownFactors: known,
    totalFactors: components.length,
    economicsStatus: hasAnalysis ? 'calculated_preliminary' : economics === null ? 'unknown' : 'needs_verification',
    deadlineStatus: hasDeadline ? 'mentioned_unverified' : hasAnalysis ? 'production_duration_estimated' : 'unknown',
    winProbabilityStatus: 'not_calculated',
    components,
    reasons,
    nextQuestions: missing.slice(0, 5),
    disclaimer: 'Предварительная сортировка по текстовым сигналам. Не является прогнозом прибыли, срока или вероятности выигрыша.'
  };
}

module.exports = { assessCommercialOrder };
