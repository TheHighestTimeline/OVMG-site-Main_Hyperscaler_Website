@echo off
setlocal
title OVMG Site - Publish carved-band fix

REM ============================================================
REM  The carved band now runs bore-to-rim, matching the artwork.
REM  It previously started at 0.72 of the outer radius, which left
REM  a broad smooth plateau across roughly a third of the face
REM  that is not on the real object.
REM ============================================================

cd /d "C:\Users\south\Desktop\All Websites Backend\github working files\OVMG-site-Main_Hyperscaler_Website"
if errorlevel 1 ( echo Repo folder not found. & pause & exit /b 1 )

for /r ".git" %%L in (*.lock) do del /f /q "%%L" 2>nul

git config user.name "TheHighestTimeline"
git config user.email "291643968+TheHighestTimeline@users.noreply.github.com"

echo.
echo   Publishes the carved-band fix to LIVE (onevibemediagroup.com).
set /p CONFIRM=  Type YES to go live, or anything else to stop:
if /i not "%CONFIRM%"=="YES" (
  echo   Stopped. Nothing was committed or pushed.
  goto END
)

echo.
echo   Step 1 of 4: cleaning up transfer files and stale bundles...
del /f /q "_hero3d-quality-update.tgz" 2>nul
del /f /q "_hero3d-band-update.tgz" 2>nul
del /f /q "_proj-transfer.tgz" 2>nul
del /f /q "hero3d\standalone\assets\index-CVIAQv2x.js" 2>nul
del /f /q "hero3d\standalone\assets\index-Bp9rtSgF.js" 2>nul
del /f /q "hero3d\standalone\assets\index-yeeEkYRZ.js" 2>nul

echo.
echo   Step 2 of 4: committing...
git checkout main
if errorlevel 1 goto FAIL
git add -A
git commit -m "Hero: carved band runs bore-to-rim; occlusion, phone quality tier, antialiasing and logo resolution"

echo.
echo   Step 3 of 4: syncing with GitHub...
git pull --rebase origin main
if errorlevel 1 goto RBFAIL

echo.
echo   Step 4 of 4: pushing to GitHub (Netlify rebuilds)...
git push origin main
if errorlevel 1 goto FAIL

echo.
echo   ================================================
echo    LIVE. Netlify is building now.
echo    Wait ~1-2 minutes, then hard-refresh
echo    onevibemediagroup.com (Ctrl+F5).
echo   ================================================
goto END

:RBFAIL
echo.
echo   The sync (rebase) hit a conflict. Nothing was pushed.
echo   Run this to undo the sync attempt, then tell Claude:
echo       git rebase --abort
goto END

:FAIL
echo.
echo   Something went wrong (see the message above).
echo   Paste the output to Claude.

:END
echo.
pause
endlocal
