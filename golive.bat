@echo off
setlocal enabledelayedexpansion
title OVMG Site - Publish redesign to LIVE (main)

REM ============================================================
REM  Applies the redesigned index.html + projects.html to main
REM  (conflict-free: takes the two files onto current main).
REM  Live site = main. Netlify rebuilds on push.
REM ============================================================

cd /d "C:\Users\south\Desktop\All Websites Backend\github working files\OVMG-site-Main_Hyperscaler_Website"
if errorlevel 1 ( echo Repo folder not found. & pause & exit /b 1 )

REM clear any stale git locks
for /r ".git" %%L in (*.lock) do del /f /q "%%L" 2>nul

REM remove the temp compare files if present (not part of the site)
del /f /q "_main_projects_TEMP.html" 2>nul
del /f /q "_main_index_TEMP.html" 2>nul

REM GitHub-accepted identity (no private email)
git config user.name "TheHighestTimeline"
git config user.email "291643968+TheHighestTimeline@users.noreply.github.com"

echo.
echo   Step 1 of 3: saving reconciled pages to the redesign branch...
git checkout redesign-2026-07
if errorlevel 1 goto FAIL
git add index.html projects.html
git commit -m "Reconcile redesign onto current main: Bennettsville flagship, RAM logo, footers" 2>nul
git push -u origin redesign-2026-07
if errorlevel 1 goto FAIL

echo.
echo   This will PUBLISH the redesigned Home + Projects pages to the LIVE site.
echo   (The other pages stay as they are for now.)
set /p CONFIRM=  Type YES to go live, or anything else to stop:
if /i not "%CONFIRM%"=="YES" (
  echo   Stopped. The redesign is saved on branch redesign-2026-07 (nothing went live).
  goto END
)

echo.
echo   Step 2 of 3: switching to main and applying the two redesigned pages...
git checkout main
if errorlevel 1 goto FAIL
for /r ".git" %%L in (*.lock) do del /f /q "%%L" 2>nul
git checkout redesign-2026-07 -- index.html projects.html
if errorlevel 1 goto FAIL
git add index.html projects.html
git commit -m "Publish redesigned homepage + Projects (brand system, Site Ledger)"
if errorlevel 1 goto FAIL

echo.
echo   Step 3 of 3: pushing main to GitHub (Netlify will rebuild)...
git push origin main
if errorlevel 1 goto FAIL

echo.
echo   LIVE. Netlify should start building now. Give it a minute, then
echo   refresh onevibemediagroup.com.
git checkout redesign-2026-07 2>nul
goto END

:FAIL
echo.
echo   Something went wrong (see the message above).
echo   - GitHub sign-in prompt: complete it and run this again.
echo   - "fetch first" / rejected: run fix-main.bat once, then this again.
echo   - index.lock: just run this file again (it clears locks on start).

:END
echo.
pause
endlocal
