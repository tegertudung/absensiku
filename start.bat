@echo off
echo ========================================
echo   Starting Absensiku (Backend + Frontend)
echo ========================================
echo.

echo Checking if PostgreSQL is running...
netstat -ano | findstr ":5432" >nul
if errorlevel 1 (
    echo WARNING: PostgreSQL does not appear to be running on port 5432.
    echo Make sure PostgreSQL service is started before continuing.
    pause
)

echo.
echo Starting Backend on port 3001...
start "Absensiku - Backend" cmd /k "cd /d %~dp0apps\backend && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Frontend on port 3000...
start "Absensiku - Frontend" cmd /k "cd /d %~dp0apps\frontend && npm run dev"

echo.
echo ========================================
echo   Both servers are starting up...
echo   Wait a few seconds, then open:
echo   http://localhost:3000
echo ========================================
echo.
echo Login accounts:
echo   Admin  : admin@pionerclass.com / admin123
echo   Tentor : tentor1@pionerclass.com / tentor123
echo.
pause
