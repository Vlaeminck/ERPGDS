# 🧾 ERP GDS (GDSERP) - Sistema de Gestión Comercial, Organizacional e Integrador Inteligente con ARCA

**ERP GDS** es una plataforma de gestión empresarial e integrador inteligente para Windows y entornos Cloud. Administra el control financiero, conciliaciones de recaudación diaria, estacionamiento, caja chica, gastos fijos, cuentas a pagar y la organización automatizada de facturas PDF e imágenes (PNG, JPG, BMP, TIFF), sincronizándose automáticamente con el portal de **ARCA (ex AFIP)**.

Los archivos procesados se organizan de forma jerárquica en el sistema de archivos bajo la estructura:
```
/Facturas_Procesadas/YYYY/Mes/Nombre de Proveedor/
```

---

## 🎨 Diseño & Estética (Impeccable Light Theme)
- **Interfaz Minimalista y Premium:** Tema claro (*White Mode*) de alto contraste, tipografía moderna, micro-animaciones fluidas y tarjetas elegantes.
- **Navegación Colapsable:** Menú lateral inteligente con soporte para grupos desplegables/colapsables ("Facturas").
- **Componentes Modales:** Ventanas emergentes nativas en HTML/CSS para registro de movimientos de Caja Chica y configuración de credenciales, eliminando los diálogos `prompt()` / `alert()` nativos.

---

## 🗄️ Arquitectura Unificada en SQLite (`control_interno.db`)

Toda la plataforma utiliza la base de datos **SQLite (`control_interno.db`)** como la **Única Fuente de Verdad** (*Single Source of Truth*), garantizando la portabilidad y la persistencia de datos tanto en servidores locales como en la nube (VPS / Render con disco persistente).

### Tablas de la Base de Datos:
1. `recaudacion_diaria`: Conciliación diaria entre Maxirest, Nave, MercadoPago, Banco y efectivo.
2. `estacionamiento_diario`: Arqueo diario de TicketControl vs efectivo y MercadoPago.
3. `estacionamiento_gastos`: Control de gastos operativos del sector estacionamiento.
4. `caja_chica_movimientos`: Registro de egresos e ingresos de caja chica con categorías y responsables.
5. `caja_chica_arqueo`: Arqueo físico de billetes y desglose de efectivo en caja.
6. `gastos_fijos`: Dashboard mensual de gastos estructurales y cálculo de ganancia neta.
7. `arca_compras_csv`: Reportes y estado de comprobantes de "Mis Comprobantes Recibidos" de ARCA.
8. `proveedores_cuentas_pagar`: Seguimiento de deudas y pagos a proveedores.
9. `proveedores`: Catálogo central de proveedores, CUITs, categorías y huellas digitales de coincidencia OCR.
10. `facturas_procesadas`: Registro de facturas digitalizadas y comprobantes reconocidos.
11. `configuraciones`: Configuración del sistema (API Keys, CUIT empresa, credenciales ARCA, tours de usuario y preferencias), **eliminando completamente la dependencia de `localStorage` del navegador**.

---

## 🚀 Características Principales

1. 🤖 **Bot de Sincronización Automática con ARCA (Sin requerir CSV previo):**
   - **Solicitud de Credenciales por Modal:** Si el sistema detecta credenciales incompletas, muestra una ventana modal para ingresar CUIT, Clave Fiscal y Razón Social Representada.
   - **Descarga Inicial desde el 1 de Enero:** Descarga automáticamente los comprobantes recibidos desde el 01/01 del año en curso.
   - Ejecuta el flujo automatizado con Selenium WebDriver.
   - Integra nuevos proveedores automáticamente en la tabla `proveedores` de SQLite en tiempo real.

2. 💵 **Caja Chica Interactiva:**
   - Ventana modal personalizada para ingreso rápido de egresos/ingresos.
   - Clasificación por categorías de gastos (*Insumos, Limpieza, Mantenimiento, Servicios, Logística, Personal, Otros*).
   - Autocompletado inteligente de responsable persistido en la base de datos.

