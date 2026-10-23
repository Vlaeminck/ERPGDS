import os
import sys
import time
import json
import uuid
import datetime
import threading
import base64
import db_manager
import config

# Forzar zona horaria de Argentina (UTC-3) en cualquier entorno (Windows local o Railway Linux)
if hasattr(time, 'tzset'):
    try:
        os.environ['TZ'] = 'America/Argentina/Buenos_Aires'
        time.tzset()
    except Exception:
        pass

SYNC_STATUS = {
    "enabled": False,
    "mode": "OFFLINE_LOCAL",
    "message": "Sin credenciales de Firebase (Modo Local Activo)",
    "last_sync": None,
    "synced_count": 0,
    "pending_count": 0,
    "error": None
}

_firestore_db = None
_sync_thread = None
_stop_event = threading.Event()
_sync_lock = threading.Lock()

SYNC_TABLES = [
    'recaudacion_diaria',
    'estacionamiento_diario',
    'estacionamiento_gastos',
    'caja_chica_movimientos',
    'caja_chica_arqueo',
    'gastos_fijos',
    'proveedores_cuentas_pagar',
    'arca_compras_csv',
    'proveedores',
    'facturas_procesadas',
    'retiros_recaudacion',
    'categorias_gastos',
    'pagos_no_registrados'
]

def find_credentials_file():
    candidates = [
        getattr(config, 'FIREBASE_CREDENTIALS_PATH', None),
        os.path.join(os.getcwd(), 'firebase_credentials.json'),
        os.path.join(os.path.dirname(sys.executable), 'firebase_credentials.json') if getattr(sys, 'frozen', False) else None,
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'firebase_credentials.json'),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate

    search_dirs = [os.getcwd()]
    if getattr(sys, 'frozen', False):
        search_dirs.append(os.path.dirname(sys.executable))
    
    for s_dir in search_dirs:
        if os.path.exists(s_dir):
            for f in os.listdir(s_dir):
                if f.endswith('.json') and ('firebase' in f.lower() or 'adminsdk' in f.lower() or 'credentials' in f.lower() or 'service' in f.lower()):
                    fp = os.path.join(s_dir, f)
                    if os.path.isfile(fp):
                        return fp
    return None

def init_firebase():
    global _firestore_db, SYNC_STATUS

    env_creds = os.environ.get('FIREBASE_CREDENTIALS_JSON', '').strip()
    creds_path = None
    cred = None

    if env_creds:
        try:
            if env_creds.startswith('{'):
                creds_dict = json.loads(env_creds)
            else:
                decoded = base64.b64decode(env_creds).decode('utf-8')
                creds_dict = json.loads(decoded)
            
            import firebase_admin
            from firebase_admin import credentials, firestore
            cred = credentials.Certificate(creds_dict)
        except Exception as e:
            print(f"[FirebaseSync] Error procesando FIREBASE_CREDENTIALS_JSON: {e}", flush=True)

    if not cred:
        creds_path = find_credentials_file()

    if not cred and (not creds_path or not os.path.exists(creds_path)):
        SYNC_STATUS["enabled"] = False
        SYNC_STATUS["mode"] = "OFFLINE_LOCAL"
        SYNC_STATUS["message"] = "Coloque firebase_credentials.json o configure FIREBASE_CREDENTIALS_JSON"
        print("[FirebaseSync] Modo Local Activo (Sin credenciales de Firebase aún).", flush=True)
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            if not cred:
                cred = credentials.Certificate(creds_path)
            firebase_admin.initialize_app(cred)

        _firestore_db = firestore.client()
        SYNC_STATUS["enabled"] = True
        SYNC_STATUS["mode"] = "ONLINE_SYNC"
        SYNC_STATUS["message"] = "Conectado a Firebase Cloud Sync Relay"
        source_name = "variable de entorno FIREBASE_CREDENTIALS_JSON" if env_creds else os.path.basename(creds_path)
        print(f"[FirebaseSync] Conectado exitosamente usando {source_name}!", flush=True)
        _setup_realtime_listener()
        return True
    except Exception as e:
        SYNC_STATUS["enabled"] = False
        SYNC_STATUS["mode"] = "ERROR"
        SYNC_STATUS["message"] = f"Error al inicializar Firebase: {str(e)}"
        SYNC_STATUS["error"] = str(e)
        print(f"[FirebaseSync] Error inicializando Firebase: {e}", flush=True)
        return False

