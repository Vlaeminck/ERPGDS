import os
import shutil
import re
import datetime
import json
import logging
from config import OUTPUT_FOLDER, UNRECOGNIZED_FOLDER, SUPPLIERS

logger = logging.getLogger('doctor')

MONTHS_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
    7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
}
VALID_MONTHS = list(MONTHS_ES.values())
JUNK_FILES = {'desktop.ini', 'thumbs.db', '.ds_store', '.gitkeep'}


def is_junk_file(filename):
    """Detecta archivos del sistema o metadatos que no deben tratarse como facturas."""
    if not filename:
        return True
    f = str(filename).lower().strip()
    return f.startswith('.') or f in JUNK_FILES


def clean_junk_in_dir(dir_path):
    """Elimina silenciosamente archivos basura de Windows (desktop.ini, thumbs.db)."""
    if not os.path.exists(dir_path) or not os.path.isdir(dir_path):
        return 0
    cleaned = 0
    import stat
    try:
        for item in os.listdir(dir_path):
            item_path = os.path.join(dir_path, item)
            if os.path.isfile(item_path) and is_junk_file(item):
                try:
                    os.chmod(item_path, stat.S_IWRITE)
                    os.remove(item_path)
                    cleaned += 1
                except Exception:
                    pass
    except Exception:
        pass
    return cleaned


def remove_dir_safely(dir_path):
    """Elimina un directorio vacío o con archivos basura sorteando atributos de sólo lectura de Windows."""
    if not os.path.exists(dir_path):
        return True
    clean_junk_in_dir(dir_path)
    import stat
    def on_error(func, path, excinfo):
        try:
            os.chmod(path, stat.S_IWRITE)
            func(path)
        except Exception:
            pass
    try:
        shutil.rmtree(dir_path, onerror=on_error)
        return True
    except Exception:
        try:
            os.rmdir(dir_path)
            return True
        except Exception:
            return False


def clean_supplier_norm(name):
    """
    Normaliza el nombre de un proveedor eliminando acentos, puntuación legal,
    puntos finales (que Windows trunca en nombres de carpetas) y espacios.
    """
    if not name:
        return ""
    import unicodedata
    s = str(name).lower().strip()
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.rstrip('. ')
    s = re.sub(r'\b(s\.?a\.?|s\.?r\.?l\.?|s\.?\s*a\.?|s\.?\s*r\.?\s*l\.?|cicsa|hnos\.?|s\.?c\.?a\.?)\b', '', s)
    s = re.sub(r'[^a-z0-9]', '', s)
    return s.strip()


def get_known_suppliers_catalog():
    """
    Construye un catálogo unificado de proveedores oficiales cruzando:
    1. Tabla SQLite 'proveedores' (Single Source of Truth)
    2. Tabla SQLite 'arca_compras_csv' (emisores fiscales AFIP/ARCA)
    3. Diccionario SUPPLIERS en config.py / suppliers.json
    4. Mapa de alias configurados
    """
    import db_manager

    catalog = {
        "norm_to_official": {},
        "cuit_to_official": {},
        "alias_to_official": {},
        "all_officials": set()
    }

    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor()

        # 1. Proveedores de la BD SQLite
        try:
            cursor.execute("SELECT id, nombre, cuit, alias, keywords FROM proveedores WHERE is_deleted = 0")
            for r in cursor.fetchall():
                nom = (r['nombre'] or '').strip()
                if not nom:
                    continue
                catalog["all_officials"].add(nom)
                norm = clean_supplier_norm(nom)
                if norm:
                    catalog["norm_to_official"][norm] = nom

                cuit_digits = re.sub(r'\D', '', str(r['cuit'] or ''))
                if len(cuit_digits) == 11:
                    catalog["cuit_to_official"][cuit_digits] = nom

                alias = (r['alias'] or '').strip()
                if alias:
                    alias_norm = clean_supplier_norm(alias)
                    if alias_norm:
                        catalog["alias_to_official"][alias_norm] = nom
                        catalog["norm_to_official"][alias_norm] = nom
        except Exception as e:
            logger.warning(f"Error cargando proveedores SQLite: {e}")

        # 2. Emisores registrados en ARCA Compras CSV
        try:
            cursor.execute("""
                SELECT DISTINCT denominacion_emisor, nro_doc_emisor 
                FROM arca_compras_csv 
                WHERE denominacion_emisor IS NOT NULL AND TRIM(denominacion_emisor) != ''
            """)
            for r in cursor.fetchall():
                nom = (r['denominacion_emisor'] or '').strip()
                if not nom:
                    continue
                catalog["all_officials"].add(nom)
                norm = clean_supplier_norm(nom)
                if norm and norm not in catalog["norm_to_official"]:
                    catalog["norm_to_official"][norm] = nom

                cuit_digits = re.sub(r'\D', '', str(r['nro_doc_emisor'] or ''))
                if len(cuit_digits) == 11 and cuit_digits not in catalog["cuit_to_official"]:
                    catalog["cuit_to_official"][cuit_digits] = nom
        except Exception as e:
            logger.warning(f"Error cargando emisores ARCA: {e}")

        conn.close()
    except Exception as e:
        logger.error(f"Error conectando a BD en catálogo doctor: {e}")

    # 3. Proveedores de config.py
    for nom in SUPPLIERS.keys():
        nom_clean = nom.strip()
        catalog["all_officials"].add(nom_clean)
        norm = clean_supplier_norm(nom_clean)
        if norm and norm not in catalog["norm_to_official"]:
            catalog["norm_to_official"][norm] = nom_clean

    return catalog


