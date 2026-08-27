@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  NeuraOAB - Extrator de questoes da OAB
echo ============================================
echo.

".venv\Scripts\python.exe" extract_oab.py %*

echo.
echo ============================================
if errorlevel 1 (
    echo Terminou com ERRO ^(codigo %errorlevel%^). Veja as mensagens acima.
) else (
    echo Concluido.
)
echo ============================================
echo.
pause
