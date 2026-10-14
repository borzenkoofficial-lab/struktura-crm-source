function normalizeContactEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return '';
  if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)) {
    throw new Error('Проверь email: укажи адрес в формате name@example.com или оставь поле пустым.');
  }
  return email;
}
module.exports = { normalizeContactEmail };
