'use strict';

const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const palette = {
  navy: [31, 34, 38],
  navy2: [45, 49, 54],
  orange: [190, 197, 204],
  pale: [239, 242, 245],
  white: [248, 249, 250],
  teal: [169, 180, 190]
};

function canvas(width, height, pixel) {
  return { width, height, data: Array.from({ length: width * height }, (_, i) => pixel(i % width, Math.floor(i / width))) };
}
function blend(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function set(img, x, y, color) {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < img.width && y < img.height) img.data[y * img.width + x] = color;
}
function rect(img, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(img, xx, yy, color);
}
function circle(img, cx, cy, radius, color, thickness = 0) {
  for (let y = Math.floor(cy - radius); y <= cy + radius; y++) for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (thickness ? d <= radius && d >= radius - thickness : d <= radius) set(img, x, y, color);
  }
}
function line(img, x1, y1, x2, y2, color, thickness = 1) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    rect(img, Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), thickness, thickness, color);
  }
}
const font = {
 G:['01110','10001','10000','10111','10001','10001','01110'],
 O:['01110','10001','10001','10001','10001','10001','01110'],
 P:['11110','10001','10001','11110','10000','10000','10000'],
 R:['11110','10001','10001','11110','10100','10010','10001'],
 U:['10001','10001','10001','10001','10001','10001','01110'],
 Z:['11111','00001','00010','00100','01000','10000','11111'],
 L:['10000','10000','10000','10000','10000','10000','11111'],
 I:['11111','00100','00100','00100','00100','00100','11111'],
 C:['01111','10000','10000','10000','10000','10000','01111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],
 B:['11110','10001','10001','11110','10001','10001','11110'],
 S:['01111','10000','10000','01110','00001','00001','11110'],
 N:['10001','11001','10101','10011','10001','10001','10001'],
 E:['11111','10000','10000','11110','10000','10000','11111'],
 A:['01110','10001','10001','11111','10001','10001','10001'],
 T:['11111','00100','00100','00100','00100','00100','00100'],
};
function text(img, value, x, y, scale, color, spacing = 1) {
  let cursor = x;
  for (const ch of value) {
    if (ch === ' ') { cursor += 4 * scale; continue; }
    const glyphKey = ({ 'О':'O', 'П':'P', 'Л':'L', 'Т':'T' })[ch] || ch;
    const glyph = font[glyphKey];
    if (glyph) glyph.forEach((row, ry) => [...row].forEach((bit, rx) => { if (bit === '1') rect(img, cursor + rx * scale, y + ry * scale, scale, scale, color); }));
    cursor += 5 * scale + spacing;
  }
}
function bmp(img) {
  const rowBytes = Math.ceil(img.width * 3 / 4) * 4;
  const pixelBytes = rowBytes * img.height;
  const buf = Buffer.alloc(54 + pixelBytes);
  buf.write('BM', 0); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(img.width, 18); buf.writeInt32LE(img.height, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(pixelBytes, 34);
  for (let y = 0; y < img.height; y++) {
    const destY = img.height - 1 - y;
    for (let x = 0; x < img.width; x++) {
      const c = img.data[y * img.width + x], off = 54 + destY * rowBytes + x * 3;
      buf[off] = c[2]; buf[off + 1] = c[1]; buf[off + 2] = c[0];
    }
  }
  return buf;
}
function iconIco() {
  // Windows shell icon is authored at 256x256 so electron-builder and Explorer do not fall back to a tiny 32px resource.
  const n = 256, xorBytes = n * n * 4, maskRow = Math.ceil(n / 32) * 4, maskBytes = maskRow * n;
  const dib = Buffer.alloc(40 + xorBytes + maskBytes);
  dib.writeUInt32LE(40, 0); dib.writeInt32LE(n, 4); dib.writeInt32LE(n * 2, 8);
  dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(0, 16); dib.writeUInt32LE(xorBytes, 20);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x - (n - 1) / 2) / 8, dy = (y - (n - 1) / 2) / 8;
    const inTile = Math.abs(dx) < 13 && Math.abs(dy) < 13;
    const oval = (dx * dx) / 64 + (dy * dy) / 100;
    const inO = inTile && oval <= 1 && oval >= 0.48;
    const c = inO ? palette.white : palette.navy;
    const off = 40 + ((n - 1 - y) * n + x) * 4;
    dib[off] = c[2]; dib[off + 1] = c[1]; dib[off + 2] = c[0]; dib[off + 3] = 255;
  }
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 0; header[7] = 0; header[8] = 0; header[9] = 0; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(dib.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, dib]);
}

const side = canvas(164, 314, (x, y) => blend(palette.navy, palette.navy2, y / 314 * 0.55 + x / 164 * 0.08));
circle(side, 144, 26, 70, [30, 66, 89], 1);
circle(side, 145, 27, 49, [35, 76, 99], 1);
circle(side, 18, 285, 78, [24, 48, 68], 1);
rect(side, 23, 43, 48, 48, palette.navy2);
circle(side, 47, 67, 15, palette.white, 4);
text(side, 'ОПЛОТ', 23, 109, 2, palette.white, 1);
rect(side, 23, 135, 42, 2, palette.orange);
text(side, 'СИСТЕМА', 23, 153, 1, [220, 225, 230], 1);
text(side, 'BUSINESS', 23, 184, 1, [169, 180, 190], 1);
text(side, 'MANAGEMENT', 23, 196, 1, [169, 180, 190], 1);
line(side, 23, 226, 141, 226, [60, 88, 107], 1);
circle(side, 27, 249, 3, palette.teal);
text(side, 'LOCAL DATA', 37, 246, 1, [190, 207, 218], 1);
rect(side, 23, 275, 118, 1, [60, 88, 107]);

const header = canvas(150, 57, (x, y) => blend(palette.navy, palette.navy2, x / 150 * 0.4 + y / 57 * 0.15));
rect(header, 12, 12, 31, 31, palette.navy2);
circle(header, 27.5, 27.5, 10, palette.white, 3);
text(header, 'ОПЛОТ', 51, 17, 2, palette.white, 1);
text(header, 'СИСТЕМА', 52, 34, 1, [190, 197, 204], 1);

fs.writeFileSync(path.join(outDir, 'installer-sidebar.bmp'), bmp(side));
fs.writeFileSync(path.join(outDir, 'installer-header.bmp'), bmp(header));
fs.writeFileSync(path.join(outDir, 'oplot.ico'), iconIco());
console.log('Created branded OPLOT graphite installer artwork: sidebar 164x314, header 150x57, app icon 256x256.');
