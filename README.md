# 🧾 ERP GDS (GDSERP) - Sistema de Gestión Comercial, Organizacional e Integrador Inteligente con ARCA

**ERP GDS** es una plataforma de gestión empresarial e integrador inteligente para Windows y entornos Cloud. Administra el control financiero, conciliaciones de recaudación diaria, estacionamiento, caja chica, gastos fijos, cuentas a pagar y la organización automatizada de facturas PDF e imágenes (PNG, JPG, BMP, TIFF), sincronizándose automáticamente con el portal de **ARCA (ex AFIP)** y en tiempo real vía **Firebase Cloud Firestore**.

Los archivos procesados se organizan de forma jerárquica en el sistema de archivos bajo la estructura:
```
/Facturas_Procesadas/YYYY/Mes/Nombre de Proveedor/
```

---

## 🎨 Diseño & Estética (Impeccable Light Theme)
- **Interfaz Minimalista y Premium:** Tema claro (*White Mode*) de alto contraste, tipografía moderna, micro-animaciones fluidas y tarjetas tipo glassmorphism.
- **Navegación Colapsable:** Menú lateral inteligente con soporte para grupos desplegables y colapsables ("Facturas").
- **Copiado Rápido con Botones Transparentes:** Botones sutiles integrados en las grillas para copiar la Razón Social Oficial completa y el CUIT al portapapeles con confirmación visual interactiva.
- **Modo Privacidad:** Ocultamiento instantáneo de montos y totales con asteriscos (`$ ***.***`) para visualización protegida en público.
- **Componentes Modales:** Ventanas emergentes nativas en HTML/CSS para registro de movimientos de Caja Chica, modales de pagos categorizados y configuración de credenciales, eliminando diálogos bloqueantes del navegador.

---

## 🗄️ Arquitectura Unificada en SQLite (`control_interno.db`)

Toda la plataforma utiliza la base de datos **SQLite (`control_interno.db`)** como la **Única Fuente de Verdad** (*Single Source of Truth*), garantizando portabilidad, modo WAL de alta concurrencia y persistencia de datos tanto en equipos locales como en la nube.

### Tablas de la Base de Datos (14 Tablas Relacionales):
1. `recaudacion_diaria`: Conciliación diaria entre Maxirest, Nave, MercadoPago, Banco, efectivo y comensales (Cubiertos CUB).
2. `estacionamiento_diario`: Arqueo diario de TicketControl vs cobros en efectivo y MercadoPago.
3. `estacionamiento_gastos`: Control de gastos operativos fijos del sector estacionamiento.
4. `caja_chica_movimientos`: Registro de egresos e ingresos de caja chica con categorías y responsables.
5. `caja_chica_arqueo`: Arqueo físico de billetes ($20.000 a $20) y cálculo de diferencia de caja.
6. `gastos_fijos`: Dashboard mensual de gastos estructurales y cálculo de rentabilidad neta.
7. `arca_compras_csv`: Reportes y estado de comprobantes de "Mis Comprobantes Recibidos" de ARCA, notas de crédito y retroactivas.
8. `arca_compras_snapshots`: Historial de estados previos a sincronizaciones e importaciones masivas.
9. `proveedores_cuentas_pagar`: Seguimiento de facturas adeudadas y pagos a proveedores.
10. `proveedores`: Catálogo central de proveedores, CUITs, categorías, subcategorías y nombres de fantasía (Alias).
11. `facturas_procesadas`: Registro de facturas digitalizadas y comprobantes reconocidos por OCR.
12. `retiros_recaudacion`: Salidas de dinero directas de los fondos recaudados (Efectivo, MP, Banco) con impacto contable.
13. `categorias_gastos`: Estructura jerárquica de rubros y subcategorías de gastos sincronizada bidireccionalmente con la nube.
14. `configuraciones`: Configuración del sistema (API Keys, CUIT empresa, credenciales ARCA, tours y preferencias).

---

## 🚀 Características Principales

1. 🌐 **Portal Cloud para Stakeholders & Directivos (`app_cloud.py`):**
   - Acceso web protegido mediante PIN seguro (`STAKEHOLDER_PIN = '2203'`).
   - **Sincronización Automática con Firebase al Ingresar:** Al acceder al portal, se realiza una reconciliación completa con la nube en segundo plano, sin requerir presionar el botón manual.
   - **Registro de Pagos Categorizados:** Asignación obligatoria de Categoría de Pago (*Pinamar, Leloir, Socios*) y Método de Pago (*Galicia, Mercado Pago, Efectivo, Tarjeta crédito*).
   - Exportación e importación directa a planillas Excel (`.xlsx`) mediante `openpyxl`.

2. 🏢 **Gestor de Alias & Rubros de Proveedores:**
   - Asignación de nombres de fantasía y vinculación a categorías y subcategorías analíticas.
   - **Botones Transparentes para Copiar Proveedor y CUIT:** Permiten copiar al portapapeles la razón social oficial sin truncar y el CUIT con un solo toque.

3. 🤖 **Bot de Sincronización Automática con ARCA:**
   - Descarga automatizada de "Mis Comprobantes Recibidos" desde el portal fiscal usando Selenium WebDriver Headless.
   - Registro automático de nuevos proveedores en la base de datos SQLite en tiempo real.

