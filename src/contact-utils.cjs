function normalizeContactEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return '';
  if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)) {
    throw new Error('Проверь email: укажи адрес в формате name@example.com или оставь поле пустым.');
  }
  return email;
}
function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
  else if (digits.length === 10) digits = '7' + digits;
  return digits;
}
module.exports = { normalizeContactEmail, normalizePhone };