CLIENT_INSTANCE_ID = uuid.uuid4().hex
_listener_registered = False
_last_routine_pull_ts = 0.0

def has_pending_local_changes():
    """Verifica en SQLite si existe al menos un registro pendiente por sincronizar (sync_status = 0)."""
    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        for tbl in SYNC_TABLES:
            try:
                cursor.execute(f"SELECT 1 FROM {tbl} WHERE sync_status = 0 LIMIT 1")
                if cursor.fetchone():
                    conn.close()
                    return True
            except Exception:
                pass
        conn.close()
    except Exception:
        pass
    return False

def count_pending_local_changes():
    """Retorna la cantidad total de registros pendientes de subida en SQLite local."""
    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        total = 0
        for tbl in SYNC_TABLES:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {tbl} WHERE sync_status = 0")
                row = cursor.fetchone()
                if row:
                    total += row[0]
            except Exception:
                pass
        conn.close()
        return total
    except Exception:
        return 0

def _setup_realtime_listener():
    global _listener_registered
    if not _firestore_db or _listener_registered:
        return
    try:
        def on_global_state_change(doc_snapshots, changes, read_time):
            if not _sync_lock.acquire(blocking=False):
                print("[FirebaseSync] Ya hay una sincronización en curso. Se pospone pull concurrente de realtime.", flush=True)
                return
            try:
                data = None
                if doc_snapshots and len(doc_snapshots) > 0:
                    snap = doc_snapshots[0]
                    if getattr(snap, 'exists', True):
                        data = snap.to_dict()
                elif changes and len(changes) > 0:
                    data = changes[0].document.to_dict()

                if not data:
                    return

                # Ignorar si el cambio fue emitido por esta misma instancia
                if data.get('sender_id') == CLIENT_INSTANCE_ID:
                    return

                remote_last = str(data.get('last_change') or '')
                last_pulled = db_manager.get_config('last_pulled_global_state', '')
                if remote_last and last_pulled and remote_last <= last_pulled:
                    return

                print(f"[FirebaseSync] Novedad remota detectada en tiempo real ({remote_last}). Ejecutando Pull delta...", flush=True)
                pull_remote_changes(force_full=False, known_remote_change=remote_last, _already_locked=True)
            finally:
                _sync_lock.release()

        doc_ref = _firestore_db.collection('sync_metadata').document('global_state')
        doc_ref.on_snapshot(on_global_state_change)
        _listener_registered = True
        print("[FirebaseSync] Escuchador de eventos remotos en tiempo real (on_snapshot) activo.", flush=True)
    except Exception as e:
        _listener_registered = False
        print(f"[FirebaseSync] Aviso: Listener realtime no pudo iniciarse (se usará polling de global_state): {e}", flush=True)

