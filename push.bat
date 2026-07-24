@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Antigravity GitHub and Vercel Git Push Helper
echo ==================================================
echo.

echo [1/3] 변경 및 신규 파일 자동 등록 중 (git add .)...
git add .

echo.
echo [2/3] 커밋 미작성 변경사항 점검 중...
git status --porcelain | findstr /R "." >nul
if %errorlevel% equ 0 (
    echo   -^> 새 커밋 생성 중...
    git commit -m "update: auto commit via push.bat (%date% %time%)"
) else (
    echo   -^> 이미 커밋이 생성되어 있거나 변경사항이 정리되어 있습니다.
)

echo.
echo [3/3] GitHub main 브랜치 및 Vercel로 푸시 중 (git push origin main)...
git push origin main

echo.
if %errorlevel% equ 0 (
    echo ==================================================
    echo   [성공] GitHub 및 Vercel 푸시가 완료되었습니다!
    echo ==================================================
) else (
    echo ==================================================
    echo   [오류] 푸시에 실패했습니다. 네트워크를 확인하세요.
    echo ==================================================
)

echo.
echo 아무 키나 누르시면 창이 닫힙니다.
pause >nul
