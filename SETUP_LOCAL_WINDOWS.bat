@echo off
setlocal
cd /d "%~dp0"
echo ================================================================
echo  Azielon PMP Coach - One-Click Local Setup
echo ================================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  set PY=py -3
) else (
  where python >nul 2>nul
  if %errorlevel% neq 0 (
    echo Python 3 was not found. Install Python 3.12+ and check "Add Python to PATH".
    pause
    exit /b 1
  )
  set PY=python
)

if not exist .venv\Scripts\python.exe (
  echo [1/4] Creating virtual environment...
  %PY% -m venv .venv
  if %errorlevel% neq 0 goto :fail
) else (
  echo [1/4] Virtual environment already exists.
)

echo [2/4] Updating pip...
.venv\Scripts\python.exe -m pip install --upgrade pip
if %errorlevel% neq 0 goto :fail

echo [3/4] Installing application dependencies...
.venv\Scripts\python.exe -m pip install -r requirements.txt
if %errorlevel% neq 0 goto :fail

echo [4/4] Creating/configuring PostgreSQL and Azielon database...
.venv\Scripts\python.exe scripts\bootstrap_local.py
if %errorlevel% neq 0 goto :fail

echo.
echo Setup completed successfully.
echo Setup is complete. Run RUN_LOCAL_WINDOWS.bat to start Azielon PMP Coach.
pause
exit /b 0

:fail
echo.
echo Setup failed. Read the error above, correct it, and run this file again.
pause
exit /b 1
