@echo off
cd /d "%~dp0"
start http://localhost:4173
call npm run preview
pause
