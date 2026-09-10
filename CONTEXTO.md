# 📌 CONTEXTO TÉCNICO Y ARQUITECTURA DEL PROYECTO ERP GDS (Rama Web)

Este documento sirve como **Guía Completa de Contexto Técnico** para desarrolladores, modelos de Inteligencia Artificial (LLMs) y herramientas agentic que colaboren en el proyecto **ERP GDS (Rama Web)**.

---

## 🎯 1. Visión General del Sistema
**ERP GDS** es una plataforma integral de gestión comercial, contable, financiera y de control interno adaptada para empresas y locales gastronómicos/comerciales. La **Rama Web** incorpora además un portal web independiente en la nube para socios y directivos (*Stakeholders*), categorización jerárquica de compras (Rubros y Subcategorías), gestión de nombres de fantasía (Alias de Proveedores) y sincronización en tiempo real vía Firebase Cloud Firestore.

### Funcionalidades Principales:
1. **Dashboard de la Empresa**:
   - Visión ejecutiva global de Ingresos vs. Egresos y Rentabilidad Neta.
   - Margen de Rentabilidad (%).
   - **Métricas de Cubiertos (CUB)**: Total comensales, Promedio diario, Mejor día de cubiertos (con fecha, cantidad y recaudación) y Ticket promedio por cubierto.
   - Gráficos interactivos en Chart.js: Estructura Financiera y Evolución Diaria de Cubiertos (CUB) vs. Recaudación ($).
2. **Alivios & Conciliación de Recaudación**:
   - Conciliación diaria entre ventas registradas en Maxirest y dinero real percibido por plataformas (NAVE, MercadoPago, PedidosYa, Banco y Lotes de Alivios en Efectivo).
   - Control de **Cubiertos (CUB)** por día.
3. **Retiros & Pagos Directos de Recaudación**:
   - Registro de salidas de dinero desde los fondos recaudados (Efectivo, MercadoPago o Banco) para adelantos de sueldos, proveedores no registrados u otros fines.
   - Descuento directo en los balances contables de la empresa.
4. **Control de Estacionamiento**:
   - Arqueo de TicketControl vs. cobros reales en Efectivo y MercadoPago.
   - Control de gastos operativos fijos propios del sector.
5. **Caja Chica & Arqueo Físico de Billetes**:
   - Movimientos de egresos e ingresos categorizados por responsable y motivo.
   - Arqueo detallado de denominaciones de billetes ($20.000 a $20) con cálculo de diferencia contra el fondo en sistema.
6. **Gastos Fijos & Netos**:
   - Gestión mensual de costos estructurales (Alquiler, Servicios, Impuestos, Sueldos fijos).
   - Función para copiar automáticamente la estructura de gastos del mes anterior.
7. **Portal Cloud para Stakeholders & Directivos (`app_cloud.py`)**:
   - Acceso seguro mediante PIN configurable.
   - Consulta y control de compras ARCA, estado de pagos y método de pago asignado (Efectivo, Galicia, Mercado Pago, Tarjeta de Crédito).
   - Dashboard analítico con evolución mensual, métodos de pago, top proveedores y distribución por rubros.
8. **Gestor de Categorías & Subcategorías de Gastos (Rubros)**:
   - Árbol jerárquico de categorías y subcategorías (ej: Carnes > Vacuno, Limpieza > Químicos).
   - Sincronización bidireccional automática con Firestore (`categorias_gastos`).
9. **Asignación de Nombres de Fantasía (Alias de Proveedores)**:
   - Mapeo de razones sociales oficiales de ARCA a nombres comerciales amigables (ej: "PEPE CONGELADOS") con asignación directa de rubro y subcategoría.
10. **Procesador Inteligente de Facturas (OCR + IA Gemini)**:
    - Monitoreo automático de facturas en PDF e imagen.
    - Clasificación Multinivel por CUIT, CAE, Regex y Keywords.
    - Rescate mediante IA (Google Gemini API) para facturas complejas o ilegibles.
11. **Bot de Sincronización Automática con ARCA (ex AFIP)**:
    - Bot con Selenium WebDriver que automatiza el ingreso al portal de ARCA y descarga "Mis Comprobantes Recibidos".
    - Registro automático de proveedores e importación a la base de datos.
12. **Motor de Sincronización Firebase Relay (`firebase_sync.py`)**:
    - Sincronización de deltas entre múltiples equipos y la nube a costo $0.
    - Escuchador en tiempo real (`on_snapshot`) y resolución de conflictos.

---

## 🛠️ 2. Pila Tecnológica (Stack)

- **Lenguaje Principal**: Python 3.10+
- **Framework Web Backend**: Flask (`app.py` para local/desktop y `app_cloud.py` para despliegue web/cloud)
- **Base de Datos**: SQLite 3 (`registros/control_interno.db` gestionado vía `db_manager.py`)
- **Sincronización Cloud**: Firebase Admin SDK & Google Cloud Firestore (`firebase_sync.py`)
- **Automatización Web**: Selenium WebDriver Headless (`arca_bot.py`)
- **Procesamiento de Documentos / OCR**:
  - `PyPDFium2` & `pdfplumber` (Lectura nativa de texto PDF)
  - `Pytesseract` (OCR local para imágenes/escaneos)
  - `Google Generative AI SDK` (`google-generativeai` / Gemini API)
