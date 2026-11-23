@echo off
title AEGISSTOR - Predictive Storage Intelligence & Enterprise Database Security Platform
color 0B

echo ===============================================================================
echo   AEGISSTOR - PREDICTIVE STORAGE INTELLIGENCE & ENTERPRISE DATABASE SECURITY
echo          Multi-Tenant Sovereign Telemetry & Machine Learning Engine
echo ===============================================================================
echo.

cd /d "%~dp0"

echo [*] Checking Python 3.11+ environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python was not found in PATH. Please install Python 3.11+.
    pause
    exit /b 1
)

echo [*] Checking Node.js environment...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js was not found in PATH. Please install Node.js.
    pause
    exit /b 1
)

echo [*] Initializing SQLite database and verifying models...
cd backend
python -c "from app.database.session import init_db; init_db(); print('Database tables verified.')"
if %errorlevel% neq 0 (
    echo [!] Failed to initialize database.
    pause
    exit /b 1
)

echo [*] Launching AEGISSTOR FastAPI Backend on http://127.0.0.1:8000 ...
start "AEGISSTOR Backend (FastAPI)" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

timeout /t 3 /nobreak >nul

echo [*] Launching AEGISSTOR React Frontend on http://localhost:5173 ...
start "AEGISSTOR Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo [*] Launching browser interface...
start http://localhost:5173

echo.
echo ===============================================================================
echo  [+] AEGISSTOR is running locally!
echo      - Backend REST API: http://127.0.0.1:8000/api/docs
echo      - Frontend Observability UI: http://localhost:5173
echo.
echo  Continuous 5-second telemetry sampling is active in SQLite.
echo  Press any key to close this launcher console (services will keep running).
echo ===============================================================================
pause >nul
