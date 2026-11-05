'use strict';

const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const palette = {
  graphite: [30, 37, 32],
  graphite2: [245, 248, 243],
  terracotta: [183, 255, 0],
  pale: [248, 250, 246],
  white: [255, 255, 255],
  teal: [183, 255, 0]
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
 R:['11110','10001','10001','11110','10100','10010','10001'],
 U:['10001','10001','10001','10001','10001','10001','01110'],
 Z:['11111','00001','00010','00100','01000','10000','11111'],
 L:['10000','10000','10000','10000','10000','10000','11111'],
 I:['11111','00100','00100','00100','00100','00100','11111'],
 C:['01111','10000','10000','10000','10000','10000','01111'],
 K:['10001','10010','10100','11000','10100','10010','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],
 'С':['01111','10000','10000','10000','10000','10000','01111'],
 'К':['10001','10010','10100','11000','10100','10010','10001'],
 'О':['01110','10001','10001','10001','10001','10001','01110'],
 'Л':['00011','00101','00101','01001','01001','10001','10001'],
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
    const glyph = font[ch];
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
function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function iconIco() {
  // Electron Builder requires a high-resolution 256x256 Windows application icon.
  const n = 256, center = 127.5;
  const xorBytes = n * n * 4, maskRow = Math.ceil(n / 32) * 4, maskBytes = maskRow * n;
  const dib = Buffer.alloc(40 + xorBytes + maskBytes);
  dib.writeUInt32LE(40, 0); dib.writeInt32LE(n, 4); dib.writeInt32LE(n * 2, 8);
  dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(0, 16); dib.writeUInt32LE(xorBytes, 20);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - center, dy = y - center, radius = Math.hypot(dx, dy);
    const inTile = Math.abs(dx) < 111 && Math.abs(dy) < 111;
    const cRing = radius >= 62 && radius <= 91 && !(dx > 0 && Math.abs(dy) < 34);
    const kStem = Math.abs(dx) < 10 && Math.abs(dy) < 77;
    const kUpper = distanceToSegment(dx, dy, 0, 0, 72, -70) < 12;
    const kLower = distanceToSegment(dx, dy, 0, 0, 72, 70) < 12;
    const accent = distanceToSegment(dx, dy, 48, -77, 78, -77) < 3.5;
    const inMark = inTile && (cRing || kStem || kUpper || kLower);
    const color = accent ? palette.terracotta : (inMark ? palette.white : (inTile ? palette.graphite2 : palette.graphite));
    const off = 40 + ((n - 1 - y) * n + x) * 4;
    dib[off] = color[2]; dib[off + 1] = color[1]; dib[off + 2] = color[0]; dib[off + 3] = 255;
  }
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 0; header[7] = 0; header[8] = 0; header[9] = 0; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(dib.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, dib]);
}
const side = canvas(164, 314, (x, y) => blend(palette.white, palette.pale, y / 314 * 0.65));
rect(side, 0, 0, 164, 7, palette.terracotta);
rect(side, 20, 34, 52, 52, palette.terracotta);
text(side, 'СКОЛ', 22, 51, 3, palette.graphite, 1);
text(side, 'УПРАВЛЕНИЕ', 20, 112, 1, palette.graphite, 1);
text(side, 'СТРОЙКОЙ', 20, 126, 1, palette.graphite, 1);
rect(side, 20, 151, 124, 2, [222, 229, 220]);
text(side, 'ЕДИНАЯ СИСТЕМА', 20, 170, 1, [95, 108, 96], 1);
text(side, 'ДЛЯ ОБЪЕКТОВ', 20, 184, 1, [95, 108, 96], 1);
rect(side, 20, 218, 124, 36, [244, 248, 239]);
rect(side, 20, 218, 4, 36, palette.terracotta);
text(side, 'ЛОКАЛЬНЫЕ ДАННЫЕ', 30, 232, 1, palette.graphite, 1);
circle(side, 132, 281, 17, palette.terracotta);
circle(side, 132, 281, 7, palette.graphite);
text(side, 'СКОЛ / DESKTOP', 20, 284, 1, [95, 108, 96], 1);

const header = canvas(150, 57, () => palette.white);
rect(header, 0, 0, 150, 4, palette.terracotta);
rect(header, 12, 12, 31, 31, palette.terracotta);
text(header, 'С', 17, 19, 3, palette.graphite, 0);
text(header, 'СКОЛ', 51, 14, 3, palette.graphite, 1);
text(header, 'DESKTOP SYSTEM', 51, 39, 1, [95, 108, 96], 1);

fs.writeFileSync(path.join(outDir, 'skol-installer-sidebar.bmp'), bmp(side));
fs.writeFileSync(path.join(outDir, 'skol-installer-header.bmp'), bmp(header));
fs.writeFileSync(path.join(outDir, 'skol.ico'), iconIco());
console.log('Created СКОЛ installer artwork: sidebar 164x314, header 150x57, 256x256 Windows icon.');
