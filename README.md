# 🧾 ERP GDS (GDSERP) - Sistema de Gestión Comercial, Organizacional e Integrador Inteligente con ARCA (Rama Web)

**ERP GDS** es una plataforma de gestión empresarial e integrador inteligente para Windows y entornos Cloud. Administra el control financiero, conciliaciones de recaudación diaria, estacionamiento, caja chica, gastos fijos, cuentas a pagar y la organización automatizada de facturas PDF e imágenes (PNG, JPG, BMP, TIFF), sincronizándose automáticamente con el portal de **ARCA (ex AFIP)** y en tiempo real con **Firebase Cloud Firestore**.

Los archivos procesados se organizan de forma jerárquica en el sistema de archivos bajo la estructura:
```
/Facturas_Procesadas/YYYY/Mes/Nombre de Proveedor/
```

---

## 🌐 Módulo Web & Portal para Stakeholders (`app_cloud.py`)

La **Rama Web** incorpora una solución integral para socios, directivos y auditores externos:
1. **Acceso Seguro por PIN:** Autenticación protegida para stakeholders con interfaz optimizada para dispositivos móviles, tablets y navegadores de escritorio.
2. **Tablero de Control de Compras & Comprobantes ARCA:**
   - Visualización de comprobantes recibidos, detalle de montos totales e IVA.
   - Estado de pago (*Pagado / Pendiente*) y asignación rápida de método de pago (*Efectivo, Galicia, Mercado Pago, Tarjeta de Crédito*).
   - Detección y badge para compras con asignaciones retroactivas.
3. **Gestor Jerárquico de Categorías & Subcategorías (Rubros):**
   - Árbol de categorías principales (ej: *Carnes, Limpieza, Bebidas, Lácteos*) y subcategorías (ej: *Vacuno, Químicos*).
   - Creación, edición y eliminación sincronizadas en tiempo real con Firebase Firestore.
4. **Asignación de Nombres de Fantasía (Alias de Proveedores):**
   - Mapeo de razones sociales formales de ARCA a nombres comerciales amigables (ej: `"PEPE CONGELADOS"`).
   - Asignación rápida de rubro y subcategoría para clasificar automáticamente las compras de cada proveedor.
5. **Dashboard Analítico de Gastos & Compras:**
   - Evolución mensual de facturación.
   - Métricas por método de pago.
   - Top proveedores y distribución de compras por rubro.

---

## 🎨 Diseño & Estética (Impeccable Light Theme)
- **Interfaz Minimalista y Premium:** Tema claro (*White Mode*) de alto contraste, tipografía moderna, micro-animaciones fluidas y tarjetas elegantes tipo glassmorphism.
- **Navegación Colapsable:** Menú lateral inteligente con soporte para grupos desplegables y gestión de pestañas.
- **Componentes Modales:** Ventanas emergentes nativas en HTML/CSS para registro de movimientos de Caja Chica, autenticación PIN y configuración de credenciales.

---

## 🗄️ Arquitectura Unificada en SQLite (`control_interno.db`) & Firebase Relay

Toda la plataforma utiliza la base de datos **SQLite (`control_interno.db`)** como la **Única Fuente de Verdad** (*Single Source of Truth*), respaldada y replicada de forma continua mediante **Firebase Firestore**.

### Tablas de la Base de Datos:
1. `recaudacion_diaria`: Conciliación diaria entre Maxirest, Nave, MercadoPago, Banco y efectivo.
2. `estacionamiento_diario`: Arqueo diario de TicketControl vs efectivo y MercadoPago.
3. `estacionamiento_gastos`: Control de gastos operativos del sector estacionamiento.
4. `caja_chica_movimientos`: Registro de egresos e ingresos de caja chica con categorías y responsables.
5. `caja_chica_arqueo`: Arqueo físico de billetes y desglose de efectivo en caja.
6. `gastos_fijos`: Dashboard mensual de gastos estructurales y cálculo de ganancia neta.
7. `arca_compras_csv`: Reportes y estado de comprobantes de "Mis Comprobantes Recibidos" de ARCA.
8. `arca_compras_snapshots`: Historial de estados previos de comprobantes para trazabilidad.
9. `proveedores_cuentas_pagar`: Seguimiento de deudas y pagos a proveedores.
10. `proveedores`: Catálogo central de proveedores, CUITs, categorías, subcategorías, alias (nombres de fantasía) y huellas digitales de coincidencia OCR.
11. `facturas_procesadas`: Registro de facturas digitalizadas y comprobantes reconocidos.
12. `retiros_recaudacion`: Salidas de dinero directas de fondos recaudados con especificación de origen y responsable.
13. `categorias_gastos`: Árbol de rubros y subcategorías de compras y gastos.
14. `configuraciones`: Configuración del sistema (API Keys, CUIT empresa, credenciales ARCA, tours de usuario y preferencias).

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
   - Compatible con servidores en la nube (Render, Railway, VPS Linux/Windows).
   - Integración remota con escáneres físicos locales mediante túneles **Ngrok / Agente Local**, permitiendo activar el escáner de la oficina a distancia.

