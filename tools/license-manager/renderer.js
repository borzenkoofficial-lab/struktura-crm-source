'use strict';

const $ = id => document.getElementById(id);
let privateKeyLoaded = false;

$('choosePrivateKeyBtn').addEventListener('click', async () => {
  const button = $('choosePrivateKeyBtn');
  button.disabled = true;
  try {
    const result = await window.licenseManager.choosePrivateKey();
    if (result.canceled) return;
    privateKeyLoaded = Boolean(result.loaded);
    $('keyStatus').textContent = privateKeyLoaded ? `Загружен закрытый ключ: ${result.fileName}` : 'Ключ не выбран.';
    $('generateLicenseBtn').disabled = !privateKeyLoaded;
  } catch (error) {
    $('keyStatus').textContent = error.message || 'Не удалось прочитать PEM-файл.';
  } finally { button.disabled = false; }
});

$('licenseForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!privateKeyLoaded) { $('generateStatus').textContent = 'Сначала выбери закрытый ключ.'; return; }
  const button = $('generateLicenseBtn');
  button.disabled = true;
  $('generateStatus').textContent = 'Подписываем лицензию…';
  try {
    const result = await window.licenseManager.generateLicense({
      edition: $('edition').value,
      deviceId: $('deviceId').value.trim(),
      licenseId: $('licenseId').value.trim(),
      seatIndex: Number($('seatIndex').value),
      seatCount: Number($('seatCount').value),
      updatesUntil: $('updatesUntil').value,
      expiresAt: $('expiresAt').value
    });
    $('licenseOutput').value = result.token;
    $('licenseSummary').textContent = `${result.summary.edition} · ${result.summary.licenseId} · место ${result.summary.seatIndex}/${result.summary.seatCount}`;
    $('copyLicenseBtn').disabled = false;
    $('generateStatus').textContent = 'Ключ создан локально. Интернет не использовался.';
  } catch (error) {
    $('generateStatus').textContent = error.message || 'Не удалось создать лицензию.';
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
$('generateLicenseBtn').disabled = true;
