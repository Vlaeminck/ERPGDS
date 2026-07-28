@echo off
setlocal enabledelayedexpansion
echo ===================================================
echo PDFWatcher - Instalar Dependencias
echo ===================================================
echo.

:: Verificar si Python esta instalado correctamente (evitando el alias de la Microsoft Store)
echo [0/4] Verificando instalacion de Python...
python -c "import sys; print(sys.version)" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ADVERTENCIA] Python no esta instalado, no esta en el PATH o se abrio la Microsoft Store.
    echo Intentando instalar Python mediante winget...
    winget --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo [ERROR] No se encontro winget. Por favor, instale Python 3.8 o superior manualmente desde python.org.
        echo Asegurese de marcar la opcion "Add Python to PATH" durante la instalacion.
        pause
        exit /b 1
    )
    echo Instalando Python 3.11 y agregandolo al PATH...
    winget install --id Python.Python.3.11 -e --accept-package-agreements --accept-source-agreements --silent --override "PrependPath=1 Include_test=0"
    if !errorlevel! neq 0 (
        echo [ERROR] Hubo un error al instalar Python con winget. Instale manualmente desde python.org.
        pause
        exit /b 1
    )
    echo.
    echo ===================================================
    echo [ATENCION] Python se ha instalado correctamente.
    echo Para que los cambios surtan efecto, DEBE CERRAR ESTA VENTANA 
    echo Y VOLVER A EJECUTAR setup.bat.
    echo ===================================================
    pause
    exit /b 0
)

echo [1/4] Python detectado. Actualizando pip...
python -m pip install --upgrade pip

echo [2/4] Instalando dependencias de Python desde requirements.txt...
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un error al instalar las dependencias de Python.
    pause
    exit /b 1
)

echo.
echo [3/4] Instalando dependencias del sistema (Tesseract OCR y NAPS2)...
echo Comprobando si winget esta disponible...
winget --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Instalando Tesseract OCR...
    winget install --id UB-Mannheim.TesseractOCR -e --accept-package-agreements --accept-source-agreements --silent
    echo Instalando NAPS2...
    winget install --id NAPS2.NAPS2 -e --accept-package-agreements --accept-source-agreements --silent
) else (
    echo [ADVERTENCIA] Winget no esta disponible en este sistema. 
    echo Instale Tesseract OCR y NAPS2 manualmente:
    echo Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
    echo NAPS2: https://www.naps2.com/
)

echo.
echo ===================================================
echo Instalacion completada con exito.
echo.
echo PROXIMOS PASOS (MUY IMPORTANTE):
echo 1. Abra NAPS2 (instalado recientemente) y cree un "Perfil" seleccionando su escaner.
echo 2. Descargue y coloque su archivo CSV de ARCA en la carpeta "CSV ARCA".
echo 3. Ejecute el actualizador de proveedores: python update_suppliers.py
echo 4. Inicie la aplicacion web: python app.py
echo ===================================================
pause
