'use strict';

const fs = require('node:fs');
const path = require('node:path');

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });

const C = {
  white: [255, 255, 255],
  paper: [248, 250, 246],
  lime: [164, 213, 47],
  limeSoft: [225, 242, 190],
  ink: [37, 40, 43],
  muted: [105, 113, 119],
  line: [226, 231, 222]
};

function image(width, height, fill) {
  return { width, height, data: Array.from({ length: width * height }, (_, i) => fill(i % width, Math.floor(i / width))) };
}
function set(img, x, y, color) {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < img.width && y < img.height) img.data[y * img.width + x] = color;
}
function rect(img, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(img, xx, yy, color);
}
function circle(img, cx, cy, r, color) {
  for (let y = Math.floor(cy-r); y <= cy+r; y++) for (let x = Math.floor(cx-r); x <= cx+r; x++) {
    if (Math.hypot(x-cx, y-cy) <= r) set(img, x, y, color);
  }
}
function bmp(img) {
  const stride = Math.ceil(img.width * 3 / 4) * 4;
  const bytes = stride * img.height;
  const b = Buffer.alloc(54 + bytes);
  b.write('BM', 0); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(img.width, 18); b.writeInt32LE(img.height, 22);
  b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(bytes, 34);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const c = img.data[y * img.width + x], off = 54 + (img.height - 1 - y) * stride + x * 3;
    b[off] = c[2]; b[off+1] = c[1]; b[off+2] = c[0];
  }
  return b;
}

// Sidebar: quiet white surface, soft lime geometry and a crisp SKOL signature.
const side = image(164, 314, (x,y) => y < 314 ? C.white : C.paper);
circle(side, 150, 34, 82, C.paper);
circle(side, 150, 34, 55, C.limeSoft);
circle(side, 8, 298, 68, C.paper);
rect(side, 22, 43, 42, 42, C.lime);
rect(side, 30, 51, 26, 26, C.white);
rect(side, 30, 51, 26, 5, C.ink);
rect(side, 51, 51, 5, 10, C.ink);
rect(side, 30, 62, 26, 5, C.ink);
rect(side, 30, 62, 5, 10, C.ink);
rect(side, 30, 73, 26, 4, C.ink);
rect(side, 22, 105, 94, 3, C.lime);
rect(side, 22, 128, 110, 1, C.line);
rect(side, 22, 157, 78, 5, C.ink);
rect(side, 22, 171, 106, 3, C.muted);
rect(side, 22, 181, 88, 3, C.muted);
rect(side, 22, 221, 120, 1, C.line);
circle(side, 27, 246, 4, C.lime);
rect(side, 39, 243, 82, 3, C.muted);
rect(side, 22, 275, 118, 1, C.line);

// Header: light glass-like field with a lime monogram tile.
const header = image(150, 57, (x,y) => x < 150 ? C.white : C.paper);
rect(header, 11, 10, 35, 35, C.lime);
rect(header, 18, 17, 21, 5, C.ink);
rect(header, 34, 17, 5, 10, C.ink);
rect(header, 18, 28, 21, 5, C.ink);
rect(header, 18, 28, 5, 10, C.ink);
rect(header, 18, 39, 21, 4, C.ink);
rect(header, 56, 17, 65, 5, C.ink);
rect(header, 56, 29, 48, 3, C.muted);
rect(header, 56, 38, 58, 2, C.line);

fs.writeFileSync(path.join(out, 'skol-installer-sidebar.bmp'), bmp(side));
fs.writeFileSync(path.join(out, 'skol-installer-header.bmp'), bmp(header));
console.log('Generated SKOL Liquid Glass installer artwork (white/lime sidebar and header).');
