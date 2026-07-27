@echo off
setlocal
title OVMG Site - Push ALL changes to LIVE (main)

REM ============================================================
REM  Commits EVERYTHING in this folder (respecting .gitignore)
REM  straight onto main and pushes. Live site = main.
REM  Netlify rebuilds on push.
REM  Reusable: run any time to publish the current folder state.
REM ============================================================

cd /d "C:\Users\south\Desktop\All Websites Backend\github working files\OVMG-site-Main_Hyperscaler_Website"
if errorlevel 1 ( echo Repo folder not found. & pause & exit /b 1 )

REM clear any stale git locks
for /r ".git" %%L in (*.lock) do del /f /q "%%L" 2>nul

REM GitHub-accepted identity (no private email)
git config user.name "TheHighestTimeline"
git config user.email "291643968+TheHighestTimeline@users.noreply.github.com"

echo.
echo   This will publish ALL current changes in this folder to the
echo   LIVE site (onevibemediagroup.com).
set /p CONFIRM=  Type YES to go live, or anything else to stop:
if /i not "%CONFIRM%"=="YES" (
  echo   Stopped. Nothing was committed or pushed.
  goto END
)

echo.
echo   Step 1 of 3: switching to main and committing everything...
git checkout main
if errorlevel 1 goto FAIL
git add -A
git commit -m "Publish: community scene depth order, JS orbit engine, mobile blue-word paint fix" 2>nul

echo.
echo   Step 2 of 3: syncing with GitHub first (avoids fetch-first errors)...
git pull --rebase origin main
if errorlevel 1 goto RBFAIL

echo.
echo   Step 3 of 3: pushing main to GitHub (Netlify will rebuild)...
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
echo   - GitHub sign-in prompt: complete it and run this again.
echo   - index.lock error: just run this file again (it clears locks on start).
echo   - Anything else: paste the output to Claude.

:END
echo.
pause
endlocal