def diagnose_invoice_with_brain(pdf_path, catalog=None, use_ai=True):
    """
    'Cerebro' del Doctor:
    Analiza una factura con proveedor sospechoso, inexistente o desubicado.
    1. Primero intenta resolución por número/CAE en ARCA Compras (instantáneo y 100% fiscal).
    2. Si no es concluyente o use_ai=True, utiliza Gemini AI (visión multimodal) para leer el documento.
    3. Cruza la información resultante con el catálogo oficial de proveedores de la base de datos.
    """
    if not os.path.exists(pdf_path):
        return None

    if catalog is None:
        catalog = get_known_suppliers_catalog()

    filename = os.path.basename(pdf_path)

    # Paso 1: Intentar matching fiscal directo con ARCA por número de comprobante en el nombre
    arca_info = None
    m = re.search(r'(\d{1,5})\s*[-/]\s*(\d{5,8})', filename)
    if m:
        try:
            pv_int = int(m.group(1))
            num_int = int(m.group(2))
            import db_manager
            conn = db_manager.get_connection()
            c = conn.cursor()
            c.execute("""
                SELECT id, denominacion_emisor, nro_doc_emisor, punto_venta, nro_comprobante, imp_total, cae, fecha_emision
                FROM arca_compras_csv
                WHERE (punto_venta = ? OR punto_venta = ? OR CAST(punto_venta AS INTEGER) = ?)
                  AND (nro_comprobante = ? OR nro_comprobante = ? OR CAST(nro_comprobante AS INTEGER) = ?)
                LIMIT 1
            """, (pv_int, f"{pv_int:04d}", pv_int, num_int, f"{num_int:08d}", num_int))
            row = c.fetchone()
            if row:
                arca_info = dict(row)
            conn.close()
        except Exception as e:
            logger.debug(f"Error buscando en ARCA: {e}")

    if arca_info:
        emisor_arca = (arca_info.get('denominacion_emisor') or '').strip()
        cuit_arca = re.sub(r'\D', '', str(arca_info.get('nro_doc_emisor') or ''))
        
        # Buscar si este emisor o CUIT mapea a un proveedor oficial
        official_name = emisor_arca
        if cuit_arca in catalog["cuit_to_official"]:
            official_name = catalog["cuit_to_official"][cuit_arca]
        else:
            norm_emisor = clean_supplier_norm(emisor_arca)
            if norm_emisor in catalog["norm_to_official"]:
                official_name = catalog["norm_to_official"][norm_emisor]

        return {
            "source": "ARCA_FISCAL",
            "detected_supplier": official_name,
            "detected_cuit": cuit_arca,
            "detected_cae": arca_info.get('cae') or '',
            "detected_total": arca_info.get('imp_total') or 0,
            "detected_fecha": arca_info.get('fecha_emision') or '',
            "invoice_number": f"{pv_int:04d}-{num_int:08d}",
            "confidence": "high",
            "message": f"Comprobante fiscal verificado en ARCA/AFIP: Corresponde a '{official_name}' (CUIT: {cuit_arca})."
        }

    # Paso 2: Usar Gemini AI Vision si está habilitado
    if use_ai:
        try:
            from processor import extract_data_via_ai
            ai_data = extract_data_via_ai(pdf_path)
            if ai_data and isinstance(ai_data, dict):
                ai_supplier = (ai_data.get('supplier') or ai_data.get('nombre_emisor') or '').strip()
                ai_cuit = re.sub(r'\D', '', str(ai_data.get('cuit') or ''))
                ai_inv = str(ai_data.get('numero_factura') or '').strip()
                ai_cae = str(ai_data.get('cae') or ai_data.get('cae_o_caea') or '').strip()
                ai_total = ai_data.get('total') or ai_data.get('monto_total') or 0
                ai_fecha = ai_data.get('fecha_emision') or ''

                official_name = ai_supplier
                if ai_cuit and ai_cuit in catalog["cuit_to_official"]:
                    official_name = catalog["cuit_to_official"][ai_cuit]
                else:
                    norm_ai = clean_supplier_norm(ai_supplier)
                    if norm_ai in catalog["norm_to_official"]:
                        official_name = catalog["norm_to_official"][norm_ai]

                if official_name:
                    return {
                        "source": "GEMINI_AI",
                        "detected_supplier": official_name,
                        "detected_cuit": ai_cuit,
                        "detected_cae": ai_cae,
                        "detected_total": ai_total,
                        "detected_fecha": ai_fecha,
                        "invoice_number": ai_inv,
                        "confidence": "high",
                        "message": f"Diagnóstico con Inteligencia Artificial (Gemini): Corresponde a '{official_name}' (CUIT: {ai_cuit})."
                    }
        except Exception as e:
            logger.error(f"Error ejecutando diagnóstico IA: {e}")

    return None