def push_local_changes(_already_locked=False):
    """Sube registros nuevos o actualizados (sync_status = 0) desde SQLite a Firebase."""
    if not _firestore_db:
        return 0

    if not has_pending_local_changes():
        return 0

    if not _already_locked:
        if not _sync_lock.acquire(timeout=60):
            print("[FirebaseSync] Timeout esperando sync_lock en push_local_changes.", flush=True)
            return 0
    try:
        total_pushed = 0
        conn = db_manager.get_connection()
        cursor = conn.cursor()

        now_iso = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        for table in SYNC_TABLES:
            try:
                cursor.execute(f"SELECT * FROM {table} WHERE sync_status = 0")
                rows = cursor.fetchall()
                if not rows:
                    continue

                batch_size = 400
                for i in range(0, len(rows), batch_size):
                    chunk = rows[i:i + batch_size]
                    batch = _firestore_db.batch()
                    updated_ids = []

                    for row in chunk:
                        r_dict = dict(row)
                        record_uuid = r_dict.get('uuid')
                        if not record_uuid:
                            record_uuid = uuid.uuid4().hex
                            cursor.execute(f"UPDATE {table} SET uuid = ? WHERE id = ?", (record_uuid, r_dict['id']))
                            r_dict['uuid'] = record_uuid

                        if not r_dict.get('updated_at'):
                            cursor.execute(f"UPDATE {table} SET updated_at = ? WHERE id = ?", (now_iso, r_dict['id']))
                            r_dict['updated_at'] = now_iso

                        doc_data = {k: v for k, v in r_dict.items() if k != 'id'}
                        doc_data['sync_status'] = 1

                        doc_ref = _firestore_db.collection(table).document(record_uuid)
                        batch.set(doc_ref, doc_data, merge=True)
                        updated_ids.append(r_dict['id'])

                    batch.commit()

                    placeholders = ",".join(["?"] * len(updated_ids))
                    cursor.execute(f"UPDATE {table} SET sync_status = 1 WHERE id IN ({placeholders})", updated_ids)
                    conn.commit()
                    total_pushed += len(updated_ids)
            except Exception as ex:
                err_str = str(ex)
                if 'SERVICE_DISABLED' in err_str or 'Cloud Firestore API' in err_str:
                    SYNC_STATUS["mode"] = "ERROR"
                    SYNC_STATUS["message"] = "Habilite Firestore Database en su consola de Firebase"
                print(f"[FirebaseSync] Error push tabla {table}: {ex}", flush=True)

        if total_pushed > 0:
            try:
                now_iso = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                # 1. Notificar a Firestore sync_metadata/global_state para despertar al listener de la otra instancia
                _firestore_db.collection('sync_metadata').document('global_state').set({
                    'last_change': now_iso,
                    'sender_id': CLIENT_INSTANCE_ID
                })
                # 2. Registrar en la BD local que ya estamos al día con este cambio
                cursor.execute('''
                    INSERT INTO configuraciones (clave, valor) VALUES (?, ?)
                    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
                ''', ('last_pulled_global_state', now_iso))
                conn.commit()
            except Exception as e_meta:
                print(f"[FirebaseSync] Aviso actualizando global_state tras push: {e_meta}", flush=True)

        conn.close()
        return total_pushed
    finally:
        if not _already_locked:
            _sync_lock.release()

def delete_document(table, doc_uuid):
    """
    Elimina permanentemente un documento de Firestore por colección y UUID.
    Actualiza el global_state para notificar a otras instancias.
    """
    global _firestore_db
    if not _firestore_db:
        if not init_firebase():
            return False
    if not doc_uuid:
        return False
    try:
        _firestore_db.collection(table).document(str(doc_uuid)).delete()
        print(f"[FirebaseSync] Documento {doc_uuid} eliminado de Firebase ({table})", flush=True)
        try:
            now_iso = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            _firestore_db.collection('sync_metadata').document('global_state').set({
                'last_change': now_iso,
                'sender_id': CLIENT_INSTANCE_ID
            })
            db_manager.set_config('last_pulled_global_state', now_iso)
        except Exception:
            pass
        return True
    except Exception as e:
        print(f"[FirebaseSync] Error eliminando documento {doc_uuid} de {table}: {e}", flush=True)
        return False

_table_pull_timestamps = {}

