@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  NeuraOAB - Extrator da 2a fase (peca + questoes)
echo ============================================
echo.

".venv\Scripts\python.exe" extract_oab2.py %*

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
