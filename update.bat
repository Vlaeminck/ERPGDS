@echo off
echo ========================================================
echo Buscando actualizaciones de GDSERP (ERP GDS)...
echo ========================================================
echo.

REM Asegurar que el repositorio remoto esta configurado
git remote add origin https://github.com/Vlaeminck/ERPGDS.git 2>nul
git remote set-url origin https://github.com/Vlaeminck/ERPGDS.git 2>nul

REM Obtener informacion de los ultimos cambios sin aplicarlos
git fetch origin main

REM Mostrar que archivos han sido modificados
echo Los siguientes archivos han sido modificados o agregados en el repositorio y seran actualizados:
git diff --name-status HEAD origin/main
echo.

echo ========================================================
echo Aplicando actualizaciones...
echo ========================================================
echo.

REM Guardar temporalmente los cambios locales
git stash push -m "Respaldo automatico antes de actualizar" >nul 2>&1

REM Descargar y aplicar los cambios oficiales
git pull origin main
set PULL_ERROR=%ERRORLEVEL%

REM Restaurar los cambios locales guardados (si habia alguno)
git stash pop >nul 2>&1

if %PULL_ERROR% NEQ 0 (
    echo.
    echo ========================================================
    echo ERROR: Hubo un problema al aplicar las actualizaciones.
    echo Es posible que tengas cambios locales en el codigo que entran en conflicto.
    echo Tus facturas y registros NO han sido afectados.
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo Actualizacion completada con exito!
    echo.
    echo Tus carpetas de datos y base de datos (control_interno.db)
    echo NO se han visto afectadas, tu informacion sigue intacta.
    echo ========================================================
)

echo.
pause