def reconcile_with_firestore(table=None, _already_locked=False):
    """
    Compara los UUIDs existentes en Firestore con los de SQLite:
    1. Si un registro estaba sincronizado (sync_status = 1) en SQLite pero ya NO existe en Firestore (fue eliminado), se elimina de SQLite.
    2. Si un documento existe en Firestore pero NO en SQLite, se descarga e inserta en SQLite.
    """
    if not _firestore_db:
        if not init_firebase():
            return 0

    if not _already_locked:
        if not _sync_lock.acquire(timeout=60):
            print("[FirebaseSync] Timeout esperando sync_lock en reconcile_with_firestore.", flush=True)
            return 0
    try:
        tables_to_check = [table] if table else SYNC_TABLES
        total_reconciled = 0

        conn = db_manager.get_connection()
        cursor = conn.cursor()

        for tbl in tables_to_check:
            try:
                docs = list(_firestore_db.collection(tbl).stream())
                remote_docs_map = {doc.id: doc.to_dict() for doc in docs}
                remote_uuids = set(remote_docs_map.keys())

                cursor.execute(f"SELECT id, uuid, updated_at, sync_status FROM {tbl}")
                local_rows = cursor.fetchall()
                local_uuids = set()

                # Obtener columnas válidas de la tabla en SQLite
                cursor.execute(f"PRAGMA table_info({tbl})")
                valid_cols = {col['name'] for col in cursor.fetchall()}

                # 1. Eliminar de SQLite los registros que fueron borrados en Firestore, sin UUID o duplicados locales
                for r in local_rows:
                    loc_id = r['id']
                    loc_uuid = r['uuid']
                    if not loc_uuid or loc_uuid not in remote_uuids or loc_uuid in local_uuids:
                        cursor.execute(f"DELETE FROM {tbl} WHERE id = ?", (loc_id,))
                        total_reconciled += 1
                    else:
                        local_uuids.add(loc_uuid)

                # 2. Insertar o actualizar documentos que están en Firestore
                for r_uuid, r_data in remote_docs_map.items():
                    if r_uuid not in local_uuids:
                        r_data['uuid'] = r_uuid
                        r_data['sync_status'] = 1
                        keys = [k for k in r_data.keys() if k != 'id' and k in valid_cols]
                        cols_str = ", ".join(keys)
                        placeholders = ", ".join(["?"] * len(keys))
                        vals = [r_data[k] for k in keys]
                        try:
                            cursor.execute(f"INSERT INTO {tbl} ({cols_str}) VALUES ({placeholders})", vals)
                            total_reconciled += 1
                            local_uuids.add(r_uuid)
                        except Exception as ins_err:
                            pass

                conn.commit()
            except Exception as e:
                print(f"[FirebaseSync] Error en reconciliación de {tbl}: {e}", flush=True)

        conn.close()
        if total_reconciled > 0:
            SYNC_STATUS["last_remote_update"] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
        return total_reconciled
    finally:
        if not _already_locked:
            _sync_lock.release()

