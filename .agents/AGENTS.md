# 🤖 AGENT RULES & PROJECT GUIDELINES (ERP GDS)

Cualquier modelo de Inteligencia Artificial (LLM / Agentic AI) que trabaje en este repositorio debe seguir estrictamente estas pautas:

---

## 📖 1. Documentación de Contexto de Entrada
- **Antes de realizar cambios significativos**, lee siempre el archivo [CONTEXTO.md](file:///c:/Users/Gardenias/Desktop/DEVS/ERPGDS/ERPGDS/CONTEXTO.md). Contiene la arquitectura completa del proyecto, el mapa de archivos, los endpoints de la API Flask y el esquema exacto de las **12 tablas SQLite**.

---

## 🗄️ 2. Reglas de Base de Datos y Persistencia
- **Única Fuente de Verdad (Single Source of Truth)**: La base de datos SQLite en `registros/control_interno.db` (gestionada mediante `db_manager.py`) es la fuente principal de datos del sistema.
- NUNCA uses `localStorage` del navegador para almacenar datos del negocio o del estado financiero.
- Siempre asegura cerrar conexiones de base de datos (`conn.close()`) en bloques `finally` o tras realizar commits.

---

## 🎨 3. Reglas de Frontend y Diseño
- **Estética Impeccable Light Theme**: La aplicación utiliza una paleta en tema claro de alto contraste, tarjetas tipo glassmorphism y bordes sutiles.
- **Contraste de Texto**: NUNCA uses estilos inline de texto blanco (como `#f8fafc` o `#ffffff`) sobre tarjetas o contenedores claros. Utiliza siempre `var(--text-primary)` o colores oscuros con peso de fuente adecuado (`font-weight: 600` / `700`).
- **Filtro Global por Período**: Las llamadas Fetch API en `static/js/main.js` deben incluir el parámetro `?mes=` respetando la variable `currentSelectedMonth` seleccionada por el usuario.

---

## 🧪 4. Verificación Obligatoria
- Tras realizar cambios en la lógica Python de `app.py` o `db_manager.py`, ejecuta comandos de prueba para verificar que el código compila y responde correctamente sin arrojar errores de sintaxis o SQL.
