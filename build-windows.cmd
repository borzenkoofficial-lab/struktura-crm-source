@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (echo Run install-dependencies.cmd first.& pause & exit /b 1)
call npm test
if errorlevel 1 (echo Tests failed. Build stopped.& pause & exit /b 1)
call npm run dist:win
if errorlevel 1 (echo Windows installer build failed.& pause & exit /b 1)
echo Installer output should be in the dist folder.
pause
