@echo off
set WORKFLOW_DIR=%~dp0

if "%1"=="workflow" (
    cd /d %WORKFLOW_DIR%
    node aye.js sync
    node aye.js list
    goto :eof
)

if "%1"=="list" (
    cd /d %WORKFLOW_DIR%
    node aye.js list
    goto :eof
)

if "%1"=="migrate" (
    cd /d %WORKFLOW_DIR%
    node aye.js migrate
    goto :eof
)

if "%1"=="xiaoshu" (
    cd /d "%WORKFLOW_DIR%"
    if "%2"=="" (
        node aye.js xiaoshu sync
    ) else (
        node aye.js xiaoshu %2 %3 %4 %5 %6 %7 %8 %9
    )
    goto :eof
)

echo.
echo === aye workflow ===
echo   aye workflow  Pull and list articles
echo   aye list      List articles
echo   aye migrate   Migrate historical files
echo   aye xiaoshu   Pull and list Xiaoshu records
echo.