- **Frontend**:
  - HTML5 Semántico (`templates/index.html` para ERP principal, `templates/stakeholders.html` para portal web)
  - Vanilla CSS3 (`static/css/style.css` con Impeccable Light Theme, variables CSS, glassmorphism)
  - Vanilla JavaScript ES6+ (`static/js/main.js` y `static/js/stakeholders.js`)
  - `Chart.js v4.4.0` (Gráficos estadísticos dinámicos)
  - `Driver.js` (Tours guiados interactivos)

---

## 📁 3. Mapa y Estructura del Código

```
ERPGDS/
├── app.py                     # Servidor Flask principal (Desktop / Local)
├── app_cloud.py               # Servidor Flask optimizado para Cloud / Stakeholders Web
├── db_manager.py              # Administrador de SQLite (Esquema de 13 tablas y conexión WAL)
├── firebase_sync.py           # Motor de sincronización bidireccional en tiempo real con Firestore
├── processor.py               # Motor OCR, parsing de facturas, OCR Gemini y organización
├── arca_bot.py                # Bot Selenium para automatización del portal ARCA (AFIP)
├── doctor.py                  # Módulo de diagnóstico y reparación de inconsistencias
├── config.py                  # Variables de entorno, rutas base y deobfuscation de API Keys
├── watcher.py                 # Vigía de carpetas para procesamiento automático en tiempo real
├── reset.py                   # Script de restablecimiento a fábrica (Limpieza a 0 registros)
├── suppliers.json             # Catálogo de reglas de reconocimiento de proveedores
├── templates/
│   ├── index.html             # Vista principal ERP Desktop (Conciliación, Caja, Facturas, Gastos)
│   └── stakeholders.html      # Portal Web para Stakeholders (Compras, Cuentas, Rubros, Dashboard)
├── static/
│   ├── css/style.css          # Sistema de diseño, temas de color y estilos Impeccable Light
│   ├── js/main.js             # Lógica cliente del ERP Desktop
│   └── js/stakeholders.js     # Lógica cliente del Portal Stakeholders & Gestor de Rubros
├── Facturas_A_Procesar/        # Entrada de comprobantes pendientes
├── Facturas_Procesadas/       # Organización: YYYY/Mes/Proveedor/archivo.pdf
├── Facturas_No_Reconocidas/   # Archivos sin proveedor reconocido o con error
├── Remitos/                   # Documentos no fiscales
├── CSV ARCA/                  # Reportes CSV descargados de ARCA
└── registros/
    └── control_interno.db     # Base de Datos SQLite (Única Fuente de Verdad)
```

---

## 🗄️ 4. Esquema Completo de Base de Datos (`control_interno.db`)

La base de datos contiene **13 tablas relacionales**:

1. **`recaudacion_diaria`**:
   - `id`, `fecha` (TEXT UNIQUE), `dia_nombre`, `efectivo_cub`, `cubiertos` (INTEGER), `nave_real`, `nave_maxi`, `diff_nave`, `efectivo_real`, `efectivo_maxi`, `diff_efectivo`, `py_real`, `py_maxi`, `diff_py`, `mp_real`, `mp_maxi`, `diff_mp`, `banco_real`, `banco_maxi`, `diff_banco`, `total_diario`, `diferencia_total`, `proyeccion_recaudacion`, `comentario`, `diff_proyeccion`, `lotes_json`, `es_feriado`, `uuid`, `updated_at`, `sync_status`.
2. **`estacionamiento_diario`**:
   - `id`, `fecha` (TEXT UNIQUE), `dia_nombre`, `caja_ticketcontrol`, `controlado_cash`, `controlado_mp`, `total`, `diferencia`, `comentario`, `uuid`, `updated_at`, `sync_status`.
3. **`estacionamiento_gastos`**:
   - `id`, `concepto` (TEXT UNIQUE), `monto`, `uuid`, `updated_at`, `sync_status`.
4. **`caja_chica_movimientos`**:
   - `id`, `fecha`, `monto_retirado`, `monto_ingresado`, `motivo`, `responsable`, `categoria`, `uuid`, `updated_at`, `sync_status`.
5. **`caja_chica_arqueo`**:
   - `id`, `fecha` (TEXT UNIQUE), `b_20000`, `b_10000`, `b_2000`, `b_1000`, `b_500`, `b_200`, `b_100`, `b_50`, `b_20`, `total_efectivo_contado`, `diferencia_arqueo`, `uuid`, `updated_at`, `sync_status`.
6. **`gastos_fijos`**:
   - `id`, `concepto`, `monto_mensual`, `mes`, `uuid`, `updated_at`, `sync_status`.
7. **`arca_compras_csv`**:
   - `id`, `fecha_emision`, `punto_venta`, `nro_doc_emisor`, `denominacion_emisor`, `total_iva`, `imp_total`, `mes`, `estado`, `factura_recibida`, `metodo_pago`, `fecha_pago`, `cae`, `nro_comprobante`, `tipo_comprobante`, `es_retroactiva`, `fecha_importacion`, `categoria_pago`, `uuid`, `updated_at`, `sync_status`.