def scan_database(enable_ai=True):
    """
    Escanea la base de datos de facturas procesadas y el almacenamiento en disco en busca de:
    1. Carpetas vacías o con solo archivos basura (desktop.ini).
    2. Archivos desubicados (en la raíz, año o mes).
    3. Proveedores inexistentes o no reconocidos (con diagnóstico IA / ARCA).
    4. Incongruencias entre la carpeta del proveedor y el emisor real de la factura.
    5. Archivos con nombres atípicos.
    6. Desincronización entre la base de datos SQLite y los archivos en disco.
    """
    anomalies = []

    if not os.path.exists(OUTPUT_FOLDER):
        return anomalies

    catalog = get_known_suppliers_catalog()

    # Mapeo de proveedores registrados para búsqueda rápida
    norm_catalog = catalog["norm_to_official"]

    # 1. Exploración de estructura de directorios en Facturas_Procesadas
    try:
        root_items = os.listdir(OUTPUT_FOLDER)
    except Exception:
        root_items = []

    for item in root_items:
        if is_junk_file(item):
            continue

        item_path = os.path.join(OUTPUT_FOLDER, item)

        # Archivo desubicado en la raíz
        if os.path.isfile(item_path):
            ai_diag = diagnose_invoice_with_brain(item_path, catalog, use_ai=enable_ai) if item_path.lower().endswith(('.pdf', '.jpg', '.png')) else None
            anomalies.append({
                "type": "archivo_desubicado",
                "severity": "high",
                "path": item_path,
                "filename": item,
                "message": f"Archivo '{item}' encontrado directamente en la raíz de Facturas Procesadas.",
                "ai_diagnosis": ai_diag
            })
            continue

        # Verificar carpeta de Año
        if not re.match(r'^\d{4}$', item):
            anomalies.append({
                "type": "carpeta_invalida",
                "severity": "high",
                "path": item_path,
                "folder_name": item,
                "message": f"Carpeta '{item}' en la raíz que no parece un año válido de 4 dígitos."
            })
            continue

        year = item
        try:
            month_items = os.listdir(item_path)
        except Exception:
            month_items = []

        for month_folder in month_items:
            if is_junk_file(month_folder):
                continue

            month_path = os.path.join(item_path, month_folder)

            if os.path.isfile(month_path):
                ai_diag = diagnose_invoice_with_brain(month_path, catalog, use_ai=enable_ai) if month_path.lower().endswith(('.pdf', '.jpg', '.png')) else None
                anomalies.append({
                    "type": "archivo_desubicado",
                    "severity": "high",
                    "path": month_path,
                    "filename": month_folder,
                    "message": f"Archivo '{month_folder}' encontrado dentro de la carpeta del año {year} (debe estar dentro de un mes y proveedor).",
                    "ai_diagnosis": ai_diag
                })
                continue

            if month_folder not in VALID_MONTHS:
                anomalies.append({
                    "type": "mes_invalido",
                    "severity": "medium",
                    "path": month_path,
                    "folder_name": month_folder,
                    "message": f"Carpeta '{month_folder}' en año {year} no corresponde a un mes calendario estándar."
                })

            # Dentro del Mes: Proveedores
            try:
                sup_items = os.listdir(month_path)
            except Exception:
                sup_items = []

            for sup_folder in sup_items:
                if is_junk_file(sup_folder):
                    continue

                sup_path = os.path.join(month_path, sup_folder)

                if os.path.isfile(sup_path):
                    ai_diag = diagnose_invoice_with_brain(sup_path, catalog, use_ai=enable_ai) if sup_path.lower().endswith(('.pdf', '.jpg', '.png')) else None
                    anomalies.append({
                        "type": "archivo_desubicado",
                        "severity": "high",
                        "path": sup_path,
                        "filename": sup_folder,
                        "message": f"Archivo '{sup_folder}' encontrado dentro de {year}/{month_folder} (debe estar dentro de la carpeta de un proveedor).",
                        "ai_diagnosis": ai_diag
                    })
                    continue

                # Verificar archivos reales dentro del proveedor
                try:
                    files_in_sup = [f for f in os.listdir(sup_path) if not is_junk_file(f)]
                except Exception:
                    files_in_sup = []

                # Carpeta vacía (o solo con desktop.ini)
                if not files_in_sup:
                    anomalies.append({
                        "type": "carpeta_vacia",
                        "severity": "low",
                        "path": sup_path,
                        "folder_name": sup_folder,
                        "message": f"Carpeta de proveedor '{sup_folder}' vacía en {year}/{month_folder}."
                    })
                    continue

                # Verificar si el proveedor existe en el catálogo unificado
                sup_norm = clean_supplier_norm(sup_folder)
                is_recognized = sup_norm in norm_catalog

                if not is_recognized:
                    # PROVEEDOR INEXISTENTE / NO RECONOCIDO -> Activamos el Cerebro (AI / ARCA)
                    pdf_files = [f for f in files_in_sup if f.lower().endswith(('.pdf', '.jpg', '.png'))]
                    
                    for f in pdf_files:
                        f_path = os.path.join(sup_path, f)
                        ai_diag = diagnose_invoice_with_brain(f_path, catalog, use_ai=enable_ai)
                        
                        target_sup = ai_diag.get('detected_supplier') if ai_diag else None
                        msg = f"Factura '{f}' guardada bajo el proveedor inexistente '{sup_folder}'."
                        if target_sup:
                            msg += f" 🧠 Diagnóstico IA: Corresponde a '{target_sup}' (según {ai_diag.get('source')})."

                        anomalies.append({
                            "type": "proveedor_inexistente",
                            "severity": "high",
                            "path": f_path,
                            "folder_name": sup_folder,
                            "filename": f,
                            "year": year,
                            "month": month_folder,
                            "message": msg,
                            "ai_diagnosis": ai_diag,
                            "suggested_supplier": target_sup,
                            "suggested_action": "reubicar_a_proveedor" if target_sup else "solicitar_asignacion"
                        })
                else:
                    # Proveedor reconocido: revisar si hay facturas adentro con nombres atípicos
                    for f in files_in_sup:
                        f_path = os.path.join(sup_path, f)
                        if not re.match(r'^(?:DUPLICADO_)?\d{4,5}\s*-\s*\d{8}(?:\s*\(Rescatado IA\))?', f):
                            anomalies.append({
                                "type": "nombre_atipico",
                                "severity": "low",
                                "path": f_path,
                                "filename": f,
                                "message": f"El archivo '{f}' no sigue el formato estándar '0000 - 00000000'."
                            })

    # 2. Revisar archivos pendientes en Facturas_No_Reconocidas que puedan curarse con IA
    if os.path.exists(UNRECOGNIZED_FOLDER):
        try:
            unrec_files = [f for f in os.listdir(UNRECOGNIZED_FOLDER) if not is_junk_file(f)]
            for uf in unrec_files:
                uf_path = os.path.join(UNRECOGNIZED_FOLDER, uf)
                if os.path.isfile(uf_path) and uf_path.lower().endswith(('.pdf', '.jpg', '.png')):
                    ai_diag = diagnose_invoice_with_brain(uf_path, catalog, use_ai=enable_ai)
                    target_sup = ai_diag.get('detected_supplier') if ai_diag else None
                    msg = f"Factura '{uf}' en carpeta de No Reconocidas."
                    if target_sup:
                        msg += f" 🧠 Diagnóstico IA: Se puede recuperar para '{target_sup}'."
                    anomalies.append({
                        "type": "factura_no_reconocida_recuperable",
                        "severity": "medium",
                        "path": uf_path,
                        "filename": uf,
                        "message": msg,
                        "ai_diagnosis": ai_diag,
                        "suggested_supplier": target_sup
                    })
        except Exception as e:
            logger.warning(f"Error escaneando no reconocidas: {e}")

    # 3. Desincronización BD SQLite vs Disco
    try:
        import db_manager
        conn = db_manager.get_connection()
        c = conn.cursor()
        c.execute("SELECT id, year, month, supplier, filename, filepath FROM facturas_procesadas WHERE is_deleted = 0 OR is_deleted IS NULL")
        db_invoices = [dict(r) for r in c.fetchall()]
        conn.close()

        for inv in db_invoices:
            rel_path = (inv['filepath'] or '').replace('/', os.sep)
            abs_path = os.path.join(OUTPUT_FOLDER, rel_path)
            if not os.path.exists(abs_path):
                anomalies.append({
                    "type": "db_archivo_huerfano",
                    "severity": "medium",
                    "db_id": inv['id'],
                    "path": abs_path,
                    "filename": inv['filename'],
                    "supplier": inv['supplier'],
                    "message": f"Registro BD #{inv['id']} ('{inv['filename']}', {inv['supplier']}) no se encuentra físicamente en el disco."
                })
    except Exception as e:
        logger.warning(f"Error verificando integridad BD: {e}")

    return anomalies


