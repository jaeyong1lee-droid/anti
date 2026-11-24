@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo  GitHub and Vercel Git Push Helper
echo ==============================================
echo.
echo [1/2] Running Tier-1 Fast Gate (scripts\gate_fast.mjs)...
node scripts\gate_fast.mjs
if errorlevel 1 (
  echo.
  echo  [ERROR] Tier-1 Fast Gate failed. Push aborted.
  pause
  exit /b 1
)
echo.
echo [2/2] Pushing latest commits to GitHub...
echo.
git push origin main
if errorlevel 1 (
  pause
  exit /b 1
)
