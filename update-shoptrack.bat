@echo off
REM Updates ShopTrack from GitHub (master) and restarts the server.
REM Double-click this on the server computer. If this folder has code changes
REM that are not on GitHub, it stops without changing anything.
cd /d "%~dp0"
echo.
echo  Updating ShopTrack...
echo.

git status --porcelain --untracked-files=no > "%TEMP%\shoptrack-status.txt"
for %%A in ("%TEMP%\shoptrack-status.txt") do if %%~zA GTR 0 (
  echo  STOPPED: this folder has changes that are not on GitHub:
  type "%TEMP%\shoptrack-status.txt"
  echo.
  echo  Nothing was changed. Ask before overwriting these files.
  pause
  exit /b 1
)

for /f %%H in ('git rev-parse HEAD') do set OLD=%%H
git pull --ff-only origin master
if errorlevel 1 (
  echo.
  echo  STOPPED: could not get the update from GitHub. Nothing was changed.
  pause
  exit /b 1
)

REM Only reinstall packages when they changed
git diff --quiet %OLD% HEAD -- package.json package-lock.json
if errorlevel 1 (
  echo  Packages changed - installing...
  call npm install
)

call pm2 restart all
echo.
echo  Done - now running:
git log -1 --format="  %%ad  %%s" --date=short
echo.
echo  Reload ShopTrack on every tablet.
pause
