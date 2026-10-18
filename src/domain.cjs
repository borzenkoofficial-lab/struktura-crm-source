const SERVICE_LABELS = {
  demolition: 'Демонтаж',
  finishing: 'Отделочные работы',
  raised_floor: 'Фальшполы'
};
const SOURCE_LABELS = {
  avito: 'Авито', phone: 'Телефон', telegram: 'Telegram',
  recommendation: 'Рекомендация', website: 'Сайт', other: 'Другое'
};
const STATUS_LABELS = {
  new: 'Новая', contacted: 'Связались', measurement: 'Замер', estimate: 'Смета',
  negotiation: 'Переговоры', won: 'Выиграна', lost: 'Отказ'
};
function rub(value) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value || 0));
}
module.exports = { SERVICE_LABELS, SOURCE_LABELS, STATUS_LABELS, rub };