5. 🔄 **Restablecimiento Completo a Fábrica (`reset.py`):**
   - Limpieza completa de archivos temporales, comprobantes e historiales.
   - Vacía todas las tablas de la base de datos SQLite dejando el sistema en blanco (0 registros) listo para producción:
     ```bash
     python reset.py --force
     ```

---

## 🛠️ Tecnologías Utilizadas

### Backend & Automatización (Python)
* **Flask & WSGI Multihilo (`threaded=True`):** Servidor HTTP de alto rendimiento (`app.py` y `app_cloud.py`).
* **SQLite3 (`db_manager.py`):** Motor de base de datos relacional integrado con modo WAL.
* **Firebase Admin SDK (`firebase_sync.py`):** Sincronización continua y en tiempo real con Google Cloud Firestore.
* **Selenium WebDriver (`Edge / Chrome Headless`):** Bot automatizado para ingreso al portal de ARCA/AFIP.
* **Google Gemini AI API:** Extracción asistida de comprobantes complejos por Inteligencia Artificial.
* **PyPDFium2 & pdfplumber:** Extracción nativa de texto desde archivos PDF.
* **Pytesseract (Tesseract OCR):** Reconocimiento óptico de caracteres para documentos escaneados.
* **NAPS2 (Not Another PDF Scanner 2):** Integración CLI para escaneo de documentos físicos TWAIN/WIA.

### Frontend (Interfaz de Usuario)
* **HTML5 & Vanilla CSS3:** Diseño Impeccable Light Mode, transiciones HSL/OKLCH y badges armónicos.
* **Vanilla JavaScript ES6+ (SPA):** Fetch API asíncrona, actualización dinámica en tiempo real y vista en árbol (`main.js` y `stakeholders.js`).
* **Chart.js v4.4.0:** Gráficos estadísticos y evolución financiera.
* **Driver.js:** Asistente y tutorial guiado paso a paso.

---

## 📋 Requisitos del Sistema (Dependencias Externas)

Para OCR y escaneo físico local en Windows, se requiere tener instalados:

1. **Tesseract OCR (Para imágenes y PDFs escaneados)**
   - Ruta esperada: `C:\Program Files\Tesseract-OCR\tesseract.exe`
   - Descarga: [UB-Mannheim Tesseract Wiki](https://github.com/UB-Mannheim/tesseract/wiki)

2. **NAPS2 (Para escaneo desde escáner físico)**
   - Ruta esperada: `C:\Program Files\NAPS2\NAPS2.Console.exe`
   - Descarga: [naps2.com](https://www.naps2.com/)

---

## 📂 Uso y Modos de Ejecución

### 1. Iniciar la Aplicación Desktop (Completa con Watcher y OCR Local)
```bash
python app.py
```
O ejecutando el script `start.bat`.

### 2. Iniciar el Portal Web / Cloud (Stakeholders & Compras)
```bash
python app_cloud.py
```

### 3. Compilar Ejecutable de Windows (.exe)
```bash
python build.py
```
o ejecutando:
```bash
build.bat
```
El instalador/ejecutable final se generará automáticamente en `dist/GDSERP/GDSERP.exe`.

---

## ☁️ Sincronización Multi-Equipo (Cloud Sync Relay con Firebase)
El sistema utiliza una arquitectura **Local-First + Cloud Sync Relay**:
- Cada instancia trabaja de forma 100% autónoma y rápida leyendo y escribiendo en su propia base de datos **SQLite local (`control_interno.db`)**.
- Para sincronizar múltiples computadoras o instancias web en la nube en tiempo real:
  1. Descarga el archivo de credenciales de Firebase `firebase_credentials.json` desde Firebase Console (o establece la variable de entorno `FIREBASE_CREDENTIALS_JSON`).
  2. Coloca `firebase_credentials.json` en la raíz del proyecto o junto al ejecutable.
  3. El motor `firebase_sync.py` se activará automáticamente e intercambiará deltas entre todas las instancias vinculadas.

---

## 🔒 Privacidad y Seguridad
- Todas las credenciales y datos contables se almacenan de forma local en SQLite (`control_interno.db`) y se replican exclusivamente hacia el proyecto privado de Firebase Cloud Firestore configurado por el usuario.
- No se envía información a servidores de terceros, excepto las consultas estrictamente dirigidas a la API oficial de Google Gemini o al portal oficial de ARCA/AFIP.
