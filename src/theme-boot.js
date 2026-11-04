(() => {
  'use strict';
  const KEY = 'struktura-source-theme-v1';
  let theme = 'dark';
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch { /* Keep the deterministic dark default when storage is unavailable. */ }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
