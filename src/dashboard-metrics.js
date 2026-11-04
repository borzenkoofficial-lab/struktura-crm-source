'use strict';

(function attachDashboardMetrics(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SKOLDashboardMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDashboardMetrics() {
  function number(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getPeriodRange(period = 'month', now = new Date()) {
    const end = localDate(now);
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') startDate.setDate(startDate.getDate() - 6);
    else if (period === 'year') startDate.setMonth(0, 1);
    else startDate.setDate(1);
    const labels = { week: 'За последние 7 дней', month: 'С начала месяца', year: 'С начала года' };
    return { start: localDate(startDate), end, label: labels[period] || labels.month };
  }

  function isInRange(value, range) {
    const date = String(value || '').slice(0, 10);
    return Boolean(date && date >= range.start && date <= range.end);
  }

  function sum(rows, valueOf = row => row?.amount_rub) {
    return (Array.isArray(rows) ? rows : []).reduce((total, row) => total + number(valueOf(row)), 0);
  }

  function getTaskBucket(task, today = localDate(new Date()), now = new Date()) {
    if (task?.is_done) return 'done';
    if (!task?.due_at) return 'unscheduled';
    const raw = String(task.due_at);
    const dueDate = raw.slice(0, 10);
    if (raw.length <= 10) return dueDate < today ? 'overdue' : dueDate === today ? 'today' : 'upcoming';
    const due = new Date(raw);
    if (!Number.isNaN(due.getTime()) && due < now) return 'overdue';
    return dueDate === today ? 'today' : 'upcoming';
  }

  function percent(done, total) {
    const denominator = Math.max(0, number(total));
    return denominator ? Math.max(0, Math.min(100, number(done) / denominator * 100)) : 0;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function buildCashflowChart({ payments, incomeRecords, expenses }, now, monthsCount = 6) {
    if (!Array.isArray(payments) || !Array.isArray(incomeRecords) || !Array.isArray(expenses)) return [];
    const months = [];
    for (let offset = Math.max(1, Math.min(12, Number(monthsCount) || 6)) - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = monthKey(date);
      const paymentTotal = sum(payments.filter(row => String(row.payment_date || '').startsWith(key)),
        row => row.payment_type === 'refund' ? -number(row.amount_rub) : number(row.amount_rub));
      const otherIncome = sum(incomeRecords.filter(row => String(row.income_date || '').startsWith(key)));
      const paidExpenses = sum(expenses.filter(row => row.is_paid && String(row.expense_date || '').startsWith(key)));
      months.push({
        key,
        label: date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''),
        income: Math.max(0, paymentTotal + otherIncome),
        expenses: Math.max(0, paidExpenses)
      });
    }
    return months;
  }

  function computeDashboardMetrics(input = {}, period = 'month', now = new Date(), chartMonths = 6) {
    const summary = input.summary || {};
    const leads = Array.isArray(input.leads) ? input.leads : [];
    const clients = Array.isArray(input.clients) ? input.clients : null;
    const projects = Array.isArray(input.projects) ? input.projects : [];
    const tasks = Array.isArray(input.tasks) ? input.tasks : [];
    const payments = Array.isArray(input.payments) ? input.payments : null;
    const incomeRecords = Array.isArray(input.incomeRecords) ? input.incomeRecords : null;
    const expenses = Array.isArray(input.expenses) ? input.expenses : null;
    const range = getPeriodRange(period, now);
    const activeProjects = projects.filter(project => ['planned', 'active'].includes(project.status));
    const allProjects = projects.filter(project => project.status !== 'cancelled');
    const completedProjects = allProjects.filter(project => project.status === 'completed').length;
    const plannedPeople = sum(activeProjects.filter(project => project.status === 'active'), project => project.planned_people);
    const financeComplete = payments !== null && incomeRecords !== null && expenses !== null;
    const periodPayments = financeComplete ? payments.filter(row => isInRange(row.payment_date, range)) : [];
    const periodIncome = financeComplete ? incomeRecords.filter(row => isInRange(row.income_date, range)) : [];
    const periodExpenses = financeComplete ? expenses.filter(row => row.is_paid && isInRange(row.expense_date, range)) : [];
    const periodReceived = financeComplete
      ? sum(periodPayments, row => row.payment_type === 'refund' ? -number(row.amount_rub) : number(row.amount_rub)) + sum(periodIncome)
      : null;
    const paidAllTime = financeComplete ? sum(expenses.filter(row => row.is_paid)) : null;
    const receivedAllTime = financeComplete
      ? sum(payments, row => row.payment_type === 'refund' ? -number(row.amount_rub) : number(row.amount_rub)) + sum(incomeRecords)
      : null;
    const cash = summary.cash !== undefined && summary.cash !== null
      ? number(summary.cash)
      : financeComplete ? receivedAllTime - paidAllTime : null;
    const totalContract = sum(allProjects, project => project.contract_rub);
    const projectReceived = sum(allProjects, project => project.received_rub);

    let plannedQuantity = 0;
    let actualQuantity = 0;
    const productionAvailable = Boolean(input.productionEnabled && input.production && Array.isArray(input.production.projects));
    if (productionAvailable) {
      for (const project of input.production.projects) {
        for (const line of project.forecast?.lines || []) {
          plannedQuantity += Math.max(0, number(line.plannedQuantity));
          actualQuantity += Math.max(0, number(line.actualQuantity));
        }
      }
    }
    const doneTasks = tasks.filter(task => task.is_done).length;
    const wonLeads = leads.filter(lead => lead.status === 'won').length;
    const overdueTasks = tasks.filter(task => getTaskBucket(task, localDate(now), now) === 'overdue').length;
    const newLeads = leads.filter(lead => lead.status === 'new').length;
    const unstaffedProjects = projects.filter(project => project.status === 'active' && number(project.planned_people) <= 0).length;
    const unplannedActiveProjects = productionAvailable
      ? input.production.projects.filter(project => number(project.forecast?.totalLines) === 0).length
      : 0;

    return {
      period: range,
      counts: {
        activeLeads: summary.leads ?? leads.filter(lead => !['won', 'lost'].includes(lead.status)).length,
        activeProjects: summary.projects ?? activeProjects.length,
        clients: clients ? clients.length : null,
        plannedPeople
      },
      finance: {
        available: Boolean(input.financeEnabled),
        complete: financeComplete,
        periodReceived,
        periodExpenses: financeComplete ? sum(periodExpenses) : null,
        periodPaymentsCount: periodPayments.length,
        periodOtherIncomeCount: periodIncome.length,
        periodExpenseCount: periodExpenses.length,
        cash,
        totalContract,
        projectReceived,
        collectionPercent: percent(projectReceived, totalContract)
      },
      progress: {
        projects: { done: completedProjects, total: allProjects.length, percent: percent(completedProjects, allProjects.length), available: Array.isArray(input.projects) },
        production: { actual: actualQuantity, planned: plannedQuantity, percent: percent(actualQuantity, plannedQuantity), available: productionAvailable },
        tasks: { done: doneTasks, total: tasks.length, percent: percent(doneTasks, tasks.length), available: Array.isArray(input.tasks) },
        leads: { won: wonLeads, total: leads.length, percent: percent(wonLeads, leads.length), available: Array.isArray(input.leads) }
      },
      availability: {
        leads: Array.isArray(input.leads),
        clients: Array.isArray(input.clients),
        projects: Array.isArray(input.projects),
        tasks: Array.isArray(input.tasks),
        finance: financeComplete,
        production: productionAvailable
      },
      attention: {
        overdueTasks,
        newLeads,
        unstaffedProjects,
        unplannedActiveProjects,
        tasksAvailable: Array.isArray(input.tasks),
        leadsAvailable: Array.isArray(input.leads),
        projectsAvailable: Array.isArray(input.projects),
        productionAvailable
      },
      cashflow: input.financeEnabled ? buildCashflowChart({ payments, incomeRecords, expenses }, now, chartMonths) : []
    };
  }

  return { number, sum, getPeriodRange, isInRange, getTaskBucket, percent, buildCashflowChart, computeDashboardMetrics };
});
