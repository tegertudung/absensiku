@echo off
echo ========================================
echo   Stopping Absensiku Servers
echo ========================================
echo.

echo Stopping process on port 3001 (Backend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Stopping process on port 3000 (Frontend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Done. Both servers stopped.
echo (You can also just close the two terminal windows manually.)
echo.
pause