4. 🔍 **Motor de Matching Multinivel de Facturas:**
   - **Tier 1 (CAE):** Cruce exacto con Código de Autorización Electrónico en reportes ARCA.
   - **Tier 2 (CUIT):** Identificación inequívoca por CUIT del emisor.
   - **Tier 3 (Keywords & Regex):** Reconocimiento inteligente por Razón Social y patrones de numeración.
   - **Tier 4 (IA Gemini):** Extracción y rescate asistido de facturas escaneadas complejas o ilegibles.

5. 💵 **Caja Chica & Arqueo de Billetes:**
   - Registro guiado de ingresos y egresos clasificados por motivo y responsable.
   - Arqueo detallado de billetes físicos con alerta inmediata de sobrantes o faltantes.

6. 🔄 **Restablecimiento Completo a Fábrica (`reset.py`):**
   - Limpieza completa de archivos temporales, comprobantes y vaciado de todas las tablas de SQLite a 0 registros:
     ```bash
     python reset.py --force
     ```

---

## 🛠️ Tecnologías Utilizadas

### Backend & Automatización (Python 3.10+)
* **Flask & WSGI:** Servidor HTTP multihilo (`app.py` y `app_cloud.py`).
* **Waitress & Gunicorn:** Servidores WSGI de producción para Windows y Linux.
* **SQLite3 (`db_manager.py`):** Base de datos relacional con transacciones WAL.
* **Firebase Admin SDK (`firebase_sync.py`):** Motor de sincronización en tiempo real y relay Firestore.
* **Selenium WebDriver (`Edge / Chrome Headless`):** Bot automatizado para portal ARCA/AFIP.
* **Google Generative AI SDK (Gemini):** OCR inteligente y clasificación asistida.
* **PyPDFium2 & pdfplumber:** Extracción nativa de texto de archivos PDF.
* **Pytesseract (Tesseract OCR):** Reconocimiento óptico de caracteres para documentos escaneados.
* **OpenPyXL:** Procesamiento, lectura y generación de archivos Excel `.xlsx`.

### Frontend (Interfaz de Usuario)
* **HTML5 Semántico & Vanilla CSS3:** Diseño Impeccable Light Mode con variables CSS y glassmorphism.
* **Vanilla JavaScript ES6+ (SPA):** Arquitectura reactiva sin dependencias pesadas.
* **Chart.js v4.4.0:** Gráficos analíticos y evoluciones financieras.
* **FontAwesome 6.5.1:** Iconografía vectorial completa.
* **Driver.js:** Guías interactivas paso a paso.

---

## 📋 Requisitos del Sistema (Dependencias Externas)

Para OCR y escaneo físico local, se requiere:

1. **Tesseract OCR (Para imágenes y PDFs escaneados)**
   - Ruta esperada: `C:\Program Files\Tesseract-OCR\tesseract.exe`
   - Descarga: [UB-Mannheim Tesseract Wiki](https://github.com/UB-Mannheim/tesseract/wiki)

2. **NAPS2 (Para escaneo desde escáner físico)**
   - Ruta esperada: `C:\Program Files\NAPS2\NAPS2.Console.exe`
   - Descarga: [naps2.com](https://www.naps2.com/)

---

## 📂 Modos de Ejecución

### 1. Iniciar el ERP Desktop Local
```bash
python app.py
```
O ejecutando el script `start.bat`.

### 2. Iniciar el Portal Cloud para Stakeholders
```bash
python app_cloud.py
```

### 3. Sincronización Automática con ARCA
1. Abre la aplicación y dirígete al módulo de **Ajustes** o pulsa **Sincronizar ARCA**.
2. Ingresa CUIT, Clave Fiscal y la Razón Social a representar.
3. El bot descargará los comprobantes y actualizará los proveedores automáticamente en SQLite.

### 4. Compilar Ejecutable de Windows (.exe)
```bash
build.bat
```
El instalador/ejecutable final se generará automáticamente en `dist/GDSERP/GDSERP.exe`.

---

## ☁️ Sincronización Multi-Equipo (Cloud Sync Relay con Firebase)
El sistema utiliza una arquitectura **Local-First + Cloud Sync Relay**:
- Cada computadora trabaja de forma autónoma y rápida leyendo y escribiendo en su propia base de datos **SQLite local (`control_interno.db`)**.
- Para sincronizar múltiples equipos en tiempo real:
  1. Descarga el archivo de credenciales `firebase_credentials.json` desde Firebase Console.
  2. Coloca `firebase_credentials.json` en la raíz del proyecto o junto al ejecutable.
  3. El motor `firebase_sync.py` se activará automáticamente, escuchando eventos remotos (`on_snapshot`) y reconciliando deltas de manera bidireccional.
  4. Al ingresar al Portal Web, la sincronización se dispara de forma automática sin necesidad de hacer clic manual.

---

## 🔒 Privacidad y Seguridad
- Todas las credenciales y datos contables se almacenan de forma local en la base de datos SQLite (`control_interno.db`).
- Las conexiones cloud se limitan exclusivamente al proyecto privado de Firebase Cloud Firestore, al portal de ARCA/AFIP o a la API oficial de Google Gemini.
