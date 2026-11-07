(() => {
  'use strict';
  const KEY = 'skol-theme-preference-v1';
  let theme = 'light';
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch { /* Keep the white-and-lime light default when storage is unavailable. */ }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const darkStylesheet = document.getElementById('theme-dark-stylesheet');
  const lightStylesheet = document.getElementById('theme-light-stylesheet');
  if (darkStylesheet) darkStylesheet.disabled = theme !== 'dark';
  if (lightStylesheet) lightStylesheet.disabled = theme !== 'light';
})();