def fix_single_anomaly(anomaly):
    """
    Aplica la cura correspondiente a una anomalía específica.
    Actualiza tanto el disco como la base de datos SQLite y Firebase sync.
    """
    a_type = anomaly.get('type')
    path = anomaly.get('path', '')
    import db_manager

    # 1. Carpeta Vacía -> Limpiar junk y eliminar carpeta
    if a_type == 'carpeta_vacia':
        if os.path.exists(path) and os.path.isdir(path):
            ok = remove_dir_safely(path)
            if ok:
                return {"success": True, "action": "carpeta_eliminada", "message": f"Carpeta vacía eliminada: {os.path.basename(path)}"}
            else:
                return {"success": False, "error": f"No se pudo eliminar carpeta: {os.path.basename(path)}"}

    # 2. Proveedor Inexistente / No Reconocido -> Reubicar con diagnóstico IA/ARCA
    elif a_type in ('proveedor_inexistente', 'proveedor_no_reconocido', 'factura_no_reconocida_recuperable'):
        ai_diag = anomaly.get('ai_diagnosis') or {}
        target_sup = anomaly.get('suggested_supplier') or ai_diag.get('detected_supplier')

        if not target_sup:
            # Reintentar diagnóstico en caliente con IA
            catalog = get_known_suppliers_catalog()
            ai_diag = diagnose_invoice_with_brain(path, catalog, use_ai=True)
            target_sup = ai_diag.get('detected_supplier') if ai_diag else None

        if not target_sup:
            return {"success": False, "error": f"No se pudo identificar el proveedor real para {os.path.basename(path)}"}

        year = anomaly.get('year')
        month = anomaly.get('month')
        if not year or not month:
            # Extraer de la ruta o fecha detectada
            detected_fecha = ai_diag.get('detected_fecha') or ''
            if detected_fecha and len(detected_fecha) >= 7:
                try:
                    dt = datetime.datetime.strptime(detected_fecha[:10], '%Y-%m-%d')
                    year = str(dt.year)
                    month = MONTHS_ES.get(dt.month, 'Noviembre')
                except Exception:
                    pass
            if not year or not month:
                parts = path.replace(os.sep, '/').split('/')
                try:
                    idx = parts.index('Facturas_Procesadas')
                    year = parts[idx + 1]
                    month = parts[idx + 2]
                except Exception:
                    now = datetime.datetime.now()
                    year = str(now.year)
                    month = MONTHS_ES.get(now.month, 'Noviembre')

        # Directorio de destino correcto
        target_dir = os.path.join(OUTPUT_FOLDER, str(year), str(month), target_sup)
        os.makedirs(target_dir, exist_ok=True)

        filename = os.path.basename(path)
        dest_path = os.path.join(target_dir, filename)

        if os.path.abspath(path) != os.path.abspath(dest_path):
            if os.path.exists(dest_path):
                # Generar nombre único para evitar colisión
                name_part, ext_part = os.path.splitext(filename)
                import uuid
                dest_path = os.path.join(target_dir, f"{name_part}_CORREGIDO_{uuid.uuid4().hex[:4]}{ext_part}")
            shutil.move(path, dest_path)

        # Si la carpeta de origen quedó vacía, eliminarla
        src_parent = os.path.dirname(path)
        if os.path.exists(src_parent) and os.path.isdir(src_parent):
            clean_junk_in_dir(src_parent)
            try:
                remaining = [f for f in os.listdir(src_parent) if not is_junk_file(f)]
                if not remaining:
                    remove_dir_safely(src_parent)
            except Exception:
                pass

        # Asegurar que el proveedor exista formalmente en la BD SQLite
        detected_cuit = ai_diag.get('detected_cuit') or ''
        try:
            db_manager.ensure_supplier_exists(target_sup)
            if detected_cuit:
                from processor import save_ai_supplier
                save_ai_supplier(target_sup, detected_cuit, [target_sup])
        except Exception as e:
            logger.warning(f"Error guardando proveedor oficial: {e}")

        # Actualizar la base de datos SQLite 'facturas_procesadas'
        new_rel_path = os.path.relpath(dest_path, OUTPUT_FOLDER).replace(os.sep, '/')
        old_rel_path = os.path.relpath(path, OUTPUT_FOLDER).replace(os.sep, '/') if path.startswith(OUTPUT_FOLDER) else ''
        now_iso = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        try:
            conn = db_manager.get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE facturas_procesadas
                SET supplier = ?,
                    filepath = ?,
                    year = ?,
                    month = ?,
                    cuit = CASE WHEN ? != '' THEN ? ELSE cuit END,
                    cae = CASE WHEN ? != '' THEN ? ELSE cae END,
                    updated_at = ?,
                    sync_status = 0
                WHERE filepath = ? OR filepath = ? OR filename = ?
            """, (
                target_sup, new_rel_path, str(year), str(month),
                detected_cuit, detected_cuit,
                ai_diag.get('detected_cae') or '', ai_diag.get('detected_cae') or '',
                now_iso,
                new_rel_path, old_rel_path, filename
            ))

            if cursor.rowcount == 0:
                # Si no existía el registro en la BD, insertarlo formalmente
                cursor.execute("""
                    INSERT INTO facturas_procesadas 
                    (year, month, supplier, filename, filepath, total, cuit, cae, fecha, fecha_procesado, updated_at, sync_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, (
                    str(year), str(month), target_sup, os.path.basename(dest_path), new_rel_path,
                    ai_diag.get('detected_total') or 0, detected_cuit, ai_diag.get('detected_cae') or '',
                    ai_diag.get('detected_fecha') or '', now_iso, now_iso
                ))

            # Marcar como recibida en ARCA si corresponde
            inv_num = ai_diag.get('invoice_number') or filename
            m_inv = re.search(r'(\d{1,5})\s*[-/]\s*(\d{5,8})', inv_num)
            if m_inv:
                try:
                    pv_i = int(m_inv.group(1))
                    num_i = int(m_inv.group(2))
                    cursor.execute("""
                        UPDATE arca_compras_csv
                        SET factura_recibida = 'SI', updated_at = ?, sync_status = 0
                        WHERE (punto_venta = ? OR CAST(punto_venta AS INTEGER) = ?)
                          AND (nro_comprobante = ? OR CAST(nro_comprobante AS INTEGER) = ?)
                    """, (now_iso, pv_i, pv_i, num_i, num_i))
                except Exception:
                    pass

            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error actualizando BD en fix doctor: {e}")

        return {
            "success": True,
            "action": "reubicado_exitosamente",
            "supplier": target_sup,
            "new_path": dest_path,
            "message": f"Factura reubicada correctamente a '{target_sup}' en {year}/{month}."
        }

    # 3. Archivo desubicado en raíz / año / mes
    elif a_type == 'archivo_desubicado':
        ai_diag = anomaly.get('ai_diagnosis')
        if not ai_diag:
            catalog = get_known_suppliers_catalog()
            ai_diag = diagnose_invoice_with_brain(path, catalog, use_ai=True)

        if ai_diag and ai_diag.get('detected_supplier'):
            # Convertir a cura de proveedor
            anomaly['suggested_supplier'] = ai_diag['detected_supplier']
            anomaly['ai_diagnosis'] = ai_diag
            return fix_single_anomaly(anomaly)
        else:
            # Mover a No Reconocidas
            if not os.path.exists(UNRECOGNIZED_FOLDER):
                os.makedirs(UNRECOGNIZED_FOLDER)
            filename = os.path.basename(path)
            dest = os.path.join(UNRECOGNIZED_FOLDER, f"DESUBICADO_{filename}")
            shutil.move(path, dest)
            return {"success": True, "action": "movido_a_no_reconocidas", "message": f"Archivo movido a No Reconocidas: {filename}"}

    # 4. Registro huérfano en BD
    elif a_type == 'db_archivo_huerfano':
        db_id = anomaly.get('db_id')
        if db_id:
            try:
                conn = db_manager.get_connection()
                cursor = conn.cursor()
                now_iso = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                cursor.execute("UPDATE facturas_procesadas SET is_deleted = 1, updated_at = ?, sync_status = 0 WHERE id = ?", (now_iso, db_id))
                conn.commit()
                conn.close()
                return {"success": True, "action": "bd_sincronizada", "message": f"Registro #{db_id} marcado como eliminado."}
            except Exception as e:
                return {"success": False, "error": f"Error actualizando BD: {e}"}

    return {"success": False, "error": f"Tipo de anomalía no manejado: {a_type}"}


def fix_database(enable_ai=True):
    """
    Aplica todas las curas automáticas e inteligentes disponibles:
    - Elimina carpetas vacías y archivos residuales (desktop.ini).
    - Resuelve y reubica facturas guardadas bajo proveedores inexistentes o erróneos mediante IA y ARCA.
    - Sincroniza la base de datos SQLite y prepara los registros para la nube.
    """
    anomalies = scan_database(enable_ai=enable_ai)
    fixes_applied = 0
    errors = []
    details = []

    for anomaly in anomalies:
        try:
            res = fix_single_anomaly(anomaly)
            if res.get('success'):
                fixes_applied += 1
                details.append(res.get('message', 'Cura aplicada'))
            elif 'error' in res:
                errors.append(res['error'])
        except Exception as e:
            errors.append(f"Error curando {anomaly.get('path', '')}: {str(e)}")

    return {
        "success": True,
        "fixes": fixes_applied,
        "details": details,
        "errors": errors
    }
