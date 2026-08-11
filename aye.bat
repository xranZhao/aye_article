@echo off
set WORKFLOW_DIR=D:\CLAUDE\aye-workflow

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

echo.
echo === aye workflow ===
echo   aye workflow  Pull and list articles
echo   aye list      List articles
echo   aye migrate   Migrate historical files
echo.
