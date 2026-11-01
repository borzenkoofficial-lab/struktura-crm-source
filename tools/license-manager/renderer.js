'use strict';

const $ = id => document.getElementById(id);
let tariffConfig = null;
let featureCatalog = [];
let pendingRequest = null;
let privateKeyLoaded = false;

function setStatus(id, message, isError = false) {
  const node = $(id);
  if (!node) return;
  node.textContent = message;
  node.dataset.state = isError ? 'error' : 'ok';
}

function selectedPlan() {
  return tariffConfig?.plans.find(plan => plan.id === $('managedPlan').value) || null;
}

function renderFeatureOptions(selected = []) {
  const root = $('configFeatureOptions');
  root.replaceChildren();
  for (const feature of featureCatalog) {
    const label = document.createElement('label');
    label.className = 'feature-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selected.includes(feature.id);
    input.dataset.featureId = feature.id;
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = feature.name;
    const description = document.createElement('small');
    description.textContent = feature.description;
    copy.append(name, description);
    label.append(input, copy);
    root.append(label);
  }
}

function renderLicensePlanOptions(selectedId = $('edition').value) {
  const select = $('edition');
  select.replaceChildren();
  for (const plan of tariffConfig.plans.filter(item => item.enabled)) {
    const option = document.createElement('option');
    option.value = plan.id;
    option.textContent = plan.name + (plan.price === null ? ' · цена не задана' : ` · ${plan.price.toLocaleString('ru-RU')} ₽`);
    select.append(option);
  }
  if (pendingRequest) {
    const option = document.createElement('option');
    option.value = 'CUSTOM';
    option.textContent = 'Заявка клиента · ' + pendingRequest.planName;
    select.append(option);
  }
  if ([...select.options].some(option => option.value === selectedId)) select.value = selectedId;
  else if (select.options.length) select.selectedIndex = 0;
}

function renderManagedPlans(selectedId) {
  const select = $('managedPlan');
  const oldValue = selectedId || select.value;
  select.replaceChildren();
  for (const plan of tariffConfig.plans) {
    const option = document.createElement('option');
    option.value = plan.id;
    option.textContent = plan.name + (plan.enabled ? '' : ' · отключён');
    select.append(option);
  }
  if ([...select.options].some(option => option.value === oldValue)) select.value = oldValue;
  else if (select.options.length) select.selectedIndex = 0;
  loadPlanIntoEditor();
}

function loadPlanIntoEditor() {
  const plan = selectedPlan();
  if (!plan) return;
  $('managedPlanId').value = plan.id;
  $('managedPlanName').value = plan.name;
  $('managedPlanPrice').value = plan.price === null ? '' : String(plan.price);
  $('managedPlanDevices').value = String(plan.maxDevices);
  $('managedPlanDescription').value = plan.description || '';
  renderFeatureOptions(plan.features);
  $('removePlanBtn').disabled = tariffConfig.plans.length <= 1;
}

function collectEditorPlan() {
  const current = selectedPlan();
  if (!current) throw new Error('Сначала выбери тариф для редактирования.');
  const id = $('managedPlanId').value.trim().toUpperCase();
  const name = $('managedPlanName').value.trim();
  const priceText = $('managedPlanPrice').value.trim();
  const price = priceText === '' ? null : Number(priceText);
  const maxDevices = Number($('managedPlanDevices').value);
  if (!/^[A-Z][A-Z0-9_-]{1,47}$/.test(id)) throw new Error('ID тарифа: латинские буквы, цифры, дефис или подчёркивание; не менее 2 символов.');
  if (!name || name.length > 80) throw new Error('Название тарифа должно содержать от 1 до 80 символов.');
  if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 100000000)) throw new Error('Цена должна быть целым числом в рублях или оставаться пустой.');
  if (!Number.isSafeInteger(maxDevices) || maxDevices < 1 || maxDevices > 50) throw new Error('Лимит компьютеров должен быть от 1 до 50.');
  const features = [...$('configFeatureOptions').querySelectorAll('input:checked')].map(input => input.dataset.featureId);
  return { ...current, id, name, price, maxDevices, description: $('managedPlanDescription').value.trim(), features };
}

