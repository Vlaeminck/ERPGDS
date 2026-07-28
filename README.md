# 🧾 PDFWatcher - Vigía, Organizador e Integrador Inteligente de Facturas con ARCA

**PDFWatcher** es una solución automatizada de escritorio y plataforma web para Windows que gestiona, clasifica y organiza facturas y comprobantes en formato PDF e imágenes (PNG, JPG, BMP, TIFF), sincronizándolos automáticamente con el portal de **ARCA (AFIP)**.

Los archivos procesados se organizan de forma jerárquica y limpia en el sistema de archivos bajo la estructura:
```
/Facturas_Procesadas/YYYY/Mes/Nombre de Proveedor/
```

---

## 🛠️ Tecnologías Utilizadas

### 🔹 Backend & Automatización (Python)
* **Flask & WSGI Multihilo (`threaded=True`):** Servidor HTTP robusto con soporte para peticiones concurrentes y sistema de auto-apagado inteligente por inactividad.
* **Selenium WebDriver (`Edge / Chrome Headless`):** Bot automatizado silencioso para ingresar al portal de ARCA/AFIP, autenticar con Clave Fiscal, seleccionar la persona representada, filtrar fechas y descargar comprobantes en CSV.
* **Google Gemini AI API:** Inteligencia artificial para extracción asistida de facturas complejas, rotadas o con OCR deficiente.
* **PyPDFium2 & pdfplumber:** Extracción nativa ultrarrápida de texto vectorial desde archivos PDF.
* **Pytesseract (Tesseract OCR):** Reconocimiento óptico de caracteres para facturas escaneadas o en formato imagen.
* **NAPS2 (Not Another PDF Scanner 2):** Integración por CLI para escaneo de documentos físicos directamente desde escáneres TWAIN/WIA.
* **Firebase Licensing System:** Verificación y validación de licencias basadas en identificador único de hardware (HWID).

### 🔹 Frontend (Interfaz de Usuario)
* **HTML5 & Vanilla CSS3:** Diseño premium con estética *Glassmorphism*, modo oscuro (Dark Mode), paleta de colores armónica, transiciones suaves y micro-animaciones.
* **Vanilla JavaScript ES6+:** Aplicación Single Page (SPA) interactiva basada en Fetch API, Drag & Drop API, actualización dinámica en tiempo real y vista en árbol (*Tree View*) para facturas procesadas y remitos.
* **Ventana Modal Interactiva de Credenciales:** Solicitud inteligente de credenciales al iniciar o al sincronizar (CUIT, Clave Fiscal, Razón Social y API Key).
* **Driver.js:** Asistente y tutorial guiado interactivo paso a paso.
* **FontAwesome 6:** Iconografía moderna para controles y estados visuales.

---

## 🚀 Características Principales

1. 🤖 **Bot de Sincronización Automática con ARCA (Sin requerir CSV previo):**
   - **Solicitud de Credenciales por Modal:** Al abrir la app o al pulsar "Sincronizar ARCA", si el sistema detecta credenciales incompletas, muestra una ventana modal interactiva para ingresar CUIT, Clave Fiscal, Razón Social Representada y API Key de Gemini.
   - **Descarga Inicial desde el 1 de Enero del Año Actual:** En la primera sincronización (o cuando no haya archivos en la carpeta `CSV ARCA`), descarga automáticamente todos los comprobantes recibidos desde el **01/01 del año en curso** hasta la fecha actual.
   - Realiza el flujo completo de inicio de sesión automatizado con Selenium (Edge/Chrome Headless).
   - Selecciona automáticamente la empresa o persona representada configurada.
   - Descarga el reporte CSV e integra a los nuevos proveedores automáticamente en `suppliers.json`, recargando el motor de búsqueda en tiempo real sin reiniciar el sistema.

