'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const keyDirectory = path.join(root, 'license-keys');
const privatePath = path.join(keyDirectory, 'skol-license-private.pem');
const publicPath = path.join(root, 'src', 'license-public-key.pem');
const force = process.argv.includes('--force');

if (!force && (fs.existsSync(privatePath) || fs.existsSync(publicPath))) {
  console.error('Ключи уже существуют. Для осознанной ротации используй --force; старые лицензии после ротации перестанут проходить проверку.');
  process.exit(1);
}

fs.mkdirSync(keyDirectory, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
try { fs.chmodSync(privatePath, 0o600); } catch {}

console.log('Создана пара ключей СКОЛ.');
console.log(`Закрытый ключ: ${privatePath}`);
console.log(`Открытый ключ: ${publicPath}`);
console.log('Закрытый ключ не отправляй покупателям и никогда не добавляй в Git.');
console.log('После ротации необходимо пересобрать СКОЛ с новым открытым ключом.');
