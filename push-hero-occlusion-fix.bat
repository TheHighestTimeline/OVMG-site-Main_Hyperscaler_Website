@echo off
setlocal
title OVMG Site - Publish hero occlusion fix

REM ============================================================
REM  Partner marks now respect the O's depth: a mark travelling
REM  behind the central mark is hidden by it instead of being
REM  drawn on top. Flips data-hero-layer to "occluded" in
REM  index.html (no rebuild needed - the shipped bundle already
REM  supports both modes) and matches the source default.
REM ============================================================

cd /d "C:\Users\south\Desktop\All Websites Backend\github working files\OVMG-site-Main_Hyperscaler_Website"
if errorlevel 1 ( echo Repo folder not found. & pause & exit /b 1 )

for /r ".git" %%L in (*.lock) do del /f /q "%%L" 2>nul

git config user.name "TheHighestTimeline"
git config user.email "291643968+TheHighestTimeline@users.noreply.github.com"

echo.
echo   Publishes the hero depth fix to LIVE (onevibemediagroup.com).
set /p CONFIRM=  Type YES to go live, or anything else to stop:
if /i not "%CONFIRM%"=="YES" (
  echo   Stopped. Nothing was committed or pushed.
  goto END
)

echo.
echo   Step 1 of 3: committing...
git checkout main
if errorlevel 1 goto FAIL
git add -A
git commit -m "Hero: partner marks respect central O depth (logoLayer occluded)"

echo.
echo   Step 2 of 3: syncing with GitHub...
git pull --rebase origin main
if errorlevel 1 goto RBFAIL

echo.
echo   Step 3 of 3: pushing to GitHub (Netlify rebuilds)...
git push origin main
if errorlevel 1 goto FAIL

echo.
echo   ================================================
echo    LIVE. Netlify is building now.
echo    Wait ~1 minute, then hard-refresh
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