2. 📥 **Carga Manual de CSV / ZIP de ARCA:**
   - Permite subir archivos `.csv` o `.zip` directamente desde la interfaz web.
   - Algoritmo seguro de sanitización con marcas de tiempo para prevenir errores de bloqueo de archivos (`Permission Denied`).

3. 🔍 **Motor de Matching Multinivel de Proveedores:**
   - **Tier 1 (CAE):** Cruce exacto con Código de Autorización Electrónico en reportes ARCA.
   - **Tier 2 (CUIT):** Identificación inequívoca por CUIT del emisor.
   - **Tier 3 (Keywords & Regex):** Reconocimiento inteligente por Razón Social y patrones regex de numeración.

4. 📑 **Clasificación de Documentos Fiscales vs. Remitos No Fiscales:**
   - Detecta presupuestos, notas de pedido, vaticinios y remitos comerciales, derivándolos automáticamente a la sección **Remitos / Documentos No Fiscales**.

5. 🖨️ **Escaneo Físico Directo (NAPS2 Integration):**
   - Ejecuta un escaneo silencioso desde tu escáner físico con un solo clic en el Dashboard web.

6. 🩺 **Doctor de Diagnóstico Integrado (`doctor.py`):**
   - Escanea el estado de la base de datos y archivos huérfanos, ofreciendo curas automáticas con un solo botón.

7. 🔄 **Restablecimiento Completo a Fábrica (`reset.py`):**
   - Script para borrar todo historial de archivos, logs, credenciales y proveedores, dejando la aplicación 100% limpia de fábrica.

---

## 📋 Requisitos del Sistema (Dependencias Externas)

Para aprovechar todas las funciones de OCR y escaneo físico, se requiere tener instalados:

### 1. Tesseract OCR (Para imágenes y PDFs escaneados)
- **Ruta esperada:** `C:\Program Files\Tesseract-OCR\tesseract.exe`
- Descarga: [UB-Mannheim Tesseract Wiki](https://github.com/UB-Mannheim/tesseract/wiki)

### 2. NAPS2 (Para el botón de escáner físico)
- **Ruta esperada:** `C:\Program Files\NAPS2\NAPS2.Console.exe`
- Descarga: [naps2.com](https://www.naps2.com/)
- *Nota:* En NAPS2, configura al menos un Perfil de escáner predeterminado.

*(Si ejecutas el programa en una máquina limpia, PDFWatcher intentará instalar estas dependencias automáticamente mediante `winget` al abrirse).*

---

## 📂 Uso y Scripts Disponibles

### 1. Iniciar la Aplicación
```bash
python app.py
```
O simplemente haciendo doble clic en **`start.bat`**.

### 2. Sincronización Automática con ARCA
1. Abre la aplicación (si no tienes credenciales guardadas, la ventana modal se abrirá automáticamente).
2. Ingresa tu CUIT, Clave Fiscal y la Razón Social a representar.
3. Presiona **Guardar y Sincronizar**.
4. El bot ejecutará todo el proceso en segundo plano, descargará los comprobantes desde el 1 de enero y añadirá los proveedores detectados.

### 3. Restablecimiento a Estado de Fábrica
Para borrar todos los datos, comprobantes, credenciales y proveedores:
```bash
python reset.py
```
*(También admite el flag `-y` o `--force` para ejecuciones desatendidas).*

### 4. Compilar Ejecutable de Windows (.exe)
Para generar la versión portable redistribuible:
```bash
build.bat
```
El ejecutable final se creará en `dist/PDFWatcher/PDFWatcher.exe`.

---

## 🔒 Privacidad y Seguridad
- Todas las credenciales de ARCA y API Keys se almacenan **exclusivamente de forma local y encriptada/ofuscada** en tu equipo (`arca_credentials.json` y `api_key.txt`).
- No se envía información ni datos contables a servidores de terceros, excepto las consultas estrictamente dirigidas a la API oficial de Google Gemini o al portal de ARCA/AFIP.