async function commitEditor() {
  const current = selectedPlan();
  const edited = collectEditorPlan();
  const duplicate = tariffConfig.plans.some(plan => plan.id === edited.id && plan.id !== current.id);
  if (duplicate) throw new Error('Такой ID тарифа уже существует.');
  const next = {
    ...tariffConfig,
    plans: tariffConfig.plans.map(plan => plan.id === current.id ? edited : plan)
  };
  const result = await window.licenseManager.updateConfig(next);
  tariffConfig = result.config;
  renderManagedPlans(edited.id);
  renderLicensePlanOptions();
  setStatus('configStatus', 'Изменения тарифа проверены. Нажми «Экспорт JSON», чтобы сохранить файл.');
  return edited;
}

async function choosePrivateKey() {
  const button = $('choosePrivateKeyBtn');
  button.disabled = true;
  try {
    const result = await window.licenseManager.choosePrivateKey();
    if (result.canceled) return;
    privateKeyLoaded = Boolean(result.loaded);
    $('keyStatus').textContent = privateKeyLoaded ? `Загружен закрытый ключ: ${result.fileName}` : 'Ключ не выбран.';
    $('generateLicenseBtn').disabled = !privateKeyLoaded;
  } catch (error) {
    privateKeyLoaded = false;
    $('generateLicenseBtn').disabled = true;
    $('keyStatus').textContent = error.message || 'Не удалось прочитать PEM-файл.';
  } finally { button.disabled = false; }
}

$('choosePrivateKeyBtn').addEventListener('click', choosePrivateKey);
$('managedPlan').addEventListener('change', loadPlanIntoEditor);

for (const id of ['managedPlanId', 'managedPlanName', 'managedPlanPrice', 'managedPlanDevices', 'managedPlanDescription', 'configFeatureOptions']) {
  $(id).addEventListener('change', () => {
    commitEditor().catch(error => setStatus('configStatus', error.message, true));
  });
}

$('addPlanBtn').addEventListener('click', async () => {
  try {
    await commitEditor();
    let suffix = tariffConfig.plans.length + 1;
    let id = 'CUSTOM_' + suffix;
    while (tariffConfig.plans.some(plan => plan.id === id)) id = 'CUSTOM_' + (++suffix);
    const next = {
      ...tariffConfig,
      plans: [...tariffConfig.plans, {
        id, name: 'Новый тариф', description: '', price: null, maxDevices: 50,
        features: [], enabled: true, displayOrder: tariffConfig.plans.length + 1
      }]
    };
    tariffConfig = (await window.licenseManager.updateConfig(next)).config;
    renderManagedPlans(id);
    renderLicensePlanOptions();
    setStatus('configStatus', 'Добавлен новый тариф. Настрой состав модулей и экспортируй JSON.');
  } catch (error) { setStatus('configStatus', error.message, true); }
});

$('removePlanBtn').addEventListener('click', async () => {
  try {
    const current = await commitEditor();
    if (tariffConfig.plans.length <= 1) throw new Error('Нельзя удалить последний тариф.');
    const nextPlans = tariffConfig.plans.filter(plan => plan.id !== current.id);
    tariffConfig = (await window.licenseManager.updateConfig({ ...tariffConfig, plans: nextPlans })).config;
    renderManagedPlans(nextPlans[0].id);
    renderLicensePlanOptions();
    setStatus('configStatus', 'Тариф удалён из рабочей конфигурации. Экспортируй JSON, чтобы сохранить результат.');
  } catch (error) { setStatus('configStatus', error.message, true); }
});

