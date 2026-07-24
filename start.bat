@echo off
title AntiGravity Spaced Repetition Launcher
echo ============================================================
echo  기술사 Spaced Repetition 학습 시스템 실행 중...
echo ============================================================
echo.

set PROJECT_DIR=%~dp0
set NODE_PORTABLE_DIR=%PROJECT_DIR%.node_portable\node-v20.11.1-win-x64
set PATH=%NODE_PORTABLE_DIR%;%PATH%

echo [1/3] 기존 서버 프로세스 점검 및 포트(5000, 3000) 정리 중...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo [2/3] 백엔드 서버(Port 5000)를 새 창에서 가동합니다...
cd /d "%PROJECT_DIR%server"
start "AntiGravity Backend" cmd /k "node index.js"

echo [3/3] 프론트엔드 서버(Port 3000)를 새 창에서 가동합니다...
cd /d "%PROJECT_DIR%client"
start "AntiGravity Frontend" cmd /k "npm run dev"

echo.
echo 잠시 후 웹 브라우저로 로컬 대시보드(http://localhost:3000)를 엽니다...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ============================================================
echo  서버 가동 및 브라우저 실행이 완료되었습니다!
echo  학습을 완료한 후에는 실행된 두 검은색 명령프롬프트 창을 닫아주세요.
echo ============================================================
echo.
timeout /t 5
