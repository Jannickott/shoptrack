@echo off
REM Starter ShopTrack-serveren igen (fx efter computeren har været slukket).
REM Bruger altid den mappe filen ligger i.
cd /d "%~dp0"
call pm2 resurrect
call pm2 list
pause
