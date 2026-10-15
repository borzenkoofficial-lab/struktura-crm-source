'use strict';

function validIso(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}
function ageDays(value, today) {
  const date = validIso(String(value || '').slice(0, 10));
  if (!date) return null;
  return Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000);
}
function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function rub(value) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(money(value));
}
function buildPiCoachInsights(data = {}, options = {}) {
  const today = validIso(options.today) || new Date().toISOString().slice(0, 10);
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const leads = Array.isArray(data.leads) ? data.leads : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const production = data.production || {};
  const finance = data.finance || {};
  const history = Array.isArray(production.history) ? production.history : [];
  const insights = [];
  const add = (id, severity, priority, title, spoken, detail, view, actionLabel) => {
    if (insights.some(item => item.id === id)) return;
    insights.push({ id, severity, priority, title, spoken, detail, view, actionLabel: actionLabel || 'Разобрать' });
  };

  for (const risk of (Array.isArray(finance.risks) ? finance.risks : [])) {
    const ratio = Number(risk.costRatio);
    if (!Number.isFinite(ratio) || !risk.id) continue;
    if (risk.level === 'over' || ratio >= 1) {
      add('finance-overrun-' + risk.id, 'danger', 100, 'Риск перерасхода: ' + (risk.title || 'объект'),
        'Важный финансовый сигнал. По объекту «' + (risk.title || 'без названия') + '» учтённые и запланированные расходы достигли или превысили сумму договора. Проверь остаток работ, расходы и необходимость пересмотра условий.',
        'Договор: ' + rub(risk.contractRub) + '. Оплаченные расходы: ' + rub(risk.paidExpensesRub) + '. Запланированные расходы: ' + rub(risk.plannedExpensesRub) + '. Расходы составляют ' + Math.round(ratio * 100) + '% договора. Это оценка по внесённым данным, не бухгалтерская сверка.',
        'finance', 'Открыть финансы');
    } else if (risk.level === 'warning' || ratio >= 0.8) {
      add('finance-margin-' + risk.id, 'warning', 82, 'Запас по расходам сокращается: ' + (risk.title || 'объект'),
        'Обрати внимание на экономику объекта «' + (risk.title || 'без названия') + '». Учтённые и запланированные расходы уже составляют около ' + Math.round(ratio * 100) + ' процентов договора. Перед дополнительными работами проверь остаток бюджета.',
        'Договор: ' + rub(risk.contractRub) + '. Учтённые и запланированные расходы: ' + rub(money(risk.paidExpensesRub) + money(risk.plannedExpensesRub)) + '. Сверь фактические расходы и оставшийся объём работ.',
        'finance', 'Проверить экономику');
    }
  }

  if (money(finance.overdueExpensesTotal) > 0 || Number(finance.overdueExpensesCount) > 0) {
    add('finance-overdue-expenses', 'warning', 94, 'Есть просроченные расходы',
      'В финансовом учёте есть просроченные неоплаченные расходы. Проверь сроки и приоритет платежей, чтобы не потерять контроль над денежным потоком.',
      'По данным финансового прогноза просрочено расходов на ' + rub(finance.overdueExpensesTotal) + '. Количество записей: ' + (Number(finance.overdueExpensesCount) || 0) + '.',
      'finance', 'Разобрать платежи');
  }
  if (money(finance.unscheduledReceivablesTotal) > 0) {
    add('finance-unscheduled-receivables', 'warning', 76, 'Деньги по договорам без даты поступления',
      'Есть остатки по договорам, для которых не указана дата окончания объекта. Поэтому я не могу надёжно включить эти деньги в календарный прогноз. Укажи сроки и договорись с заказчиком о графике оплат.',
      'Сумма остатков без даты в прогнозе: ' + rub(finance.unscheduledReceivablesTotal) + '. Не считаю её гарантированным поступлением.',
      'projects', 'Проверить объекты');
  }

  for (const project of projects) {
    if (project.status === 'cancelled' || project.status === 'completed') continue;
    const title = String(project.title || ('Объект ' + (project.id ?? ''))).trim();
    const id = project.id;
    const contract = money(project.contract_rub);
    const received = money(project.received_rub);
    if (contract > 0 && received < contract && !validIso(String(project.end_date || '').slice(0, 10))) {
      add('project-payment-date-' + id, 'info', 48, 'Нужно уточнить срок оплаты: ' + title,
        'По объекту «' + title + '» остаётся непогашенная часть договора, но срок окончания не указан. Добавь дату и зафиксируй следующий шаг по оплате, чтобы прогноз не строился на догадках.',
        'Сумма договора: ' + rub(contract) + '. Учтено поступлений: ' + rub(received) + '. Остаток по договору: ' + rub(Math.max(0, contract - received)) + '. Дата окончания не заполнена.',
        'projects', 'Открыть объект');
    }
  }

  const activeProjects = Array.isArray(production.projects) ? production.projects : [];
  for (const project of activeProjects) {
    const title = String(project.title || ('Объект ' + (project.id ?? ''))).trim();
    if (Number(project.planCount) <= 0) {
      add('production-no-plan-' + project.id, 'warning', 86, 'Нет производственного плана: ' + title,
        'По объекту «' + title + '» нет производственного плана. Я не буду угадывать срок завершения. Добавь виды работ, объёмы и состав бригады — тогда смогу сопоставлять план с фактом.',
        'Для прогноза нужны плановые объёмы и отчёты смен. Пока точный прогноз срока не обоснован.',
        'production', 'Составить план');
    }
    const age = ageDays(project.lastShiftDate, today);
    if (Number(project.shiftCount) > 0 && age !== null && age >= 7) {
      add('production-stale-' + project.id, 'warning', 73, 'Давно не обновлялись смены: ' + title,
        'По объекту «' + title + '» последний отчёт смены внесён ' + age + ' дней назад. Если работы продолжаются, внеси свежий отчёт. Иначе прогноз производительности и сроков будет устаревать.',
        'Последний отчёт: ' + project.lastShiftDate + '. Прошло дней: ' + age + '.',
        'production', 'Открыть производство');
    }
    for (const line of (Array.isArray(project.forecast?.lines) ? project.forecast.lines : [])) {
      if (!line?.overPlan) continue;
      const work = String(line.name || 'Работа без названия');
      add('production-overplan-' + project.id + '-' + work.toLocaleLowerCase('ru-RU'), 'warning', 90, 'План превышен: ' + title,
        'На объекте «' + title + '» по работе «' + work + '» фактический объём вышел за план. Проверь исходный объём, дополнительные работы и согласование с заказчиком до того, как обещать новый срок или цену.',
        'Работа: ' + work + '. Есть признак превышения планового объёма. Сверь смету, факт и дополнительные соглашения.',
        'production', 'Сверить план и факт');
    }
  }

  const downtime = history.filter(shift => {
    const hours = Number(shift.shift_hours), idle = Number(shift.downtime_hours);
    return Number.isFinite(hours) && hours > 0 && Number.isFinite(idle) && idle >= 1 && idle / hours >= 0.25;
  }).sort((a, b) => Number(b.downtime_hours) / Math.max(1, Number(b.shift_hours)) - Number(a.downtime_hours) / Math.max(1, Number(a.shift_hours)));
  if (downtime.length) {
    const shift = downtime[0];
    const pct = Math.round(Number(shift.downtime_hours) / Number(shift.shift_hours) * 100);
    add('production-downtime-' + shift.id, pct >= 50 ? 'danger' : 'warning', pct >= 50 ? 96 : 84, 'Большой простой на объекте',
      'В отчёте смены от ' + (shift.shift_date || 'без даты') + ' простой занял ' + pct + ' процентов рабочего времени. Найди и зафиксируй причину: ожидание допуска, вывоз, инструмент, отсутствие фронта работ или другая проблема. Сравни со следующей сменой.',
      'Объект: ' + (shift.project_title || 'не указан') + '. Простой: ' + Number(shift.downtime_hours) + ' ч из ' + Number(shift.shift_hours) + ' ч. Это сигнал из конкретного отчёта смены.',
      'production', 'Разобрать смену');
  }

  // Cross-check downtime, measured output and project-level financial risk for the same shift.
  // This is a correlation to investigate, not proof that downtime caused a cost overrun.
  const financeRisks = Array.isArray(finance.risks) ? finance.risks : [];
  for (const shift of history) {
    const shiftHours = Number(shift.shift_hours);
    const idleHours = Number(shift.downtime_hours);
    if (!Number.isFinite(shiftHours) || shiftHours <= 0 || !Number.isFinite(idleHours) || idleHours / shiftHours < 0.25) continue;
    const performanceRows = (Array.isArray(shift.performance) ? shift.performance : [])
      .map(row => ({ name: String(row.work_name || 'Работа без названия').trim(), deviation: Number(row.deviationPct) }))
      .filter(row => Number.isFinite(row.deviation));
    if (!performanceRows.length) continue;
    const averageDeviation = performanceRows.reduce((sum, row) => sum + row.deviation, 0) / performanceRows.length;
    if (averageDeviation > -15) continue;
    const projectTitle = String(shift.project_title || '').trim();
    const projectKey = projectTitle.toLocaleLowerCase('ru-RU');
    const risk = projectKey ? financeRisks.find(item => String(item.title || '').trim().toLocaleLowerCase('ru-RU') === projectKey && Number.isFinite(Number(item.costRatio)) && Number(item.costRatio) >= 0.8) : null;
    const downtimePct = Math.round(idleHours / shiftHours * 100);
    const outputPct = Math.round(averageDeviation);
    const riskText = risk ? ' Финансовая связь для проверки: по объекту в финансовом анализе расходы составляют ' + Math.round(Number(risk.costRatio) * 100) + '% договора. Совпадение по названию объекта не доказывает причинную связь.' : '';
    add('production-cost-correlation-' + shift.id, risk ? 'danger' : 'warning', risk ? 97 : 91,
      risk ? 'Простой и отставание совпали с финансовым риском' : 'Простой совпал с низкой выработкой',
      'В смене от ' + (shift.shift_date || 'без даты') + ' простой составил ' + downtimePct + '% времени, а среднее отклонение зафиксированных работ — ' + outputPct + '% от плана. Проверь причину простоя и сопоставимость объёма работ.' + (risk ? ' Также проверь запас по расходам объекта.' : ''),
      'Объект: ' + (projectTitle || 'не указан') + '. Простой: ' + idleHours + ' ч из ' + shiftHours + ' ч. Работы в отчёте: ' + performanceRows.map(row => row.name + ' (' + Math.round(row.deviation) + '%)').join('; ') + '.' + riskText + ' Это сигнал для проверки, а не доказательство, что простой вызвал отставание или перерасход.',
      risk ? 'finance' : 'production', risk ? 'Проверить экономику' : 'Разобрать смену');
  }

  const lowByWork = new Map();
  for (const shift of history) {
    for (const row of (Array.isArray(shift.performance) ? shift.performance : [])) {
      const deviation = Number(row.deviationPct);
      const name = String(row.work_name || 'Работа без названия').trim();
      if (!Number.isFinite(deviation) || deviation > -20) continue;
      const key = name.toLocaleLowerCase('ru-RU');
      if (!lowByWork.has(key)) lowByWork.set(key, { name, rows: [] });
      lowByWork.get(key).rows.push({ deviation, date: shift.shift_date, project: shift.project_title });
    }
  }
  for (const group of lowByWork.values()) {
    if (group.rows.length < 2) continue;
    const recent = group.rows.slice(0, 3);
    const average = Math.round(recent.reduce((sum, row) => sum + row.deviation, 0) / recent.length);
    add('production-repeat-low-' + group.name.toLocaleLowerCase('ru-RU'), 'warning', 80, 'Повторяется отставание по работе: ' + group.name,
      'Я вижу как минимум два отчёта, где выработка по работе «' + group.name + '» ниже нормы на двадцать процентов или больше. Не делаю вывод о виноватых: сначала сравни условия, состав бригады, простой, единицы измерения и сложность объекта.',
      'Наблюдений с отклонением от −20%: ' + group.rows.length + '. Среднее по последним ' + recent.length + ' подходящим наблюдениям: ' + average + '%. Примеры: ' + recent.map(row => (row.date || 'без даты') + (row.project ? ' · ' + row.project : '') + ' (' + Math.round(row.deviation) + '%)').join('; ') + '.',
      'production', 'Сравнить смены');
  }

  // Learn from the direction of production performance, not just isolated low results.
  // Compare two recent observations with the two immediately preceding observations for the same work.
  const trendByWork = new Map();
  for (const shift of history) {
    const date = validIso(String(shift.shift_date || '').slice(0, 10));
    for (const row of (Array.isArray(shift.performance) ? shift.performance : [])) {
      const deviation = Number(row.deviationPct);
      const name = String(row.work_name || '').trim();
      if (!date || !name || !Number.isFinite(deviation)) continue;
      const key = name.toLocaleLowerCase('ru-RU');
      if (!trendByWork.has(key)) trendByWork.set(key, { name, rows: [] });
      trendByWork.get(key).rows.push({ date, deviation, project: shift.project_title || '' });
    }
  }
  for (const group of trendByWork.values()) {
    const rows = group.rows.sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 4) continue;
    const previous = rows.slice(-4, -2);
    const recent = rows.slice(-2);
    const previousAverage = previous.reduce((sum, row) => sum + row.deviation, 0) / previous.length;
    const recentAverage = recent.reduce((sum, row) => sum + row.deviation, 0) / recent.length;
    const change = recentAverage - previousAverage;
    const title = group.name;
    if (recentAverage <= -15 && change <= -15) {
      add('production-trend-worsening-' + title.toLocaleLowerCase('ru-RU'), 'warning', 89,
        'Выработка ухудшается: ' + title,
        'По работе «' + title + '» последние два подходящих наблюдения заметно хуже предыдущих двух. Это ещё не объясняет причину: сравни условия объекта, состав бригады, простои, способ замера и объём работ, прежде чем менять норматив или цену.',
        'Предыдущие два наблюдения: в среднем ' + Math.round(previousAverage) + '% к плану. Последние два: ' + Math.round(recentAverage) + '% к плану. Изменение: ' + Math.round(change) + ' процентных пунктов. Последние даты: ' + recent.map(row => row.date + (row.project ? ' · ' + row.project : '')).join('; ') + '. Вывод основан на четырёх сохранённых наблюдениях по названию работы; условия объектов могут различаться.',
        'production', 'Сравнить условия');
    } else if (previousAverage <= -20 && change >= 15 && recentAverage > previousAverage) {
      add('production-trend-improving-' + title.toLocaleLowerCase('ru-RU'), 'info', 61,
        'Есть улучшение выработки: ' + title,
        'По работе «' + title + '» последние два наблюдения лучше предыдущих двух. Проверь, какие условия изменились, и не переноси результат на другие объекты без сравнения сложности и состава бригады.',
        'Предыдущие два наблюдения: в среднем ' + Math.round(previousAverage) + '% к плану. Последние два: ' + Math.round(recentAverage) + '% к плану. Изменение: +' + Math.round(change) + ' процентных пунктов. Последние даты: ' + recent.map(row => row.date + (row.project ? ' · ' + row.project : '')).join('; ') + '. Это тенденция в сохранённых данных, а не доказательство причины улучшения.',
        'production', 'Изучить улучшение');
    }
  }

  const overdueTasks = tasks.filter(task => !Number(task.is_done) && (task.urgency === 'overdue' || (validIso(String(task.due_at || '').slice(0, 10)) && ageDays(String(task.due_at).slice(0, 10), today) > 0)));
  if (overdueTasks.length) {
    const task = overdueTasks[0];
    add('tasks-overdue-' + task.id, 'warning', 88, 'Просрочено дело: ' + (task.title || 'задача'),
      'Есть просроченная задача: «' + (task.title || 'без названия') + '». Проверь, остаётся ли она актуальной, и назначь следующий конкретный шаг. Просроченные обещания клиентам часто обходятся дороже, чем кажется.',
      'Задач с просроченным сроком: ' + overdueTasks.length + '. Ближайшая к разбору: ' + (task.title || 'без названия') + (task.due_at ? ', срок ' + String(task.due_at).slice(0, 10) : '') + '.',
      'tasks', 'Открыть задачи');
  }

  const staleLeads = leads.filter(lead => !['won', 'lost'].includes(lead.status) && ageDays(String(lead.updated_at || lead.created_at || '').slice(0, 10), today) >= 5)
    .sort((a, b) => String(a.updated_at || a.created_at).localeCompare(String(b.updated_at || b.created_at)));
  if (staleLeads.length) {
    const lead = staleLeads[0];
    const age = ageDays(String(lead.updated_at || lead.created_at).slice(0, 10), today);
    add('lead-follow-up-' + lead.id, 'info', 64, 'Вернись к заявке: ' + (lead.title || 'без названия'),
      'Заявка «' + (lead.title || 'без названия') + '» не обновлялась ' + age + ' дней. Если заказ ещё актуален, свяжись с клиентом и зафиксируй следующий шаг. Если нет — закрой её корректным статусом, чтобы воронка не обманывала.',
      'Статус: ' + (lead.status || 'не указан') + '. Источник: ' + (lead.source || 'не указан') + '. Бюджет из карточки: ' + rub(lead.budget_rub) + '. Последнее обновление: ' + String(lead.updated_at || lead.created_at).slice(0, 10) + '.',
      'leads', 'Открыть заявку');
  }

  const promisingOrders = orders.filter(order => !['rejected'].includes(order.status) && !Number(order.converted_to_lead) && (Number(order.signal_score) >= 65 || order.pi_assessment?.priority === 'high'))
    .sort((a, b) => Number(b.signal_score || 0) - Number(a.signal_score || 0));
  if (promisingOrders.length) {
    const order = promisingOrders[0];
    add('order-opportunity-' + order.id, 'opportunity', 70, 'Стоит проверить заказ: ' + (order.title || 'без названия'),
      'В базе найден коммерческий заказ с высоким сигналом ПИ. Проверь первоисточник, срок подачи и требования до оценки цены. Я не считаю его выигранной сделкой и не предполагаю бюджет, если он не указан.',
      'Заказ: ' + (order.title || 'без названия') + '. Источник: ' + (order.source_name || order.source_type || 'не указан') + '. Оценка сигнала: ' + (Number.isFinite(Number(order.signal_score)) ? Number(order.signal_score) + ' из 100' : 'не рассчитана') + '. ' + String(order.pi_assessment?.summary || order.snippet || 'Проверь первоисточник и условия.') .slice(0, 350),
      'browser', 'Проверить заказ');
  }

  const payments = Array.isArray(data.payments) ? data.payments : [];
  const incoming = payments.filter(row => row.payment_type !== 'refund').reduce((sum, row) => sum + money(row.amount_rub), 0);
  const refunds = payments.filter(row => row.payment_type === 'refund').reduce((sum, row) => sum + money(row.amount_rub), 0);
  if (incoming > 0 && refunds >= 10000 && refunds / incoming >= 0.1) {
    add('finance-refund-pattern', 'warning', 78, 'Возвраты заметно влияют на поступления',
      'В истории платежей возвраты составляют не менее десяти процентов от входящих платежей и превышают десять тысяч рублей. Проверь причины возвратов, привязку к объектам и не повторяется ли одна и та же проблема в договорённостях или качестве работ.',
      'Входящие платежи: ' + rub(incoming) + '. Возвраты: ' + rub(refunds) + '. Доля возвратов от входящих платежей: ' + (refunds / incoming * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%. Суммы рассчитаны по сохранённым платежам.',
      'finance', 'Проверить платежи');
  }

  const expenses = Array.isArray(data.expenses) ? data.expenses : [];
  const currentStart = new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10);
  const previousStart = new Date(Date.parse(today + 'T00:00:00Z') - 59 * 86400000).toISOString().slice(0, 10);
  const datedExpenses = expenses.map(row => ({ ...row, _date: validIso(String(row.expense_date || '').slice(0, 10)), _amount: money(row.amount_rub) })).filter(row => row._date);
  const currentExpenses = datedExpenses.filter(row => row._date >= currentStart && row._date <= today);
  const previousExpenses = datedExpenses.filter(row => row._date >= previousStart && row._date < currentStart);
  const currentExpenseTotal = currentExpenses.reduce((sum, row) => sum + row._amount, 0);
  const previousExpenseTotal = previousExpenses.reduce((sum, row) => sum + row._amount, 0);
  if (currentExpenses.length >= 3 && previousExpenses.length >= 3 && previousExpenseTotal >= 10000 && currentExpenseTotal >= previousExpenseTotal * 1.4 && currentExpenseTotal - previousExpenseTotal >= 10000) {
    add('finance-expense-growth', 'warning', 83, 'Расходы выросли относительно предыдущего периода',
      'За последние тридцать дней расходы заметно выше предыдущих тридцати дней. Сначала проверь, не объясняется ли это новым объектом, закупкой или разовым платежом. Если роста нельзя объяснить, разберись по категориям и объектам.',
      'Последние 30 дней (' + currentStart + ' — ' + today + '): ' + rub(currentExpenseTotal) + ' по ' + currentExpenses.length + ' записям. Предыдущие 30 дней (' + previousStart + ' — ' + new Date(Date.parse(currentStart + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) + '): ' + rub(previousExpenseTotal) + ' по ' + previousExpenses.length + ' записям. Изменение: +' + Math.round((currentExpenseTotal / previousExpenseTotal - 1) * 100) + '%.',
      'finance', 'Сравнить расходы');
  }

  const quotes = (Array.isArray(data.quotes) ? data.quotes : []).slice().sort((a, b) => String(b.prepared_at || '').localeCompare(String(a.prepared_at || '')));
  const lowMarginQuotes = quotes.filter(quote => Number(quote.revenue_rub) > 0 && Number.isFinite(Number(quote.margin_pct)) && Number(quote.margin_pct) < 10);
  const lossQuotes = quotes.filter(quote => Number(quote.profit_rub) < 0);
  if (lossQuotes.length) {
    const quote = lossQuotes[0];
    add('quote-loss-' + quote.id, 'danger', 99, 'КП с расчётным убытком',
      'В истории коммерческих предложений есть документ «' + (quote.title || 'без названия') + '» с отрицательной расчётной прибылью. Перед повторным использованием пересмотри цену, себестоимость, объём и скидку. Проверь исходные данные: ошибка в себестоимости тоже может дать ложный сигнал.',
      'КП сохранено ' + String(quote.prepared_at || '').slice(0, 10) + '. Цена: ' + rub(quote.revenue_rub) + '. Расчётная себестоимость: ' + rub(quote.cost_rub) + '. Расчётная прибыль: ' + rub(quote.profit_rub) + '. Маржа: ' + Number(quote.margin_pct).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%. Это расчёт при создании PDF, не подтверждение фактической прибыли.',
      'projects', 'Проверить смету');
  } else if (lowMarginQuotes.length) {
    const quote = lowMarginQuotes[0];
    add('quote-low-margin-' + quote.id, 'warning', 87, 'Низкая маржа в сохранённом КП',
      'В истории есть коммерческое предложение «' + (quote.title || 'без названия') + '» с расчётной маржой ниже десяти процентов. Перед отправкой или повторным использованием проверь себестоимость, налоги, скидку и условия работ. Низкая маржа сама по себе не доказывает убыток, но оставляет мало запаса.',
      'Дата создания: ' + String(quote.prepared_at || '').slice(0, 10) + '. Цена: ' + rub(quote.revenue_rub) + '. Себестоимость: ' + rub(quote.cost_rub) + '. Расчётная прибыль: ' + rub(quote.profit_rub) + '. Маржа: ' + Number(quote.margin_pct).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%.',
      'projects', 'Проверить смету');
  }
  if (quotes.length >= 3 && lowMarginQuotes.length >= 2) {
    add('quote-pattern-low-margin', 'warning', 85, 'Низкая маржа повторяется в КП',
      'В сохранённой истории несколько коммерческих предложений имеют расчётную маржу ниже десяти процентов. Проверь, не занижена ли себестоимость работ, учтены ли вывоз, ручной перенос, простои, налоги и запас на непредвиденные условия.',
      'КП в истории: ' + quotes.length + '. Документов с маржой ниже 10%: ' + lowMarginQuotes.length + '. Анализ относится только к сохранённым PDF-КП после включения архива и не охватывает документы, созданные раньше или вне CRM.',
      'projects', 'Разобрать историю КП');
  }

  // Cross-check stored commercial proposal arithmetic against the source amounts.
  for (const quote of quotes) {
    const revenue = Number(quote.revenue_rub);
    const cost = Number(quote.cost_rub);
    const storedProfit = Number(quote.profit_rub);
    if (quote.profit_rub == null || quote.profit_rub === '' || !Number.isFinite(revenue) || !Number.isFinite(cost) || !Number.isFinite(storedProfit) || revenue <= 0 || cost < 0) continue;
    const calculatedProfit = revenue - cost;
    const tolerance = Math.max(2, revenue * 0.005);
    const title = String(quote.title || ('КП №' + quote.id));
    if (Math.abs(calculatedProfit - storedProfit) > tolerance) {
      add('quote-math-mismatch-' + quote.id, calculatedProfit < 0 ? 'danger' : 'warning', calculatedProfit < 0 ? 99 : 92,
        'Не сходится арифметика КП: ' + title,
        'В сохранённом коммерческом предложении «' + title + '» прибыль не совпадает с расчётом цена минус себестоимость. Не отправляй документ, пока не сверишь исходные цифры и сохранённый PDF.',
        'Цена: ' + rub(revenue) + '. Себестоимость: ' + rub(cost) + '. Цена минус себестоимость: ' + rub(calculatedProfit) + '. Сохранённая прибыль: ' + rub(storedProfit) + '. Расхождение: ' + rub(Math.abs(calculatedProfit - storedProfit)) + '. Допуск проверки — 0,5% цены или 2 ₽, что больше. Проверь, одинаково ли учитываются скидки, налоги и дополнительные расходы.',
        'projects', 'Проверить КП');
    }
    const storedMargin = Number(quote.margin_pct);
    if (quote.margin_pct != null && quote.margin_pct !== '' && Number.isFinite(storedMargin)) {
      const calculatedMargin = calculatedProfit / revenue * 100;
      if (Math.abs(calculatedMargin - storedMargin) > 1.5) {
        add('quote-margin-mismatch-' + quote.id, 'warning', 91, 'Маржа в КП требует сверки: ' + title,
          'В сохранённом КП маржа не совпадает с отношением прибыли к цене. Проверь формулу и исходные суммы до использования документа.',
          'Цена: ' + rub(revenue) + '. Расчётная прибыль по цене минус себестоимость: ' + rub(calculatedProfit) + '. Маржа по этим значениям: ' + calculatedMargin.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%. Сохранённая маржа: ' + storedMargin.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%. Возможна разница в формуле или составе затрат.',
          'projects', 'Сверить маржу');
      }
    }
  }

  // Missing dates are operationally relevant only for active/planned projects.
  for (const project of projects) {
    if (!['active', 'planned'].includes(project.status)) continue;
    const title = String(project.title || ('Объект ' + (project.id ?? ''))).trim();
    if (!validIso(String(project.end_date || '').slice(0, 10)) && !validIso(String(project.start_date || '').slice(0, 10))) {
      add('project-dates-missing-' + project.id, 'info', 52, 'У объекта не заданы сроки: ' + title,
        'У объекта «' + title + '» не заполнены даты начала и окончания. Я не могу надёжно оценить просрочку, загрузку бригады и дату поступления остатка оплаты без этих сроков.',
        'Статус: ' + (project.status || 'не указан') + '. Дата начала: не заполнена. Дата окончания: не заполнена. Добавь плановую дату окончания и обновляй её при изменении графика.',
        'projects', 'Указать сроки');
    }
  }

  if (!insights.length) {
    const recordCount = projects.length + leads.length + history.length + tasks.length + orders.length + quotes.length + payments.length + expenses.length + (Array.isArray(data.incomeRecords) ? data.incomeRecords.length : 0);
    add('data-quality-overview', 'info', 20, recordCount ? 'Сейчас нет подтверждённого критичного сигнала' : 'Начнём с данных бизнеса',
      recordCount
        ? 'По доступным записям я не нашла сигнал, который обоснованно нужно поднимать выше остальных. Это не означает, что риска нет: я проверяю только внесённые данные. После новых смен, оплат и смет смогу сравнивать факты.'
        : 'Пока в CRM мало истории для обоснованных советов. Добавь объект, смету, поступления и отчёты смен. Я не буду придумывать показатели и стану учиться на фактических результатах.',
      'Я анализирую сохранённые объекты, финансовые записи, заявки, задачи, заказы и историю производственных смен. Если данные не внесены, я не могу достоверно оценить результат.',
      'dashboard', 'Проверить обзор');
  }

  const severityRank = { danger: 4, warning: 3, opportunity: 2, info: 1 };
  return insights.sort((a, b) => b.priority - a.priority || (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) || a.id.localeCompare(b.id)).slice(0, 12);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildPiCoachInsights, ageDays, validIso };
if (typeof window !== 'undefined') window.StrukturaPiCoach = { buildPiCoachInsights, ageDays, validIso };
