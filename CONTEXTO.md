# 📌 CONTEXTO TÉCNICO Y ARQUITECTURA DEL PROYECTO ERP GDS

Este documento sirve como **Guía Completa de Contexto Técnico** para desarrolladores, modelos de Inteligencia Artificial (LLMs) y herramientas agentic que colaboren en el proyecto **ERP GDS**.

---

## 🎯 1. Visión General del Sistema
**ERP GDS** es una plataforma integral de gestión comercial, contable, financiera y de control interno especialmente adaptada para empresas y locales gastronómicos/comerciales.

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
7. **Procesador Inteligente de Facturas (OCR + IA Gemini)**:
   - Monitoreo automático de facturas en PDF e imagen.
   - Clasificación Multinivel por CUIT, CAE, Regex y Keywords.
   - Rescate mediante IA (Google Gemini API) para facturas complejas o ilegibles.
8. **Bot de Sincronización Automática con ARCA (ex AFIP)**:
   - Bot con Selenium WebDriver que automatiza el ingreso al portal de ARCA y descarga "Mis Comprobantes Recibidos".
   - Registro automático de proveedores e importación a la base de datos.
9. **Doctor de Diagnóstico & Curación**:
   - Escaneo y reparación de anomalías en base de datos e inconsistencias de archivos.

---

## 🛠️ 2. Pila Tecnológica (Stack)

- **Lenguaje Principal**: Python 3.10+
- **Framework Web Backend**: Flask (`app.py`, ejecución multihilo)
- **Base de Datos**: SQLite 3 (`registros/control_interno.db` vía `db_manager.py`)
- **Automatización Web**: Selenium WebDriver Headless (`arca_bot.py`)
- **Procesamiento de Documentos / OCR**:
  - `PyPDFium2` & `pdfplumber` (Lectura nativa de texto PDF)
  - `Pytesseract` (OCR local para imágenes/escaneos)
  - `Google Generative AI SDK` (`google-generativeai` / Gemini API)
- **Frontend**:
  - HTML5 Semántico (`templates/index.html`)
  - Vanilla CSS3 (`static/css/style.css` con Impeccable Light Theme, variables CSS, glassmorphism)
  - Vanilla JavaScript ES6+ (`static/js/main.js`)
  - `Chart.js v4.4.0` (Gráficos estadísticos dinámicos)
  - `Driver.js` (Tours guiados interactivos)

---

## 📁 3. Mapa y Estructura del Código

