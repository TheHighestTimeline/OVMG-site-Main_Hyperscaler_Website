@echo off
setlocal
title OVMG Site - Publish the 3D Hero to LIVE (main)

REM ============================================================
REM  Commits the hero3d/ 3D hero build, the docs/ specs, and the
REM  updated index.html onto main and pushes. Netlify rebuilds.
REM  Regenerable build junk is added to .gitignore first so it
REM  never enters the repo.
REM ============================================================

cd /d "C:\Users\south\Desktop\All Websites Backend\github working files\OVMG-site-Main_Hyperscaler_Website"
if errorlevel 1 ( echo Repo folder not found. & pause & exit /b 1 )

REM clear any stale git locks
for /r ".git" %%L in (*.lock) do del /f /q "%%L" 2>nul

REM GitHub-accepted identity (no private email)
git config user.name "TheHighestTimeline"
git config user.email "291643968+TheHighestTimeline@users.noreply.github.com"

echo.
echo   This replaces the old CSS solar-system hero on the LIVE site
echo   (onevibemediagroup.com) with the new 3D partner-orbit hero.
set /p CONFIRM=  Type YES to go live, or anything else to stop:
if /i not "%CONFIRM%"=="YES" (
  echo   Stopped. Nothing was committed or pushed.
  goto END
)

echo.
echo   Step 1 of 4: excluding regenerable build artifacts...
findstr /x /c:"hero3d/screenshots/" .gitignore >nul 2>&1 || echo hero3d/screenshots/>>.gitignore
findstr /x /c:"hero3d/project/test-results/" .gitignore >nul 2>&1 || echo hero3d/project/test-results/>>.gitignore
findstr /x /c:"hero3d/project/tsconfig.tsbuildinfo" .gitignore >nul 2>&1 || echo hero3d/project/tsconfig.tsbuildinfo>>.gitignore
findstr /x /c:".claude/" .gitignore >nul 2>&1 || echo .claude/>>.gitignore

echo.
echo   Step 2 of 4: switching to main and committing...
git checkout main
if errorlevel 1 goto FAIL
git add -A
git commit -m "Publish: replace CSS solar-system hero with 3D partner-orbit hero (hero3d/ + specs)"

echo.
echo   Step 3 of 4: syncing with GitHub first (avoids fetch-first errors)...
git pull --rebase origin main
if errorlevel 1 goto RBFAIL

echo.
echo   Step 4 of 4: pushing main to GitHub (Netlify will rebuild)...
git push origin main
if errorlevel 1 goto FAIL

echo.
echo   ================================================
echo    LIVE. Netlify is building now.
echo    This push is ~18 MB, so give it a moment.
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
echo   - GitHub sign-in prompt: complete it and run this again.
echo   - index.lock error: just run this file again (it clears locks on start).
echo   - Anything else: paste the output to Claude.

:END
echo.
pause
endlocal