3. 🔍 **Motor de Matching Multinivel de Proveedores:**
   - **Tier 1 (CAE):** Cruce exacto con Código de Autorización Electrónico en reportes ARCA.
   - **Tier 2 (CUIT):** Identificación inequívoca por CUIT del emisor.
   - **Tier 3 (Keywords & Regex):** Reconocimiento inteligente por Razón Social y patrones de numeración.

4. 🌐 **Soporte para Despliegue Híbrido & Remoto (Cloud + Ngrok):**
   - Compatible con despliegues en servidores en la nube (VPS Windows/Linux o Render con volumen persistente).
   - Integración remota con escáneres físicos locales mediante túneles **Ngrok / Agente Local**, permitiendo activar el escáner de la oficina a distancia desde cualquier notebook o tablet.

5. 🔄 **Restablecimiento Completo a Fábrica (`reset.py`):**
   - Limpieza completa de archivos temporales, comprobantes e historiales.
   - Vacía todas las tablas de la base de datos SQLite dejando el sistema en blanco (0 registros) listo para producción:
     ```bash
     python reset.py --force
     ```

---

## 🛠️ Tecnologías Utilizadas

### Backend & Automatización (Python)
* **Flask & WSGI Multihilo (`threaded=True`):** Servidor HTTP de alto rendimiento.
* **SQLite3 (`db_manager.py`):** Motor de base de datos relacional ligero e integrado.
* **Selenium WebDriver (`Edge / Chrome Headless`):** Bot automatizado para ingreso al portal de ARCA/AFIP.
* **Google Gemini AI API:** Extracción asistida de comprobantes complejos por Inteligencia Artificial.
* **PyPDFium2 & pdfplumber:** Extracción nativa de texto desde archivos PDF.
* **Pytesseract (Tesseract OCR):** Reconocimiento óptico de caracteres para documentos escaneados.
* **NAPS2 (Not Another PDF Scanner 2):** Integración CLI para escaneo de documentos físicos TWAIN/WIA.

### Frontend (Interfaz de Usuario)
* **HTML5 & Vanilla CSS3:** Diseño Impeccable Light Mode, transiciones HSL/OKLCH y badges armónicos.
* **Vanilla JavaScript ES6+ (SPA):** Fetch API asíncrona, actualización dinámica en tiempo real y vista en árbol.
* **Driver.js:** Asistente y tutorial guiado paso a paso.

---

## 📋 Requisitos del Sistema (Dependencias Externas)

Para OCR y escaneo físico, se requiere tener instalados:

1. **Tesseract OCR (Para imágenes y PDFs escaneados)**
   - Ruta esperada: `C:\Program Files\Tesseract-OCR\tesseract.exe`
   - Descarga: [UB-Mannheim Tesseract Wiki](https://github.com/UB-Mannheim/tesseract/wiki)

2. **NAPS2 (Para escaneo desde escáner físico)**
   - Ruta esperada: `C:\Program Files\NAPS2\NAPS2.Console.exe`
   - Descarga: [naps2.com](https://www.naps2.com/)

---

## 📂 Uso y Scripts Disponibles

### 1. Iniciar la Aplicación
```bash
python app.py
```
O ejecutando el script `start.bat`.

### 2. Sincronización Automática con ARCA
1. Abre la aplicación y dirígete al módulo de **Ajustes** o pulsa **Sincronizar ARCA**.
2. Ingresa CUIT, Clave Fiscal y la Razón Social a representar.
3. El bot descargará los comprobantes y actualizará los proveedores automáticamente en SQLite.

### 3. Restablecimiento Completo (Reset a Fábrica)
Para limpiar todas las tablas de SQLite y vaciar los directorios de trabajo a 0 registros:
```bash
python reset.py --force
```

### 4. Compilar Ejecutable de Windows (.exe)
```bash
build.bat
```
El ejecutable final se generará en `dist/GDSERP/GDSERP.exe`.

---

## 🔒 Privacidad y Seguridad
- Todas las credenciales y datos contables se almacenan **exclusivamente de forma local en la base de datos SQLite (`control_interno.db`)**.
- No se envía información ni datos contables a servidores de terceros, excepto las consultas dirigidas estrictamente a la API oficial de Google Gemini o al portal de ARCA/AFIP.
