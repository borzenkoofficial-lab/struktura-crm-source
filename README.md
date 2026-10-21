# Struktura CRM

Исходный код настольного приложения Struktura CRM.

## Требования
- Windows 10/11
- Node.js LTS
- Git for Windows

## Установка
```powershell
npm install
npm start
```

Запуск автоматических тестов:
```powershell
npm test
```

Сборка установщика Windows x64:
```powershell
npm run dist:win
```

## Безопасность
Не добавляйте в Git секреты `.env`, локальные базы данных и логи.
