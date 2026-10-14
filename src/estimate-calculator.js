(function (root) {
  'use strict';
  const CATALOG_KEY = 'struktura.estimate.catalog.v1';
  const DRAFT_KEY = 'struktura.estimate.draft.v1';
  // Стартовые ориентиры для Москвы/МО. Это не обязательный рыночный прайс: пользователь должен сверить и заменить ставки под свою технологию и договорённости.
  // Производительность — ориентир в единицах на одного рабочего за 8-часовую смену.
  // Реальные нормы зависят от толщины, основания, доступа, инструмента, выноса и требований объекта.
  function defaultProductivity(item) {
    const id = String(item.id || ''); const name = String(item.name || '').toLowerCase(); const unit = String(item.unit || '');
    if (unit === 'м²') {
      if (/d-floor-screed/.test(id) || /демонтаж цементной стяжки/.test(name)) return 8;
      if (/d-wall-concrete/.test(id) || /бетонной стены/.test(name)) return 2;
      if (/d-wall-brick-full/.test(id) || /кирпичной стены в кирпич/.test(name)) return 4;
      if (/d-wall-brick-half/.test(id) || /кирпичной перегородки/.test(name)) return 6;
      if (/d-wall-gkl|d-wall-gypsum|d-wall-aerated/.test(id)) return 12;
      if (/d-wall-plaster|штукатурки/.test(name)) return 10;
      if (/d-wall-tile|плитки/.test(name) && /демонтаж|снятие/.test(name)) return 8;
      if (/d-floor-tile/.test(id)) return 7;
      if (/d-floor-laminate|d-floor-linoleum|d-wall-wallpaper/.test(id)) return 25;
      if (/d-ceiling|d-gkl-ceiling/.test(id)) return 10;
      if (/w-plaster|штукатурка стен/.test(id+' '+name)) return 8;
      if (/w-putty|шпаклёвка/.test(id+' '+name)) return 15;
      if (/w-paint|покраска/.test(id+' '+name)) return 30;
      if (/w-wallpaper|обоев|поклейка/.test(id+' '+name)) return 18;
      if (/w-gkl|перегородки гкл|монтаж перегородки/.test(id+' '+name)) return 10;
      if (/f-screed|стяжка/.test(id+' '+name)) return 12;
      if (/f-selflevel|наливной/.test(id+' '+name)) return 25;
      if (/f-laminate|ламинат/.test(id+' '+name)) return 18;
      if (/f-vinyl|кварцвинил/.test(id+' '+name)) return 12;
      if (/f-tile|укладка плитки/.test(id+' '+name)) return 6;
      if (/raised|фальшпол/.test(id+' '+name)) return 12;
      if (/плитк|керамогранит/.test(name)) return 6;
      if (/грунтовка/.test(name)) return 35;
      if (/потол/.test(name)) return 10;
      return 10;
    }
    if (unit === 'п.м.') return /плинтус/.test(name) ? 25 : 20;
    if (unit === 'шт.') return /двер|блок/.test(name) ? 4 : 8;
    if (unit === 'т') return 2;
    if (unit === 'рейс' || unit === 'смена' || unit === 'выезд' || unit === 'объект') return 1;
    return 8;
  }
  function normalizeCatalogItem(item) {
    const productivity = Number(item.productivity);
    return { ...item, productivity: Number.isFinite(productivity) && productivity > 0 ? productivity : defaultProductivity(item) };
  }

  const DEFAULT_CATALOG = [
    // Демонтаж
    ['d-wall-gkl','Демонтаж перегородки ГКЛ','Демонтаж','м²',300,0,'Цена за работу; усиленный каркас и два слоя — дороже'],
    ['d-wall-gypsum','Демонтаж гипсовой/гипсолитовой перегородки','Демонтаж','м²',350,0,''],
    ['d-wall-brick-half','Демонтаж кирпичной перегородки 1/2 кирпича','Демонтаж','м²',790,0,'Толщина и доступность влияют на цену'],
    ['d-wall-brick-full','Демонтаж кирпичной стены в кирпич','Демонтаж','м²',1100,0,'Оценить толщину, армирование и вынос'],
    ['d-wall-concrete','Демонтаж бетонной стены/перегородки','Демонтаж','м²',1030,0,'Не применять к несущим конструкциям без проекта и согласований'],
    ['d-wall-aerated','Демонтаж перегородки из газобетона/пеноблока','Демонтаж','м²',450,0,''],
    ['d-wall-plaster','Снятие штукатурки со стен','Демонтаж','м²',170,0,''],
    ['d-wall-tile','Демонтаж плитки со стен','Демонтаж','м²',200,0,'Без восстановления основания'],
    ['d-wall-panels','Демонтаж ПВХ/МДФ-панелей','Демонтаж','м²',150,0,''],
    ['d-wall-wallpaper','Снятие обоев','Демонтаж','м²',140,0,'Сложное многослойное покрытие — отдельная оценка'],
    ['d-opening','Демонтаж дверного блока','Демонтаж','шт.',1800,0,''],
    ['d-door','Демонтаж межкомнатной двери без сохранения','Демонтаж','шт.',900,0,''],
    ['d-floor-screed','Демонтаж цементной стяжки до 50–60 мм','Демонтаж','м²',500,0,'Толщина и армирование меняют цену'],
    ['d-floor-laminate','Демонтаж ламината/паркетной доски','Демонтаж','м²',150,0,''],
    ['d-floor-linoleum','Снятие линолеума','Демонтаж','м²',100,0,'Клей и многослойность — отдельно'],
    ['d-floor-tile','Демонтаж плитки с пола','Демонтаж','м²',250,0,''],
    ['d-ceiling','Демонтаж подвесного потолка','Демонтаж','м²',250,0,''],
    ['d-gkl-ceiling','Демонтаж потолка ГКЛ','Демонтаж','м²',350,0,''],
    ['d-socket','Демонтаж сантехники/оборудования','Демонтаж','шт.',800,0,'Отключение коммуникаций учитывать отдельно'],
    ['d-carry','Ручной вынос строительного мусора','Демонтаж','т',4500,0,'Уточнить этаж, лифт и плечо выноса'],
    // Стены / черновая отделка
    ['w-primer','Грунтовка стен','Стены и перегородки','м²',60,0,'Работа без материала'],
    ['w-plaster','Штукатурка стен по маякам до 3 см','Стены и перегородки','м²',750,0,'Толщина сверх нормы — коэффициент'],
    ['w-putty-wallpaper','Шпаклёвка стен под обои','Стены и перегородки','м²',350,0,''],
    ['w-putty-paint','Шпаклёвка стен под покраску','Стены и перегородки','м²',450,0,'Слои и качество подготовки уточнить'],
    ['w-paint','Покраска стен в 2 слоя','Стены и перегородки','м²',300,0,'Без материала'],
    ['w-wallpaper','Поклейка обоев','Стены и перегородки','м²',400,0,'Подбор рисунка может увеличить цену'],
    ['w-gkl-partition','Монтаж перегородки ГКЛ в 1 слой','Стены и перегородки','м²',950,0,'Цена за работу; каркас/звукоизоляция уточняются'],
    ['w-gkl-double','Монтаж перегородки ГКЛ в 2 слоя','Стены и перегородки','м²',1400,0,''],
    ['w-ptp','Монтаж перегородки из ПГП','Стены и перегородки','м²',1050,0,'Материалы отдельно'],
    ['w-block','Кладка перегородки из блока','Стены и перегородки','м²',1200,0,'Материал и армирование отдельно'],
    ['w-corner','Установка перфорированного уголка','Стены и перегородки','п.м.',180,0,''],
    // Полы
    ['f-screed','ЦПС-стяжка до 50–60 мм','Полы','м²',750,0,'Материал отдельно'],
    ['f-selflevel','Наливной пол / нивелир','Полы','м²',500,0,'Толщина слоя влияет на расход'],
    ['f-primer','Грунтовка пола','Полы','м²',60,0,''],
    ['f-waterproof','Гидроизоляция пола','Полы','м²',400,0,'Работа без материала'],
    ['f-laminate','Укладка ламината','Полы','м²',600,0,'Основание должно быть готово'],
    ['f-vinyl','Укладка кварцвинила','Полы','м²',650,0,'Клеевой способ может стоить дороже'],
    ['f-linoleum','Настил линолеума','Полы','м²',475,0,''],
    ['f-parquet','Укладка инженерной доски/паркета','Полы','м²',1300,0,'Тип замка/клея и рисунок уточнить'],
    ['f-tile','Укладка плитки на пол','Полы','м²',1650,0,'Сложный рисунок и крупный формат — дороже'],
    ['f-skirting','Монтаж напольного плинтуса','Полы','п.м.',285,0,'Материал плинтуса влияет на цену'],
    ['f-threshold','Установка порожка','Полы','шт.',500,0,''],
    ['f-raised-prep','Подготовка основания под фальшпол','Фальшполы','м²',265,0,'Очистка/локальная подготовка; выравнивание отдельно'],
    ['f-raised-standard','Монтаж фальшпола стандартного до 50 мм','Фальшполы','м²',1270,0,'Ориентир по опубликованному прайсу; панели обычно отдельно'],
    ['f-raised-high','Монтаж фальшпола высотой 50–120 мм','Фальшполы','м²',1800,0,'Комплектация и система опор уточняются'],
    ['f-raised-heavy','Монтаж усиленного фальшпола','Фальшполы','м²',2750,0,'Нагрузка и тип панелей требуют спецификации'],
    ['f-raised-support','Установка/регулировка опоры фальшпола','Фальшполы','шт.',425,0,'Если оплата поштучно, не дублировать в цене за м²'],
    ['f-raised-cable','Монтаж кабельного лотка под фальшполом','Фальшполы','п.м.',635,0,''],
    // Потолки
    ['c-putty','Шпаклёвка потолка под покраску','Потолки','м²',720,0,''],
    ['c-paint','Покраска потолка в 2 слоя','Потолки','м²',400,0,''],
    ['c-gkl','Монтаж потолка ГКЛ в 1 уровень','Потолки','м²',1400,0,'Материалы отдельно'],
    ['c-suspended','Монтаж подвесного потолка типа Armstrong','Потолки','м²',650,0,'Каркас/плиты уточнить по спецификации'],
    ['c-stretch','Монтаж натяжного потолка ПВХ','Потолки','м²',950,0,'Комплектация и полотно уточняются'],
    // Плитка / проёмы / прочее
    ['t-wall','Облицовка стен плиткой стандартного формата','Плитка и камень','м²',1950,0,'Затирка и материал проверить отдельно'],
    ['t-large','Крупноформатный керамогранит','Плитка и камень','м²',2800,0,'Цена зависит от размера и условий монтажа'],
    ['t-grout','Затирка швов плитки','Плитка и камень','м²',250,0,''],
    ['t-hole','Сверление отверстия в плитке','Плитка и камень','шт.',500,0,'Диаметр и материал влияют на цену'],
    ['o-door','Установка межкомнатной двери','Двери и монтаж','шт.',5750,0,'Без стоимости дверного блока'],
    ['o-socket','Установка розетки/выключателя','Электрика и сантехника','шт.',300,0,'Только установка; электромонтаж и штробление отдельно'],
    ['o-toilet','Установка унитаза-компакта','Электрика и сантехника','шт.',3400,0,'Подключение коммуникаций проверить по месту'],
    // Логистика / дополнительные
    ['x-container','Контейнер для строительного мусора около 8 м³','Логистика и доп. расходы','шт.',6500,0,'Проверь доступность, простой и тариф перевозчика'],
    ['x-truck','Выезд грузового транспорта','Логистика и доп. расходы','рейс',8000,0,'Цена зависит от маршрута и времени'],
    ['x-lift','Аренда подъёмника/спецтехники','Логистика и доп. расходы','смена',15000,0,'Заполни фактический тариф поставщика'],
    ['x-protect','Защита лифтов и общих зон','Логистика и доп. расходы','объект',8000,0,'Материалы и объём защиты уточнить'],
    ['x-survey','Выезд на замер/обследование','Логистика и доп. расходы','выезд',0,0,'Можно оставить 0, если бесплатно'],
    ['x-misc','Прочие работы / резерв','Логистика и доп. расходы','объект',0,0,'Используй для отдельного согласованного пункта']
  ].map(([id,name,category,unit,price,cost,note]) => ({ id,name,category,unit,price,cost,note }));

  function number(value, name) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Некорректное значение поля «${name}»: укажи неотрицательное число.`);
    return n;
  }
  function calculate(input = {}) {
    const area = number(input.area, 'Площадь');
    const laborPerM2 = number(input.laborPerM2, 'Работы за м²');
    const materialsPerM2 = number(input.materialsPerM2, 'Материалы за м²');
    const disposal = number(input.disposal, 'Вывоз');
    const transport = number(input.transport, 'Транспорт');
    const overheadPercent = number(input.overheadPercent, 'Накладные');
    const marginPercent = number(input.marginPercent, 'Маржа');
    if (area <= 0) throw new Error('Площадь должна быть больше нуля.');
    if (overheadPercent > 100) throw new Error('Накладные не могут превышать 100%.');
    if (marginPercent <= 0 || marginPercent >= 90) throw new Error('Целевая маржа должна быть больше 0% и меньше 90%.');
    const labor = area * laborPerM2;
    const materials = area * materialsPerM2;
    const directCost = labor + materials + disposal + transport;
    const overhead = directCost * overheadPercent / 100;
    const totalCost = directCost + overhead;
    const price = totalCost / (1 - marginPercent / 100);
    const profit = price - totalCost;
    return { area, labor, materials, disposal, transport, directCost, overhead, totalCost, price, profit, pricePerM2: price / area, marginPercent: price ? profit / price * 100 : 0 };
  }
  function calculateDetailed(input = {}) {
    const lines = Array.isArray(input.lines) ? input.lines : [];
    const lineItems = lines.map(line => {
      const quantity = number(line.quantity, `Количество: ${line.name || 'работа'}`);
      const price = number(line.price, `Цена: ${line.name || 'работа'}`);
      const cost = number(line.cost, `Себестоимость: ${line.name || 'работа'}`);
      return { ...line, quantity, price, cost, revenue: quantity * price, costTotal: quantity * cost };
    }).filter(line => line.quantity > 0);
    const workRevenue = lineItems.reduce((sum, line) => sum + line.revenue, 0);
    const lineCosts = lineItems.reduce((sum, line) => sum + line.costTotal, 0);
    const crew = input.crew || {};
    const people = number(crew.people, 'Количество рабочих');
    const rate = number(crew.rate, 'Ставка рабочих');
    const days = number(crew.days, 'Количество смен/дней');
    const hoursPerDay = number(crew.hoursPerDay, 'Часов в смене');
    let payroll = 0;
    switch (crew.mode) {
      case 'hourly': payroll = people * rate * hoursPerDay * days; break;
      case 'shift': payroll = people * rate * days; break;
      case 'per_m2': payroll = number(input.workArea, 'Рабочая площадь') * rate; break;
      case 'percent': payroll = workRevenue * rate / 100; break;
      case 'fixed': payroll = rate; break;
      default: throw new Error('Выбери способ оплаты бригады.');
    }
    const materials = number(input.materialsCost, 'Материалы');
    const disposal = number(input.disposalCost, 'Вывоз и утилизация');
    const transport = number(input.transportCost, 'Транспорт');
    const equipment = number(input.equipmentCost, 'Инструмент и техника');
    const other = number(input.otherCost, 'Прочие расходы');
    const overheadPercent = number(input.overheadPercent, 'Накладные');
    const taxPercent = number(input.taxPercent, 'Резерв на налоги');
    const marginPercent = number(input.marginPercent, 'Целевая маржа');
    const discountPercent = number(input.discountPercent, 'Скидка');
    if (overheadPercent > 100 || taxPercent > 50 || marginPercent <= 0 || marginPercent >= 80 || discountPercent > 100 || taxPercent + marginPercent >= 100) throw new Error('Проверь проценты: накладные до 100%, налоги до 50%, целевая маржа больше 0% и меньше 80%; сумма налога и маржи должна быть меньше 100%, скидка — до 100%.');
    const directCosts = lineCosts + payroll + materials + disposal + transport + equipment + other;
    const overhead = directCosts * overheadPercent / 100;
    const costBeforeTax = directCosts + overhead;
    const listRevenue = workRevenue;
    const discount = listRevenue * discountPercent / 100;
    const revenue = Math.max(0, listRevenue - discount);
    const taxReserve = revenue * taxPercent / 100;
    const totalCost = costBeforeTax + taxReserve;
    const profit = revenue - totalCost;
    const actualMargin = revenue > 0 ? profit / revenue * 100 : 0;
    // Target revenue must cover cost, tax reserve and target profit simultaneously.
    // Sequential division understates/overstates the required price when tax is reserved from revenue.
    const targetPrice = taxPercent + marginPercent < 100 ? costBeforeTax / (1 - (taxPercent + marginPercent) / 100) : null;
    const gapToTarget = targetPrice === null ? null : targetPrice - revenue;
    const targetListPrice = discountPercent < 100 && targetPrice !== null ? targetPrice / (1 - discountPercent / 100) : null;
    const warnings = [];
    if (!lineItems.length || workRevenue <= 0) warnings.push({ level: 'danger', title: 'В смете нет оплачиваемых работ', message: 'Добавь работы и проверь цены. Сейчас выручка по прайсу равна нулю.' });
    if (profit < 0) warnings.push({ level: 'danger', title: 'Смета убыточна', message: `Расчётный убыток составляет ${Math.round(Math.abs(profit)).toLocaleString('ru-RU')} ₽. Не подтверждай цену до пересмотра объёма, ставок или расходов.` });
    else if (actualMargin < marginPercent) warnings.push({ level: 'warning', title: 'Прибыль ниже целевой маржи', message: `Фактическая маржа ${actualMargin.toFixed(1).replace('.', ',')}%, целевая — ${marginPercent}%. Сравни цену клиента с рекомендованной.` });
    if (discountPercent >= 100) warnings.push({ level: 'danger', title: 'Скидка обнуляет выручку', message: 'При скидке 100% клиент не платит за работы. Целевая цена до скидки не может быть рассчитана.' });
    if (targetPrice === null) warnings.push({ level: 'danger', title: 'Целевая цена не рассчитывается', message: 'Сумма налогового резерва и целевой маржи должна быть меньше 100%. Уменьши один из процентов.' });
    if (lineCosts > 0 && payroll > 0) warnings.push({ level: 'warning', title: 'Проверь двойной учёт зарплаты', message: 'Себестоимость в строках трактуется как дополнительные затраты на единицу работы БЕЗ оплаты бригады. Зарплата считается отдельно. Если в себестоимости строки уже заложены те же рабочие, удали повторную составляющую.' });
    if (lineItems.some(line => line.price === 0)) warnings.push({ level: 'warning', title: 'Есть работы с нулевой ценой', message: 'Строки с нулевой ценой входят в объём работ, но не добавляют выручку. Проверь, действительно ли они бесплатные.' });
    if (lineItems.some(line => line.cost > line.price) && discountPercent > 0) warnings.push({ level: 'warning', title: 'Скидка усиливает отрицательную экономику отдельных работ', message: 'У одной или нескольких строк себестоимость за единицу выше цены клиенту, а скидка дополнительно уменьшает выручку. Проверь эти позиции отдельно.' });
    if (taxPercent > 0) warnings.push({ level: 'neutral', title: 'Налоговый резерв — оценка', message: 'Резерв рассчитан как процент от цены клиенту, а не как налоговая декларация. Проверь базу и ставку под свой налоговый режим.' });
    return { lineItems, workRevenue, lineCosts, payroll, materials, disposal, transport, equipment, other, directCosts, overhead, costBeforeTax, listRevenue, discount, revenue, taxReserve, totalCost, profit, actualMargin, targetPrice, targetListPrice, gapToTarget, warnings, marginPercent, discountPercent, people, days, hoursPerDay, workArea: number(input.workArea, 'Рабочая площадь') };
  }

  function calculateDuration(input = {}) {
    const crew = input.crew || {};
    const people = Math.max(0, number(crew.people ?? 1, 'Количество рабочих'));
    const hoursPerDay = Math.max(0, number(crew.hoursPerDay ?? 8, 'Часов в смене'));
    const difficulty = number(input.difficulty ?? 1, 'Коэффициент сложности');
    const targetDays = number(input.targetDays ?? 5, 'Желаемый срок в сменах');
    const reservePercent = number(input.reservePercent ?? 0, 'Резерв срока');
    const efficiencyPercent = number(input.efficiencyPercent ?? 100, 'Полезное время смены');
    if (difficulty < 0.25 || difficulty > 5) throw new Error('Коэффициент сложности должен быть от 0,25 до 5.');
    if (targetDays <= 0) throw new Error('Желаемый срок должен быть больше нуля.');
    if (reservePercent > 100) throw new Error('Резерв срока не может превышать 100%.');
    if (efficiencyPercent <= 0 || efficiencyPercent > 100) throw new Error('Полезное время смены должно быть больше 0% и не больше 100%.');
    const lines = (Array.isArray(input.lines) ? input.lines : []).filter(line => Number(line.quantity) > 0).map(line => {
      const quantity = number(line.quantity, `Количество: ${line.name || 'работа'}`);
      const productivity = number(line.productivity ?? defaultProductivity(line), `Производительность: ${line.name || 'работа'}`);
      if (productivity <= 0) return { name: line.name || 'Работа', unit: line.unit || '', quantity, productivity: 0, personShifts: null, daysForCrew: null, missingRate: true };
      // Observed rates already include real-world losses. Starter rates need a visible efficiency adjustment.
      const hasReliableHistory = Number(line.learningObservations || 0) >= 4;
      const effectiveEfficiency = hasReliableHistory ? 100 : efficiencyPercent;
      const effectiveProductivity = productivity / difficulty * effectiveEfficiency / 100;
      const personShifts = quantity / effectiveProductivity;
      return { name: line.name || 'Работа', unit: line.unit || '', quantity, productivity, effectiveProductivity, effectiveEfficiency, personShifts, daysForCrew: people > 0 ? personShifts / people : null, missingRate: false, hasReliableHistory };
    });
    const known = lines.filter(x => !x.missingRate);
    const missingRates = lines.filter(x => x.missingRate).length;
    // Catalog norms and learned rates are normalized to an 8-hour worker-shift.
    // Convert them to the actual shift length, then add a visible schedule reserve
    // for setup, cleanup, handoffs, supply waits and non-parallel work stages.
    const personShifts = known.reduce((sum, x) => sum + x.personShifts, 0);
    const baseDaysForCrew = people > 0 && hoursPerDay > 0 ? personShifts * 8 / (people * hoursPerDay) : null;
    const partialDaysForCrew = baseDaysForCrew === null ? null : baseDaysForCrew * (1 + reservePercent / 100);
    // Never present a partial sum as the total duration of the whole object.
    const isComplete = lines.length > 0 && missingRates === 0;
    const daysForCrew = isComplete ? partialDaysForCrew : null;
    const workHours = personShifts * 8;
    const requiredPeople = isComplete && hoursPerDay > 0 ? Math.ceil(personShifts * 8 * (1 + reservePercent / 100) / (targetDays * hoursPerDay)) : null;
    const lowDaysForCrew = daysForCrew === null ? null : daysForCrew * 0.85;
    const highDaysForCrew = daysForCrew === null ? null : daysForCrew / 0.85;
    return { lines, people, hoursPerDay, difficulty, targetDays, reservePercent, efficiencyPercent, requiredPeople, personShifts, baseDaysForCrew, partialDaysForCrew, daysForCrew, lowDaysForCrew, highDaysForCrew, calendarHours: daysForCrew === null ? null : daysForCrew * hoursPerDay, workHours, missingRates, reliableHistoryLines: lines.filter(x => x.hasReliableHistory).length, isComplete, forecastStatus: isComplete ? 'complete' : lines.length ? 'partial' : 'empty', isApproximate: true };
  }

  function calculateObservedProductivity(input = {}) {
    const quantity = number(input.quantity, 'Фактический объём');
    const people = number(input.people, 'Количество рабочих');
    const shifts = number(input.shifts, 'Фактические смены');
    const hoursPerShift = number(input.hoursPerShift ?? 8, 'Часов в смене');
    if (quantity <= 0 || people <= 0 || shifts <= 0 || hoursPerShift <= 0 || hoursPerShift > 24) throw new Error('Объём, количество рабочих, смены и часы должны быть больше нуля; длительность смены — до 24 часов.');
    return quantity / (people * shifts * hoursPerShift / 8);
  }

  function calculateActuals(input = {}) {
    const actualRevenue = number(input.contractRevenue, 'Цена договора');
    const received = number(input.received, 'Получено от клиента');
    const wagesPaid = number(input.wagesPaid, 'Выплачено рабочим');
    const materialsPaid = number(input.materialsPaid, 'Фактические материалы');
    const disposalPaid = number(input.disposalPaid, 'Фактический вывоз');
    const transportPaid = number(input.transportPaid, 'Фактический транспорт');
    const equipmentPaid = number(input.equipmentPaid, 'Фактическая техника');
    const otherPaid = number(input.otherPaid, 'Прочие фактические расходы');
    const extraCosts = materialsPaid + disposalPaid + transportPaid + equipmentPaid + otherPaid;
    const actualCosts = wagesPaid + extraCosts;
    const actualProfit = actualRevenue - actualCosts;
    const actualMargin = actualRevenue > 0 ? actualProfit / actualRevenue * 100 : 0;
    return {
      actualRevenue, received, wagesPaid, materialsPaid, disposalPaid, transportPaid,
      equipmentPaid, otherPaid, extraCosts, actualCosts, actualProfit, actualMargin,
      receivable: Math.max(0, actualRevenue - received),
      cashBalance: received - actualCosts,
      overrun: Number.isFinite(Number(input.plannedCost)) ? actualCosts - Math.max(0, Number(input.plannedCost)) : 0,
      overrunPercent: Number(input.plannedCost) > 0 ? (actualCosts - Number(input.plannedCost)) / Number(input.plannedCost) * 100 : 0,
      warnings: [
        ...(received > actualRevenue ? [{ level: 'warning', title: 'Поступления выше цены договора', message: 'Проверь аванс, дополнительные работы или сумму договора.' }] : []),
        ...(actualRevenue === 0 && actualCosts > 0 ? [{ level: 'danger', title: 'Расходы без выручки', message: 'Укажи сумму договора, иначе прибыль и задолженность не отражают экономику объекта.' }] : []),
        ...(actualProfit < 0 ? [{ level: 'danger', title: 'Фактический убыток', message: `Расходы превышают цену договора на ${Math.round(Math.abs(actualProfit)).toLocaleString('ru-RU')} ₽.` }] : []),
        ...(Number(input.plannedCost) > 0 && actualCosts > Number(input.plannedCost) ? [{ level: 'warning', title: 'Перерасход бюджета', message: `Фактические расходы выше плановой себестоимости на ${Math.round(actualCosts - Number(input.plannedCost)).toLocaleString('ru-RU')} ₽.` }] : [])
      ]
    };
  }
  function getCatalog() {
    try {
      const saved = JSON.parse(root.localStorage?.getItem(CATALOG_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) return saved.map(normalizeCatalogItem);
    } catch (_) {}
    return DEFAULT_CATALOG.map(item => normalizeCatalogItem({ ...item }));
  }
  function saveCatalog(catalog) {
    if (!Array.isArray(catalog)) throw new Error('Некорректный прайс-лист.');
    root.localStorage?.setItem(CATALOG_KEY, JSON.stringify(catalog));
    return true;
  }
  function getDraft() { try { return JSON.parse(root.localStorage?.getItem(DRAFT_KEY) || 'null'); } catch (_) { return null; } }
  function saveDraft(draft) { root.localStorage?.setItem(DRAFT_KEY, JSON.stringify(draft)); return true; }
  function resetCatalog() { root.localStorage?.removeItem(CATALOG_KEY); return getCatalog(); }
  root.StrukturaEstimateCalculator = { calculate, calculateDetailed, calculateDuration, calculateObservedProductivity, calculateActuals, getCatalog, saveCatalog, getDraft, saveDraft, resetCatalog, DEFAULT_CATALOG };
  if (typeof module !== 'undefined' && module.exports) module.exports = { calculate, calculateDetailed, calculateDuration, calculateObservedProductivity, calculateActuals, getCatalog: () => DEFAULT_CATALOG.map(x => normalizeCatalogItem({...x})), DEFAULT_CATALOG };
})(typeof globalThis !== 'undefined' ? globalThis : window);
