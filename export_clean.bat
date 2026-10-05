@echo off
setlocal
echo ===================================================
echo GDSERP - Exportar Version Limpia para Nueva Empresa
echo ===================================================
echo.
python export_clean.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un problema durante la exportacion.
    pause
    exit /b 1
)
echo.
pause
