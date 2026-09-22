@echo off
setlocal
cd /d "%~dp0"
title Azielon PMP Coach v4.3.5

if not exist .venv\Scripts\python.exe (
  echo First-time setup required.
  call SETUP_LOCAL_WINDOWS.bat
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue;if($c){$c|%%{try{Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue}catch{}}}"
timeout /t 2 /nobreak >nul

start "" "http://localhost:8000/?build=435"
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
pause
