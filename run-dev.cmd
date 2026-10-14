@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (echo Run install-dependencies.cmd first.& pause & exit /b 1)
call npm test
if errorlevel 1 (echo Tests failed. App was not started.& pause & exit /b 1)
call npm start
