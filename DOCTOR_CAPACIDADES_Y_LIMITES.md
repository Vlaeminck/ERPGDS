# 🩺 DOCTOR IA — Capacidades, Arquitectura, Diagnósticos y Límites

El módulo **Doctor** (`doctor.py`) es el subsistema de auditoría integral, diagnóstico clínico y reparación automática de inconsistencias contables y de almacenamiento en **ERP GDS**. 

Combina reglas heurísticas de normalización de sistemas de archivos, cruces fiscales determinísticos con **ARCA (ex AFIP)** y análisis visual multimodal con **Inteligencia Artificial (Gemini Vision)**.

---

## 🏗️ 1. Arquitectura y Filosofía de Diseño

El Doctor opera bajo los siguientes principios:
1. **Doble Validación (Fiscal + IA)**: La información fiscal de ARCA es la verdad legal de máxima prioridad; la IA actúa como decodificador visual cuando no existe capa de texto legible o el comprobante es emitido fuera de los reportes fiscales precargados.
2. **Sincronización Transaccional Simétrica**: Cualquier cura en el sistema de archivos (disco) se replica instantáneamente en la base de datos SQLite (`facturas_procesadas`, `proveedores`, `arca_compras_csv`) y activa `sync_status = 0` para sincronización con Firebase Cloud.
3. **Inmunidad a Archivos del Sistema Operativo**: Los metadatos de Windows (`desktop.ini`, `Thumbs.db`) son ignorados en el análisis y limpiados al momento de podar directorios vacíos sin arrojar falsos positivos.
4. **Tolerancia a Truncamiento de Directorios de Windows**: Windows suprime automáticamente puntos finales (`.`) al crear carpetas (ej. `Il Sapore Italiano S.R.L.` se convierte físicamente en `Il Sapore Italiano S.R.L`). El Doctor normaliza cadenas removiendo sufijos societarios y puntuación para evitar clasificaciones erróneas.

---

## ⚡ 2. Capacidades y Tipos de Diagnóstico

### A. Detección y Curación de Proveedores Inexistentes (`proveedor_inexistente`)
- **Problema detectado**: Una factura fue archivada en una carpeta cuyo nombre no existe en el catálogo de proveedores ni en los reportes de ARCA.
- **Capacidad de Cura**:
  1. Extrae el número de comprobante (`PV - Número`) del nombre del archivo o del texto.
  2. Cruza contra `arca_compras_csv`. Si hay coincidencia, recupera Razón Social oficial y CUIT fiscal exacto de ARCA.
  3. Si no hay registro en ARCA, invoca a **Gemini Vision**, que lee el membrete, CUIT del emisor, punto de venta y número.
  4. Mueve físicamente el PDF a `Facturas_Procesadas/YYYY/Mes/ProveedorOficial/`.
  5. Actualiza la tabla SQLite `facturas_procesadas` (`supplier`, `filepath`, `cuit`, `cae`).
  6. Si el proveedor es nuevo y legítimo, lo registra automáticamente en la tabla `proveedores` de SQLite y en `suppliers.json`.
  7. Elimina la carpeta vieja que quedó vacía.

### B. Detección de Proveedores Incongruentes / Falso Match (`proveedor_incongruente`)
- **Problema detectado**: Una factura fue guardada dentro de la carpeta de un proveedor reconocido (ej. `Maree`), pero su CUIT, CAE o número fiscal corresponde a otro (ej. `Coca-Cola FEMSA`).
- **Capacidad de Cura**:
  - Reasigna el comprobante a la carpeta y proveedor correcto en disco y base de datos.
  - Elimina el vínculo incorrecto y vincula el comprobante con la fila correcta de ARCA Compras.

### C. Recuperación de Comprobantes No Reconocidos (`factura_no_reconocida_recuperable`)
- **Problema detectado**: Archivos alojados en `Facturas_No_Reconocidas/` (como duplicados con prefijo `DUPLICADA-` o fallos iniciales de OCR).
- **Capacidad de Cura**:
  - Lee el documento mediante cruce fiscal o IA, identifica al emisor y propone reincorporarlo al flujo regular de facturas procesadas.

### D. Detección y Poda de Carpetas Vacías (`carpeta_vacia`)
- **Problema detectado**: Directorios de años, meses o proveedores sin archivos de comprobantes válidos (o que solo contienen archivos ocultos del sistema como `desktop.ini`).
- **Capacidad de Cura**:
  - Limpia atributos de sólo lectura de Windows (`stat.S_IWRITE`) y elimina la carpeta de forma limpia sin generar bloqueos de permisos (`WinError 5: Acceso denegado`).

### E. Archivos Desubicados (`archivo_desubicado`)
- **Problema detectado**: Facturas depositadas directamente en la raíz de `Facturas_Procesadas/` o dentro de la carpeta de año o mes sin estar contenidas en una carpeta de proveedor.
- **Capacidad de Cura**:
  - Analiza el documento con el Cerebro IA, determina su emisor, año y mes, y lo traslada a su árbol jerárquico correspondiente. Si no puede identificarse, lo mueve a `Facturas_No_Reconocidas/`.

