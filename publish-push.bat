@echo off
setlocal
title OVMG - Push live (final step)

cd /d "C:\Users\south\Desktop\All Websites Backend\github working files\OVMG-site-Main_Hyperscaler_Website"
if errorlevel 1 ( echo Repo folder not found. & pause & exit /b 1 )

REM clear any stale git locks
for /r ".git" %%L in (*.lock) do del /f /q "%%L" 2>nul

git config user.name "TheHighestTimeline"
git config user.email "291643968+TheHighestTimeline@users.noreply.github.com"

echo.
echo   The redesigned Home + Projects pages are committed on main and
echo   ready to publish. This pushes them to GitHub; Netlify then rebuilds
echo   the live site.
echo.
git checkout main
echo.
echo   Pushing main to GitHub...
git push origin main
if errorlevel 1 goto FAIL

echo.
echo   ================================================
echo    DONE. Live site is publishing.
echo    Wait ~1 minute, then hard-refresh onevibemediagroup.com (Ctrl+F5).
echo   ================================================
REM sync the local working copy to the pushed version
git reset --hard main >nul 2>&1
goto END

:FAIL
echo.
echo   Push failed (see message above).
echo   - If it asks you to sign in to GitHub, complete it and run this again.
echo   - If it says "fetch first", tell Claude and paste this output.

:END
echo.
pause
endlocal