def pull_remote_changes(force_full=False, known_remote_change=None, _already_locked=False, bypass_global_check=False, force_tables=None):
    """Descarga e integra deltas por tabla desde Firebase a SQLite local de forma ultra-optimizada."""
    if not _firestore_db:
        if not init_firebase():
            return 0

    if not _already_locked:
        if not _sync_lock.acquire(timeout=60):
            print("[FirebaseSync] Timeout esperando sync_lock en pull_remote_changes.", flush=True)
            return 0

    try:
        # Comprobar si la base local está vacía para forzar hidratación completa
        if not force_full:
            try:
                conn_chk = db_manager.get_connection()
                cur_chk = conn_chk.cursor()
                cur_chk.execute("SELECT COUNT(*) FROM arca_compras_csv")
                cnt_chk = cur_chk.fetchone()[0]
                conn_chk.close()
                if cnt_chk == 0:
                    print("[FirebaseSync] arca_compras_csv vacía localmente. Forzando carga completa (force_full=True)...", flush=True)
                    force_full = True
            except Exception:
                force_full = True

        remote_last_change = known_remote_change
        if not force_full and not bypass_global_check and not remote_last_change:
            try:
                g_doc = _firestore_db.collection('sync_metadata').document('global_state').get()
                if g_doc.exists:
                    g_dict = g_doc.to_dict() or {}
                    remote_last_change = str(g_dict.get('last_change') or '')
                    remote_sender = str(g_dict.get('sender_id') or '')

                    # Si el último cambio lo emitió esta misma instancia, no hay nada nuevo que traer
                    if remote_sender == CLIENT_INSTANCE_ID and remote_last_change:
                        return 0

                    last_pulled = db_manager.get_config('last_pulled_global_state', '')
                    if remote_last_change and last_pulled and remote_last_change <= last_pulled:
                        # Nada cambió en Firestore desde nuestra última descarga. Consumo: 1 lectura sola.
                        return 0
            except Exception as e:
                print(f"[FirebaseSync] Aviso comprobando global_state: {e}", flush=True)
        elif bypass_global_check and not remote_last_change:
            try:
                g_doc = _firestore_db.collection('sync_metadata').document('global_state').get()
                if g_doc.exists:
                    g_dict = g_doc.to_dict() or {}
                    remote_last_change = str(g_dict.get('last_change') or '')
            except Exception:
                pass

        total_pulled = 0
        conn = db_manager.get_connection()
        cursor = conn.cursor()

        current_pull_time = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        force_tables_set = set(force_tables or [])
        if bypass_global_check and not force_tables:
            force_tables_set = {'proveedores', 'categorias_gastos', 'pagos_no_registrados'}

        for table in SYNC_TABLES:
            try:
                cursor.execute(f"PRAGMA table_info({table})")
                valid_cols = {col['name'] for col in cursor.fetchall()}

                # Comprobar si esta tabla en particular está vacía en SQLite local
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                cnt_tbl = cursor.fetchone()[0]

                tbl_force_full = force_full or (table in force_tables_set)

                # Leer timestamp guardado directamente en la misma conexión
                cursor.execute("SELECT valor FROM configuraciones WHERE clave = ?", (f'last_pull_{table}',))
                row_cfg = cursor.fetchone()
                saved_ts = row_cfg['valor'] if row_cfg else ''

                if not saved_ts and not tbl_force_full and cnt_tbl > 0:
                    try:
                        cursor.execute(f"SELECT MAX(updated_at) as max_u FROM {table}")
                        r_max = cursor.fetchone()
                        if r_max and r_max['max_u']:
                            saved_ts = str(r_max['max_u'])
                            cursor.execute('''
                                INSERT INTO configuraciones (clave, valor) VALUES (?, ?)
                                ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
                            ''', (f'last_pull_{table}', saved_ts))
                            conn.commit()
                    except Exception:
                        pass

                # Clamping anti-desfase / reloj futuro (ej. contaminación previa UTC):
                if saved_ts and saved_ts > current_pull_time:
                    saved_ts = ''

                # Si tbl_force_full es True O la tabla local está vacía, se descarga completa de Firestore
                last_ts = '' if (tbl_force_full or cnt_tbl == 0) else saved_ts

                query = _firestore_db.collection(table)
                if last_ts:
                    try:
                        from google.cloud.firestore_v1.base_query import FieldFilter
                        query = query.where(filter=FieldFilter('updated_at', '>', last_ts))
                    except Exception:
                        query = query.where('updated_at', '>', last_ts)

                docs = list(query.stream())
                for doc in docs:
                    data = doc.to_dict()
                    rec_uuid = doc.id or data.get('uuid')
                    if not rec_uuid:
                        continue

                    remote_updated = str(data.get('updated_at', ''))

                    cursor.execute(f"SELECT id, updated_at FROM {table} WHERE uuid = ?", (rec_uuid,))
                    local_row = cursor.fetchone()

                    if local_row:
                        local_updated = str(local_row['updated_at'] or '')
                        if (remote_updated and remote_updated > local_updated) or tbl_force_full:
                            set_cols = [k for k in data.keys() if k not in ('id', 'uuid') and k in valid_cols]
                            if set_cols:
                                set_clause = ", ".join([f"{k} = ?" for k in set_cols])
                                values = [data[k] for k in set_cols]
                                values.extend([1, rec_uuid])
                                cursor.execute(f"UPDATE {table} SET {set_clause}, sync_status = ? WHERE uuid = ?", values)
                                total_pulled += 1
                    else:
                        existing_match = None
                        if table == 'arca_compras_csv' and data.get('nro_doc_emisor') and data.get('punto_venta') and data.get('nro_comprobante'):
                            cursor.execute(
                                "SELECT id FROM arca_compras_csv WHERE nro_doc_emisor = ? AND punto_venta = ? AND nro_comprobante = ?",
                                (str(data['nro_doc_emisor']), str(data['punto_venta']), str(data['nro_comprobante']))
                            )
                            existing_match = cursor.fetchone()
                        elif table == 'proveedores' and data.get('nombre'):
                            cursor.execute(
                                "SELECT id FROM proveedores WHERE LOWER(TRIM(nombre)) = ?",
                                (str(data['nombre']).strip().lower(),)
                            )
                            existing_match = cursor.fetchone()
                        elif table == 'categorias_gastos' and data.get('nombre'):
                            cursor.execute(
                                "SELECT id FROM categorias_gastos WHERE LOWER(TRIM(nombre)) = ?",
                                (str(data['nombre']).strip().lower(),)
                            )
                            existing_match = cursor.fetchone()

                        if existing_match:
                            set_cols = [k for k in data.keys() if k not in ('id', 'uuid') and k in valid_cols]
                            if set_cols:
                                set_clause = ", ".join([f"{k} = ?" for k in set_cols])
                                values = [data[k] for k in set_cols]
                                values.extend([rec_uuid, 1, existing_match['id']])
                                cursor.execute(f"UPDATE {table} SET {set_clause}, uuid = ?, sync_status = ? WHERE id = ?", values)
                                total_pulled += 1
                        else:
                            data['uuid'] = rec_uuid
                            data['sync_status'] = 1
                            keys = [k for k in data.keys() if k != 'id' and k in valid_cols]
                            cols_str = ", ".join(keys)
                            placeholders = ", ".join(["?"] * len(keys))
                            vals = [data[k] for k in keys]
                            try:
                                cursor.execute(f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})", vals)
                                total_pulled += 1
                            except Exception as e_ins:
                                pass

                cursor.execute('''
                    INSERT INTO configuraciones (clave, valor) VALUES (?, ?)
                    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
                ''', (f'last_pull_{table}', current_pull_time))
                conn.commit()
            except Exception as ex:
                err_str = str(ex)
                if 'Quota exceeded' in err_str or 'RESOURCE_EXHAUSTED' in err_str or '429' in err_str:
                    SYNC_STATUS["mode"] = "ERROR"
                    SYNC_STATUS["message"] = "Cuota de Firebase en proceso de actualización / propagación"
                print(f"[FirebaseSync] Error pull tabla {table}: {ex}", flush=True)

        state_val = remote_last_change if remote_last_change else current_pull_time
        cursor.execute('''
            INSERT INTO configuraciones (clave, valor) VALUES (?, ?)
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
        ''', ('last_pulled_global_state', state_val))
        conn.commit()

        if total_pulled > 0 or bypass_global_check:
            SYNC_STATUS["last_remote_update"] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
            print(f"[FirebaseSync] Integrados {total_pulled} registros desde la nube a SQLite local.", flush=True)

        conn.commit()
        conn.close()
        return total_pulled
    finally:
        if not _already_locked:
            _sync_lock.release()