### F. Registros Huérfanos en Base de Datos (`db_archivo_huerfano`)
- **Problema detectado**: Filas en la tabla `facturas_procesadas` de SQLite cuyo archivo físico fue borrado o trasladado externamente.
- **Capacidad de Cura**:
  - Marca la fila como `is_deleted = 1` y actualiza la fecha para que el Portal Web y los clientes móviles dejen de mostrar el archivo ausente.

---

## 🛡️ 3. Mecanismos de Blindaje Implementados

### Filtro Anti-Secuestro de Keywords
Cuando la IA descubre o rescata un proveedor nuevo, el método `save_ai_supplier` filtra estrictamente:
- Palabras clave asociadas a la empresa compradora (`Gastro Market`, `Paysandú`, `Ituzaingó`).
- Marcas notorias protegidas (`coca`, `femsa`): Si el nombre del nuevo proveedor no contiene explícitamente estas marcas, se le prohíbe almacenar keywords asociadas, evitando que secuestre facturas de otros proveedores en escaneos futuros.

### Enrutamiento Determinístico por Punto de Venta Fiscal
Para emisores recurrentes con impresión difícil (matriz de puntos, bajo contraste), los puntos de venta oficiales registrados en ARCA (como `0611` y `0610` para Coca-Cola FEMSA) tienen prioridad absoluta sobre cualquier inferencia textual de OCR, garantizando imputación exacta aun si el texto es borroso.

---

## ⚠️ 4. Límites Operativos del Doctor

A pesar de su capacidad diagnóstica, existen fronteras técnicas que el Doctor no puede resolver sin intervención humana:

1. **Documentos Físicos Severamente Dañados o Truncados**:
   - Si una factura escaneada tiene el encabezado cortado (sin membrete, sin logo y sin CUIT legible) y el número de comprobante tampoco figura en el reporte mensual de ARCA, la IA no puede inventar el emisor. El archivo permanecerá catalogado como `solicitar_asignacion`.
2. **Facturas No Registradas en ARCA y Sin Datos Fiscales**:
   - Comprobantes emitidos en períodos aún no importados en el CSV de ARCA y cuyo texto en la imagen sea completamente ilegible (ej. resolución inferior a 72 DPI, desenfoque de movimiento extremo del escáner).
3. **Documentos No Fiscales sin Membrete (Remitos informales o notas manuscritas)**:
   - Si el documento no posee CUIT ni razón social impresa, el Doctor no podrá imputarlo automáticamente a una cuenta contable sin que el usuario especifique el proveedor en la interfaz.
4. **Colisiones de Facturas Duplicadas Físicas**:
   - Si dos facturas tienen el mismo número de comprobante, mismo importe y mismo proveedor, pero provienen de archivos distintos, el Doctor renombrará el segundo con el sufijo `_CORREGIDO_[hash]` para prevenir sobreescrituras accidentales en disco, dejando la decisión final de borrado al usuario.
5. **Dependencia de Conectividad para IA Externa**:
   - El diagnóstico fiscal vía ARCA es 100% local y autónomo (en SQLite). Sin embargo, el fallback de visión profunda depende de la conectividad con la API de Google Gemini (`gemini-2.5-flash-lite`). En caso de corte de Internet, el Doctor solo aplicará las curas fiscales y heurísticas locales.

---

## 📊 5. Matriz de Severidad y Acciones de Diagnóstico

| Tipo de Anomalía | Severidad | Diagnóstico Inteligente | Acción Automática / Cura |
| :--- | :---: | :--- | :--- |
| `proveedor_inexistente` | **Alta (High)** | Cruce ARCA + Visión IA Gemini | Reubica a proveedor oficial, actualiza SQLite y crea proveedor si es nuevo |
| `archivo_desubicado` | **Alta (High)** | Visión IA Gemini | Mueve a `Año/Mes/Proveedor` o a `Facturas_No_Reconocidas` |
| `carpeta_invalida` | **Alta (High)** | Validación de expresión regular | Notificación al usuario para revisión manual de estructura |
| `proveedor_incongruente` | **Alta (High)** | Cruce fiscal ARCA por CAE/Número | Reubica al emisor fiscal oficial y corrige BD |
| `mes_invalido` | **Media (Medium)** | Normalización de calendario | Renombra a mes estándar en español |
| `factura_no_reconocida_recuperable` | **Media (Medium)** | Cruce ARCA + Visión IA | Rescata la factura y la incorpora a `Facturas_Procesadas` |
| `db_archivo_huerfano` | **Media (Medium)** | Integridad relacional SQLite vs Disco | Sincroniza marcando `is_deleted = 1` |
| `carpeta_vacia` | **Baja (Low)** | Detección de directorios sin PDFs | Limpia atributos y elimina la carpeta |
| `nombre_atipico` | **Baja (Low)** | Análisis de patrón `0000 - 00000000` | Propuesta de estandarización de nombre |

