@echo off
setlocal
cd /d "%~dp0"     rem switch to this folder
call npm install  rem skip if you already installed deps
call npm run start
pause

C:\Windows\System32\cmd.exe /k "cd /d C:\Users\Lobo\Documents\GitHub\Soundbot && npm run start"