def check_initial_hydration():
    """
    Si la base SQLite local está vacía (común en Railway tras un nuevo despliegue sin volumen persistente),
    descarga inmediatamente todos los registros desde Firebase para que la pantalla no quede en blanco.
    """
    if not _firestore_db:
        return
    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        total_local = 0
        for t in ('arca_compras_csv', 'proveedores', 'recaudacion_diaria', 'gastos_fijos'):
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {t}")
                total_local += cursor.fetchone()[0]
            except Exception:
                pass
        conn.close()

        if total_local == 0:
            print("[FirebaseSync] Base de datos local vacía (nuevo contenedor/despliegue). Hidratando registros desde Firebase...", flush=True)
            pull_remote_changes(force_full=True)
            print("[FirebaseSync] Hidratación inicial completada exitosamente.", flush=True)
    except Exception as e:
        print(f"[FirebaseSync] Error en hidratación inicial: {e}", flush=True)

def sync_cycle(force_pull=False, force_tables=None, _caller='auto'):
    """
    Un ciclo completo e inteligente de sincronización:
    - Push: Solo si existen registros locales pendientes (sync_status = 0) verificados en SQLite local.
    - Pull: Solo si se solicita expresamente (force_pull=True), si pasaron >= 30 min (heartbeat de seguridad con realtime activo),
            o si pasaron >= 2 min en caso de que el listener en tiempo real haya fallado (fallback).
    """
    global _last_routine_pull_ts
    if not _firestore_db:
        if not init_firebase():
            return
    if not _sync_lock.acquire(timeout=60):
        print("[FirebaseSync] Timeout esperando sync_lock en sync_cycle.", flush=True)
        return
    try:
        # 1. PUSH local changes: Solo si realmente hay datos pendientes en SQLite
        pushed = 0
        if has_pending_local_changes():
            pushed = push_local_changes(_already_locked=True)

        # 2. PULL remote changes:
        # Si force_pull=True (p.ej. botón manual en UI), se fuerza pull con bypass_global_check=True
        # En reposo nocturno o inactividad diurna con listener activo: 0 lecturas innecesarias.
        now = time.time()
        should_pull = force_pull
        if not should_pull:
            if not _listener_registered:
                # Fallback sin listener: polling cada 2 minutos
                if now - _last_routine_pull_ts >= 120:
                    should_pull = True
            else:
                # Listener en tiempo real activo: latido preventivo esporádico cada 30 minutos
                if now - _last_routine_pull_ts >= 1800:
                    should_pull = True

        pulled = 0
        if should_pull:
            bypass = force_pull
            ftables = force_tables if force_tables is not None else (['proveedores', 'categorias_gastos', 'pagos_no_registrados'] if force_pull else None)
            pulled = pull_remote_changes(force_full=False, _already_locked=True, bypass_global_check=bypass, force_tables=ftables)
            _last_routine_pull_ts = now

        SYNC_STATUS["last_sync"] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        if SYNC_STATUS["mode"] == "ERROR" and "Cuota" in str(SYNC_STATUS.get("message", "")):
            SYNC_STATUS["mode"] = "ONLINE_SYNC"
            SYNC_STATUS["message"] = "Conectado a Firebase Cloud Sync Relay"
    except Exception as e:
        SYNC_STATUS["error"] = str(e)
    finally:
        _sync_lock.release()

