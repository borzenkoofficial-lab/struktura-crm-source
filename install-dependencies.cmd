@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install Node.js 22 LTS first.& pause & exit /b 1)
call npm install
if errorlevel 1 (echo Dependency installation failed.& pause & exit /b 1)
echo Dependencies installed.
pause