$('loadConfigBtn').addEventListener('click', async () => {
  try {
    const result = await window.licenseManager.loadConfig();
    if (result.canceled) return;
    tariffConfig = result.config;
    pendingRequest = null;
    renderManagedPlans();
    renderLicensePlanOptions();
    setStatus('configStatus', `Загружена конфигурация: ${result.fileName}. Проверь состав и сохрани изменения при необходимости.`);
    setStatus('requestStatus', 'Индивидуальная заявка не загружена.');
  } catch (error) { setStatus('configStatus', error.message || 'Не удалось импортировать JSON.', true); }
});

$('saveConfigBtn').addEventListener('click', async () => {
  try {
    await commitEditor();
    const result = await window.licenseManager.saveConfig(tariffConfig);
    if (!result.canceled) setStatus('configStatus', `Конфигурация сохранена: ${result.fileName}.`);
  } catch (error) { setStatus('configStatus', error.message || 'Не удалось сохранить JSON.', true); }
});

$('importRequestBtn').addEventListener('click', async () => {
  try {
    const result = await window.licenseManager.importRequest();
    if (result.canceled) return;
    pendingRequest = result.request;
    $('seatCount').value = String(pendingRequest.seatCount);
    renderLicensePlanOptions('CUSTOM');
    $('edition').value = 'CUSTOM';
    setStatus('requestStatus', `${result.fileName}: ${pendingRequest.planName}; ${pendingRequest.features.length} модулей; компьютеров: ${pendingRequest.seatCount}. ${pendingRequest.customer.name ? 'Клиент: ' + pendingRequest.customer.name + '. ' : ''}Проверь Device ID и выпусти ключ.`);
  } catch (error) { setStatus('requestStatus', error.message || 'Не удалось импортировать заявку.', true); }
});

$('licenseForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!privateKeyLoaded) { setStatus('generateStatus', 'Сначала выбери закрытый ключ.'); return; }
  const button = $('generateLicenseBtn');
  button.disabled = true;
  setStatus('generateStatus', 'Подписываем лицензию локально…');
  try {
    const selectedId = $('edition').value;
    let planName = '';
    if (selectedId === 'CUSTOM') {
      if (!pendingRequest) throw new Error('Сначала загрузи JSON-заявку с сайта СКОЛ.');
      planName = pendingRequest.planName;
    } else {
      const plan = tariffConfig.plans.find(item => item.id === selectedId && item.enabled);
      if (!plan) throw new Error('Выбери действующий тариф из конфигурации.');
      planName = plan.name;
    }
    const result = await window.licenseManager.generateLicense({
      planId: selectedId,
      deviceId: $('deviceId').value.trim(),
      licenseId: $('licenseId').value.trim(),
      seatIndex: Number($('seatIndex').value),
      seatCount: Number($('seatCount').value),
      updatesUntil: $('updatesUntil').value,
      expiresAt: $('expiresAt').value
    });
    $('licenseOutput').value = result.token;
    $('licenseSummary').textContent = `${result.summary.planName} · ${result.summary.licenseId} · место ${result.summary.seatIndex}/${result.summary.seatCount} · модулей: ${result.summary.features.length}`;
    $('copyLicenseBtn').disabled = false;
    setStatus('generateStatus', 'Ключ создан локально. Интернет не использовался.');
  } catch (error) {
    setStatus('generateStatus', error.message || 'Не удалось создать лицензию.', true);
  } finally { button.disabled = false; }
});

$('copyLicenseBtn').addEventListener('click', async () => {
  if (!$('licenseOutput').value) return;
  try {
    await window.licenseManager.copyLicense($('licenseOutput').value);
    $('copyLicenseBtn').textContent = 'Скопировано';
  } catch {
    $('copyLicenseBtn').textContent = 'Ошибка копирования';
  }
});

async function initialize() {
  try {
    const result = await window.licenseManager.getConfig();
    tariffConfig = result.config;
    featureCatalog = result.features;
    renderManagedPlans();
    renderLicensePlanOptions();
  } catch (error) {
    setStatus('configStatus', error.message || 'Не удалось загрузить каталог тарифов.', true);
  }
  $('generateLicenseBtn').disabled = true;
}

initialize();