8. **`arca_compras_snapshots`**:
   - `id`, `timestamp`, `origen`, `total_compras_pre`, `max_fechas_mes_json`, `max_fechas_proveedor_json`.
9. **`proveedores_cuentas_pagar`**:
   - `id`, `proveedor_nombre`, `factura_numero`, `fecha`, `monto_total`, `estado`, `monto_pagado`, `fecha_pago`, `medio_pago`, `categoria_pago`, `uuid`, `updated_at`, `sync_status`.
10. **`proveedores`**:
    - `id`, `nombre` (TEXT UNIQUE), `cuit`, `categoria`, `keywords`, `detalles`, `alias`, `subcategoria`, `is_deleted`, `uuid`, `updated_at`, `sync_status`.
11. **`facturas_procesadas`**:
    - `id`, `year`, `month`, `supplier`, `filename`, `filepath`, `total`, `cuit`, `cae`, `fecha`, `fecha_procesado`, `uuid`, `updated_at`, `sync_status`.
12. **`retiros_recaudacion`**:
    - `id`, `fecha`, `monto`, `medio_pago` ('Efectivo', 'MercadoPago', 'Banco'), `motivo`, `responsable`, `comentario`, `origen`, `uuid`, `updated_at`, `sync_status`.
13. **`categorias_gastos`**:
    - `id`, `nombre` (TEXT NOT NULL), `padre_id` (INTEGER, subcategorías), `icono`, `color`, `uuid` (UNIQUE), `updated_at`, `sync_status`.
14. **`configuraciones`**:
    - `clave` (TEXT PRIMARY KEY), `valor`.

---

## 🌐 5. Endpoints de la API Flask

### 🔐 Autenticación Stakeholders (`app_cloud.py`)
- `POST /api/auth/login`: Validación de PIN de acceso al portal web.
- `GET /api/auth/check`: Verificación de sesión activa de stakeholder.
- `POST /api/auth/logout`: Cierre de sesión.

### 🏷️ Categorías & Rubros (`app.py` & `app_cloud.py`)
- `GET /api/categorias`: Retorna el árbol (`tree`) y lista plana (`flat`) de categorías y subcategorías.
- `POST /api/categorias`: Crea una categoría principal o subcategoría y sincroniza con Firestore.
- `DELETE /api/categorias/<id>`: Elimina una categoría/subcategoría en SQLite y en Firestore.

### 🏢 Proveedores & Nombres de Fantasía (Alias)
- `GET /api/suppliers`: Lista única de proveedores y metadatos.
- `GET /api/proveedores/alias`: Lista completa de proveedores para la grilla de alias y rubros.
- `POST /api/proveedores/alias`: Actualiza nombre de fantasía (alias), categoría y subcategoría de un proveedor.
- `POST /api/proveedores/<id>/categoria`: Actualiza exclusivamente categoría y subcategoría.

### 📊 Dashboard & Métricas Cloud
- `GET /api/dashboard/stats?mes=YYYY-MM`: Retorna métricas de compras, evolución mensual, distribución por métodos de pago y desglose por rubro para Stakeholders.
- `GET /api/dashboard/empresa?mes=YYYY-MM`: Resumen financiero integral (ingresos, egresos, rentabilidad neta, cubiertos).

### ☁️ Sincronización Firebase
- `GET /api/firebase/status`: Estado de la sincronización (Online/Offline, registros pendientes y sincronizados).
- `POST /api/firebase/sync_now`: Ejecuta un ciclo inmediato de push y pull.
- `POST /api/firebase/full_resync`: Reconciliación completa forzada contra Firestore.

---

## 🎨 6. Principios de Diseño y Buenas Prácticas

1. **Única Fuente de Verdad (Single Source of Truth)**:
   - SQLite (`registros/control_interno.db`) es la fuente principal local respaldada en Firebase Firestore mediante `firebase_sync.py`. Nunca utilizar `localStorage` para persistir datos del negocio.
2. **Alto Contraste y Estética Impeccable Light**:
   - Paleta de diseño luminosa y limpia con variables CSS (`var(--text-primary)`, `var(--primary-accent)`). Evitar estilos inline con texto blanco sobre fondos claros.
3. **Sincronización Transparente**:
   - Toda mutación de datos (`INSERT`, `UPDATE`, `DELETE`) en tablas sincronizadas genera o mantiene su `uuid`, actualiza `updated_at`, marca `sync_status = 0` y ejecuta un ciclo de `sync_cycle()`.

---

## 🚀 7. Ejecución y Desarrollo

- **Iniciar el ERP Desktop (Completo)**:
  ```bash
  python app.py
  ```
- **Iniciar el Portal Web Cloud (Stakeholders)**:
  ```bash
  python app_cloud.py
  ```
- **Resetear a Fábrica (0 registros)**:
  ```bash
  python reset.py --force
  ```
- **Compilar Ejecutable Windows**:
  ```bash
  build.bat
  ```
