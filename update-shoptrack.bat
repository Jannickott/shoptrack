@echo off
chcp 65001 >nul
REM Opdaterer ShopTrack fra GitHub (master) og genstarter serveren.
REM Dobbeltklik på denne fil på servercomputeren. Har mappen kodeændringer
REM der ikke er på GitHub, stopper den uden at ændre noget.
cd /d "%~dp0"
echo.
echo  Opdaterer ShopTrack...
echo.

git status --porcelain --untracked-files=no > "%TEMP%\shoptrack-status.txt"
for %%A in ("%TEMP%\shoptrack-status.txt") do if %%~zA GTR 0 (
  echo  STOPPET: mappen har ændringer der ikke er på GitHub:
  type "%TEMP%\shoptrack-status.txt"
  echo.
  echo  Intet blev ændret. Spørg før disse filer overskrives.
  pause
  exit /b 1
)

for /f %%H in ('git rev-parse HEAD') do set OLD=%%H
git pull --ff-only origin master
if errorlevel 1 (
  echo.
  echo  STOPPET: kunne ikke hente opdateringen fra GitHub. Intet blev ændret.
  pause
  exit /b 1
)

REM Geninstaller kun pakker når de er ændret
git diff --quiet %OLD% HEAD -- package.json package-lock.json
if errorlevel 1 (
  echo  Pakker ændret - installerer...
  call npm install
)

call pm2 restart all
echo.
echo  Færdig - kører nu:
git log -1 --format="  %%ad  %%s" --date=short
echo.
echo  ShopTrack opdaterer selv tablets (eller genindlæs siden).
pause
