@echo off
cd /d "%~dp0"
echo ==============================================
echo  GitHub and Vercel Git Push Helper
echo ==============================================
echo.
echo Pushing latest commits to GitHub...
echo.
git push origin main
echo.
echo ==============================================
echo  Done! Press any key to close.
echo ==============================================
pause
