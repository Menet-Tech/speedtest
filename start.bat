@echo off
title Speedtest App Orchestrator
echo ===================================================
echo   Building and Starting Go Speedtest Services...
echo ===================================================

echo [1/4] Stopping any existing services...
taskkill /f /im speedtest-backend.exe >nul 2>&1
taskkill /f /im speedtest-node.exe >nul 2>&1

echo [2/4] Building Main Backend (Port 8080)...
cd backend
go build -o speedtest-backend.exe . 
if errorlevel 1 (
    echo ERROR: Failed to build backend!
    pause
    exit /b 1
)
cd ..

echo [3/4] Building Speedtest Node Server (Port 8081)...
cd node
go build -o speedtest-node.exe .
if errorlevel 1 (
    echo WARNING: Failed to build node server, will use go run instead.
    start "Speedtest Node" cmd /k "cd /d %~dp0node && go run main.go"
    goto :start_backend
)
cd ..
start "Speedtest Node" cmd /k "cd /d %~dp0node && speedtest-node.exe"

:start_backend
echo [4/4] Starting Main Web Backend...
start "Main Web Backend" cmd /k "cd /d %~dp0backend && speedtest-backend.exe"

echo Waiting for services to initialize...
timeout /t 3 /nobreak >nul

echo Opening speedtest in your default browser...
start http://localhost:8080

echo.
echo Services started successfully! Keep the command windows open.
pause