def _sync_worker_loop(interval=15):
    print(f"[FirebaseSync] Hilo de sincronización inteligente iniciado (Intervalo de sondeo local: {interval}s).", flush=True)
    if not _firestore_db:
        init_firebase()
    if _firestore_db:
        check_initial_hydration()

    while not _stop_event.is_set():
        if not _firestore_db:
            init_firebase()
        if _firestore_db:
            try:
                sync_cycle(force_pull=False)
            except Exception as e:
                print(f"[FirebaseSync] Error en ciclo de sincronización: {e}", flush=True)
        time.sleep(interval)

def start_sync_engine(interval=15):
    global _sync_thread
    init_firebase()
    if _sync_thread is None or not _sync_thread.is_alive():
        _stop_event.clear()
        _sync_thread = threading.Thread(target=_sync_worker_loop, args=(interval,), daemon=True)
        _sync_thread.start()

def get_sync_status():
    if not _firestore_db:
        init_firebase()

    conn = db_manager.get_connection()
    cursor = conn.cursor()
    total = 0
    pending = 0
    synced = 0
    for table in SYNC_TABLES:
        try:
            cursor.execute(f"SELECT COUNT(*), SUM(CASE WHEN sync_status = 1 THEN 1 ELSE 0 END) FROM {table}")
            t_cnt, s_cnt = cursor.fetchone()
            t_cnt = t_cnt or 0
            s_cnt = s_cnt or 0
            total += t_cnt
            synced += s_cnt
            pending += (t_cnt - s_cnt)
        except Exception:
            pass
    conn.close()

    percent = round((synced / total) * 100, 1) if total > 0 else 100.0

    SYNC_STATUS["total_count"] = total
    SYNC_STATUS["synced_count"] = synced
    SYNC_STATUS["pending_count"] = pending
    SYNC_STATUS["progress_percent"] = percent
    return SYNC_STATUS
