@echo off
REM Opens ShopTrack in Chrome app mode — no address bar, no tabs, looks native
REM Try Chrome first, fall back to Edge

set URL=http://localhost:3001

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%URL% --window-size=1024,768
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=%URL% --window-size=1024,768
) else (
    REM Fallback to Edge
    start "" "msedge.exe" --app=%URL% --window-size=1024,768
)
