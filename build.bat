@echo off
setlocal EnableDelayedExpansion
echo ===================================================
echo GDSERP (ERP GDS) - Crear Ejecutable (.exe)
echo ===================================================
echo.

:: Verificar si Python esta instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python no esta instalado o no esta en el PATH del sistema.
    echo Por favor, instale Python version 3.8 o superior antes de continuar.
    pause
    exit /b 1
)


echo ===================================================
echo [VERIFICACION] CSV ARCA
echo ===================================================
if not exist "CSV ARCA\*.csv" (
    echo [ADVERTENCIA] No se encontro ningun archivo .csv en la carpeta "CSV ARCA".
    echo El ejecutable se compilara, pero no tendra datos pre-cargados de ARCA.
    echo Asegurese de anadirlos en la carpeta "CSV ARCA" final si es necesario.
    pause
) else (
    echo [OK] Archivos CSV encontrados.
)
echo.

echo [1/1] Ejecutando compilador automatizado (build.py)...
python build.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un error al generar la compilación.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo ¡Proceso de compilación finalizado!
echo El ejecutable final se encuentra en "dist\GDSERP\GDSERP.exe".
echo ===================================================
pause
