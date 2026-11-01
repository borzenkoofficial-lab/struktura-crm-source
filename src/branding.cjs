'use strict';

const WORDMARK_VIEW_BOX = '0 0 735 180';
const WORDMARK_PATHS = [
  'M143 22H81C44 22 20 45 20 80V100C20 135 44 158 81 158H143L119 135H83C62 135 51 123 51 101V79C51 57 62 45 83 45H119Z',
  'M168 22H200V79L257 22H302L241 85L308 158H265L216 105L200 120V158H168Z',
  'M544 158L605 22H643L715 158H673L622 65L583 158Z'
];
const RING_PATHS = [
  'M405 28C372 28 348 55 348 90C348 125 372 152 405 152',
  'M435 28C468 28 492 55 492 90C492 125 468 152 435 152'
];
function skolWordmarkSvg({ fill = '#25282B', className = 'skol-wordmark', ariaLabel = 'СКОЛ' } = {}) {
  const color = /^#[0-9a-f]{6}$/i.test(fill) ? fill : '#25282B';
  const cls = String(className).replace(/[^a-z0-9 _-]/gi, '');
  return '<svg xmlns="http://www.w3.org/2000/svg" class="' + cls + '" viewBox="' + WORDMARK_VIEW_BOX + '" role="img" aria-label="' + String(ariaLabel).replace(/[&<>"']/g, '') + '"><g fill="' + color + '">' + WORDMARK_PATHS.map(d => '<path d="' + d + '"/>').join('') + '</g><g fill="none" stroke="' + color + '" stroke-width="30" stroke-linecap="butt">' + RING_PATHS.map(d => '<path d="' + d + '"/>').join('') + '</g></svg>';
}
module.exports = { skolWordmarkSvg };
