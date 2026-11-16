@echo off
echo ===========================================
echo Iniciando actualización del ERP GDS...
echo ===========================================

REM Navegar al directorio del proyecto
cd /d "c:\Users\Gardenias\Desktop\DEVS\ERPGDS\ERPGDS"

echo 1. Realizando git pull...
git pull

echo 2. Actualizando dependencias de Python...
pip install -r requirements.txt

echo ===========================================
echo Actualización del código completada.
echo.
echo NOTA: Si utilizas la versión compilada (.exe),
echo recuerda ejecutar 'build.bat' para regenerar
echo el ejecutable con los nuevos cambios.
echo ===========================================
pause
