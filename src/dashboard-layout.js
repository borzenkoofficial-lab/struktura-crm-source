'use strict';

(function initSkolDashboardLayout() {
  const ROOT_ID = 'view-dashboard';
  const STORAGE_KEY = 'skol-dashboard-layout-v1';
  const labels = {
    kpis: 'Ключевые показатели',
    finance: 'Денежный поток',
    progress: 'Выполнение работ',
    lists: 'Последние заявки и объекты',
    attention: 'Требует внимания и состояние производства'
  };
  const root = document.getElementById(ROOT_ID);
  const trigger = document.getElementById('dashboardCustomizeBtn');
  if (!root || !trigger) return;

  const widgets = () => Array.from(root.querySelectorAll('[data-dashboard-widget]'));
  let draggedWidget = null;
  let panel = null;

  function readLayout() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) {
      console.warn('Не удалось прочитать настройки главной панели:', error);
      return {};
    }
  }

  function saveLayout() {
    const state = {
      order: widgets().map(widget => widget.dataset.dashboardWidget),
      hidden: widgets().filter(widget => widget.hidden).map(widget => widget.dataset.dashboardWidget)
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { console.warn('Не удалось сохранить настройки главной панели:', error); }
  }

  function moveWidget(widget, direction) {
    const current = widgets();
    const index = current.indexOf(widget);
    const target = current[index + direction];
    if (!target) return;
    if (direction < 0) root.insertBefore(widget, target);
    else root.insertBefore(target, widget);
    saveLayout();
    refreshPanel();
  }

  function createControls(widget) {
    const key = widget.dataset.dashboardWidget;
    widget.classList.add('dashboard-custom-widget');
    const controls = document.createElement('div');
    controls.className = 'dashboard-widget-controls';
    controls.dataset.layoutControl = 'true';

    const drag = document.createElement('button');
    drag.type = 'button';
    drag.className = 'dashboard-widget-drag';
    drag.textContent = '⠿';
    drag.title = 'Перетащить блок';
    drag.setAttribute('aria-label', 'Перетащить блок «' + labels[key] + '»');
    drag.draggable = false;
    drag.dataset.dragHandle = 'true';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'dashboard-widget-move';
    up.textContent = '↑';
    up.title = 'Переместить выше';
    up.setAttribute('aria-label', 'Переместить блок «' + labels[key] + '» выше');
    up.dataset.moveDirection = '-1';

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'dashboard-widget-move';
    down.textContent = '↓';
    down.title = 'Переместить ниже';
    down.setAttribute('aria-label', 'Переместить блок «' + labels[key] + '» ниже');
    down.dataset.moveDirection = '1';

    controls.append(drag, up, down);
    widget.prepend(controls);
  }

  function applyLayout() {
    const state = readLayout();
    const order = Array.isArray(state.order) ? state.order : [];
    const byKey = new Map(widgets().map(widget => [widget.dataset.dashboardWidget, widget]));
    order.forEach(key => {
      const widget = byKey.get(key);
      if (widget) root.append(widget);
    });
    (Array.isArray(state.hidden) ? state.hidden : []).forEach(key => {
      const widget = byKey.get(key);
      if (widget) widget.hidden = true;
    });
  }

  function refreshPanel() {
    if (!panel) return;
    const state = readLayout();
    const hidden = new Set(Array.isArray(state.hidden) ? state.hidden : []);
    const list = panel.querySelector('.dashboard-customize-list');
    if (!list) return;
    list.replaceChildren();
    widgets().forEach(widget => {
      const key = widget.dataset.dashboardWidget;
      const row = document.createElement('label');
      row.className = 'dashboard-customize-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !hidden.has(key);
      checkbox.dataset.visibilityKey = key;
      const name = document.createElement('span');
      name.textContent = labels[key] || key;
      row.append(checkbox, name);
      list.append(row);
    });
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'dashboardCustomizePanel';
    panel.className = 'dashboard-customize-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Настройка главной панели');
    const heading = document.createElement('div');
    heading.className = 'dashboard-customize-heading';
    const title = document.createElement('strong');
    title.textContent = 'Моя главная панель';
    const hint = document.createElement('span');
    hint.textContent = 'Перетаскивай блоки за значок ⠿ или меняй порядок стрелками. Скрытые блоки можно вернуть здесь.';
    heading.append(title, hint);
    const list = document.createElement('div');
    list.className = 'dashboard-customize-list';
    const footer = document.createElement('div');
    footer.className = 'dashboard-customize-footer';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'button subtle';
    reset.textContent = 'Сбросить раскладку';
    reset.dataset.resetDashboardLayout = 'true';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'button primary';
    close.textContent = 'Готово';
    close.dataset.closeDashboardLayout = 'true';
    footer.append(reset, close);
    panel.append(heading, list, footer);
    const toolbar = root.querySelector('.dashboard-toolbar');
    if (toolbar) toolbar.insertAdjacentElement('afterend', panel);
    refreshPanel();
    return panel;
  }

  function togglePanel(force) {
    const target = ensurePanel();
    const open = typeof force === 'boolean' ? force : target.hidden;
    target.hidden = !open;
    root.classList.toggle('is-customizing', open);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.classList.toggle('is-active', open);
    if (open) refreshPanel();
  }

  widgets().forEach(createControls);
  applyLayout();

  trigger.addEventListener('click', () => togglePanel());
  root.addEventListener('click', event => {
    const move = event.target.closest('[data-move-direction]');
    if (move) {
      const widget = move.closest('[data-dashboard-widget]');
      if (widget) moveWidget(widget, Number(move.dataset.moveDirection));
      return;
    }
    const visibility = event.target.closest('[data-visibility-key]');
    if (visibility) {
      const widget = widgets().find(item => item.dataset.dashboardWidget === visibility.dataset.visibilityKey);
      if (widget) widget.hidden = !visibility.checked;
      saveLayout();
      return;
    }
    if (event.target.closest('[data-reset-dashboard-layout]')) {
      try { localStorage.removeItem(STORAGE_KEY); }
      catch (error) { console.warn('Не удалось сбросить настройки главной панели:', error); }
      widgets().forEach(widget => { widget.hidden = false; });
      const originalOrder = ['kpis', 'finance', 'progress', 'lists', 'attention'];
      const byKey = new Map(widgets().map(widget => [widget.dataset.dashboardWidget, widget]));
      originalOrder.forEach(key => { const widget = byKey.get(key); if (widget) root.append(widget); });
      refreshPanel();
      return;
    }
    if (event.target.closest('[data-close-dashboard-layout]')) togglePanel(false);
  });

  let pointerDrag = null;
  function clearPointerDrag(commit = false) {
    if (!pointerDrag) return;
    pointerDrag.widget.classList.remove('is-dragging');
    widgets().forEach(widget => widget.classList.remove('drop-before', 'drop-after'));
    if (commit && pointerDrag.started) {
      saveLayout();
      refreshPanel();
    }
    pointerDrag = null;
    draggedWidget = null;
  }

  root.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || !root.classList.contains('is-customizing') || event.button !== 0) return;
    const widget = handle.closest('[data-dashboard-widget]');
    if (!widget) return;
    pointerDrag = { widget, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, started: false };
    draggedWidget = widget;
    try { handle.setPointerCapture(event.pointerId); } catch {}
  });

  root.addEventListener('pointermove', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    const dx = event.clientX - pointerDrag.startX;
    const dy = event.clientY - pointerDrag.startY;
    if (!pointerDrag.started && Math.hypot(dx, dy) < 6) return;
    pointerDrag.started = true;
    event.preventDefault();
    pointerDrag.widget.classList.add('is-dragging');
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    const target = underPointer && underPointer.closest('[data-dashboard-widget]');
    if (!target || target === pointerDrag.widget || !root.contains(target)) return;
    widgets().forEach(widget => widget.classList.remove('drop-before', 'drop-after'));
    const rect = target.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    target.classList.add(after ? 'drop-after' : 'drop-before');
    root.insertBefore(pointerDrag.widget, after ? target.nextSibling : target);
  });

  root.addEventListener('pointerup', event => {
    if (pointerDrag && event.pointerId === pointerDrag.pointerId) clearPointerDrag(true);
  });
  root.addEventListener('pointercancel', event => {
    if (pointerDrag && event.pointerId === pointerDrag.pointerId) clearPointerDrag(false);
  });
  window.addEventListener('pointerup', event => {
    if (pointerDrag && event.pointerId === pointerDrag.pointerId) clearPointerDrag(true);
  });
  window.addEventListener('blur', () => clearPointerDrag(false));
})();