```
ERPGDS/
├── app.py                     # Servidor Flask, API REST Endpoints y manejo de solicitudes
├── db_manager.py              # Administrador de SQLite (Esquema de 12 tablas y conexión)
├── processor.py               # Motor OCR, parsing de facturas, OCR Gemini y organización de archivos
├── arca_bot.py                # Bot Selenium para automatización del portal ARCA (AFIP)
├── doctor.py                  # Módulo de diagnóstico y reparación de inconsistencias
├── config.py                  # Variables de entorno, rutas base y deobfuscation de API Keys
├── watcher.py                 # Vigía de carpetas para procesamiento automático en tiempo real
├── reset.py                   # Script de restablecimiento a fábrica (Limpieza a 0 registros)
├── suppliers.json             # Catálogo de reglas de reconocimiento de proveedores
├── templates/
│   └── index.html             # Vista principal SPA (Secciones, Tablas, Modales, Visuales)
├── static/
│   ├── css/style.css          # Sistema de diseño, temas de color y estilos Impeccable Light
│   └── js/main.js             # Lógica de cliente, llamados a la API, renderizado y Chart.js
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

La base de datos contiene **12 tablas relacionales**:

1. **`recaudacion_diaria`**:
   - `id`, `fecha` (TEXT UNIQUE), `dia_nombre`, `efectivo_cub`, `cubiertos` (INTEGER), `nave_real`, `nave_maxi`, `diff_nave`, `efectivo_real`, `efectivo_maxi`, `diff_efectivo`, `py_real`, `py_maxi`, `diff_py`, `mp_real`, `mp_maxi`, `diff_mp`, `banco_real`, `banco_maxi`, `diff_banco`, `total_diario`, `diferencia_total`, `proyeccion_recaudacion`, `comentario`, `diff_proyeccion`, `lotes_json`, `es_feriado`.
2. **`estacionamiento_diario`**:
   - `id`, `fecha` (TEXT UNIQUE), `dia_nombre`, `caja_ticketcontrol`, `controlado_cash`, `controlado_mp`, `total`, `diferencia`, `comentario`.
3. **`estacionamiento_gastos`**:
   - `id`, `concepto` (TEXT UNIQUE), `monto`.
4. **`caja_chica_movimientos`**:
   - `id`, `fecha`, `monto_retirado`, `monto_ingresado`, `motivo`, `responsable`, `categoria`.
5. **`caja_chica_arqueo`**:
   - `id`, `fecha` (TEXT UNIQUE), `b_20000`, `b_10000`, `b_2000`, `b_1000`, `b_500`, `b_200`, `b_100`, `b_50`, `b_20`, `total_efectivo_contado`, `diferencia_arqueo`.
6. **`gastos_fijos`**:
   - `id`, `concepto`, `monto_mensual`, `mes`.
7. **`arca_compras_csv`**:
   - `id`, `fecha_emision`, `punto_venta`, `nro_doc_emisor`, `denominacion_emisor`, `total_iva`, `imp_total`, `mes`, `estado`, `factura_recibida`, `metodo_pago`, `fecha_pago`, `cae`, `nro_comprobante`.
8. **`proveedores_cuentas_pagar`**:
   - `id`, `proveedor_nombre`, `factura_numero`, `fecha`, `monto_total`, `estado`, `monto_pagado`, `fecha_pago`, `medio_pago`.
9. **`proveedores`**:
   - `id`, `nombre` (TEXT UNIQUE), `cuit`, `categoria`, `keywords`, `detalles`.
10. **`facturas_procesadas`**:
    - `id`, `year`, `month`, `supplier`, `filename`, `filepath`, `total`, `cuit`, `cae`, `fecha`, `fecha_procesado`.
11. **`configuraciones`**:
    - `clave` (TEXT PRIMARY KEY), `valor`.
12. **`retiros_recaudacion`**:
    - `id`, `fecha`, `monto`, `medio_pago` ('Efectivo', 'MercadoPago', 'Banco'), `motivo`, `responsable`, `comentario`.

---

## 🌐 5. Endpoints de la API Flask (`app.py`)

### 📈 Dashboard & Empresa
- `GET /api/dashboard/empresa?mes=YYYY-MM`: Retorna resumen financiero completo (ingresos, egresos con retiros, ganancia neta, margen rentabilidad, métricas avanzadas de cubiertos y array diario para gráficos).
- `GET /api/dashboard/resumen?mes=YYYY-MM`: Retorna totales generales de recaudación, estacionamiento, caja chica, gastos fijos y retiros.
- `GET /api/meses_disponibles`: Lista los meses con actividad registrada en el sistema.

### 🍽️ Recaudación & Alivios
- `GET /api/recaudacion?mes=YYYY-MM`: Lista registros de conciliación diaria.
- `POST /api/recaudacion`: Guarda o actualiza conciliación de recaudación y cubiertos.
- `DELETE /api/recaudacion?fecha=YYYY-MM-DD`: Elimina un registro de recaudación.

### 💸 Retiros de Recaudación
- `GET /api/recaudacion/retiros?mes=YYYY-MM`: Obtiene la lista de retiros directos de los fondos recaudados.
- `POST /api/recaudacion/retiros`: Registra o actualiza un retiro (monto, medio de pago, motivo, responsable).
- `DELETE /api/recaudacion/retiros?id=X`: Elimina un retiro de recaudación.

### 🚗 Estacionamiento
- `GET /api/estacionamiento?mes=YYYY-MM`: Registros diarios de TicketControl vs cobrado.
- `POST /api/estacionamiento`: Guarda/actualiza día de estacionamiento.
- `GET /api/estacionamiento/gastos`: Lista de gastos fijos operativos de estacionamiento.

### 💼 Caja Chica & Arqueo
- `GET /api/caja_chica/movimientos?mes=YYYY-MM`: Movimientos de egresos/ingresos.
- `POST /api/caja_chica/movimientos`: Registra un movimiento de caja.
- `GET/POST /api/caja_chica/arqueo`: Maneja el arqueo físico de billetes por denominación.

### 📊 Gastos Fijos
- `GET /api/gastos_fijos?mes=YYYY-MM`: Lista conceptos de gastos fijos del mes.
- `POST /api/gastos_fijos`: Acciones: `upsert` (crear/editar), `delete` (eliminar), `copiar_mes_anterior` (copia del mes previo).

### 🧾 Facturas, Proveedores y ARCA
- `GET /api/suppliers`: Obtiene la lista de proveedores.
- `GET /api/cuentas_por_pagar?mes=YYYY-MM`: Cuentas pendientes a proveedores.
- `POST /api/cuentas_por_pagar/registrar_pago`: Registra el pago a un proveedor y sincroniza con ARCA.
- `GET /api/arca_compras?mes=YYYY-MM`: Compras ARCA sincronizadas desde CSV.
- `POST /api/arca/sync`: Inicia la sincronización automática con Selenium.

---

## 🎨 6. Principios de Diseño y Buenas Prácticas

1. **Única Fuente de Verdad (Single Source of Truth)**:
   - Todos los módulos leen y escriben en SQLite (`control_interno.db`). No usar `localStorage` para datos del negocio.
2. **Alto Contraste y Estética Premium**:
   - Utilizar el tema claro Impeccable Light.
   - En elementos con fondo claro, asegurar que el texto sea oscuro usando `var(--text-primary)` en lugar de tonos blancos hardcodeados.
3. **Filtro Global por Período**:
   - Todas las llamadas API respetan el mes seleccionado en la barra superior (`currentSelectedMonth`).
4. **Resiliencia y Manejo de Errores**:
   - Todas las operaciones en la base de datos deben cerrar sus conexiones en bloques `finally` o tras ejecutar el `commit`.
   - Utilizar notificaciones tipo Toast (`showToast()`) en el frontend ante éxitos o errores.

---

## 🚀 7. Ejecución y Desarrollo

- **Iniciar la Aplicación**:
  ```bash
  python app.py
  ```
- **Resetear a Fábrica (0 registros)**:
  ```bash
  python reset.py --force
  ```
- **Compilar Ejecutable Windows**:
  ```bash
  build.bat
  ```
