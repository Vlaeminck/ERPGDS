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
    'retiros_recaudacion'
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

_listener_registered = False

def _setup_realtime_listener():
    global _listener_registered
    if not _firestore_db or _listener_registered:
        return
    try:
        def on_global_state_change(doc_snapshot, changes, read_time):
            for change in changes:
                if change.type.name in ('ADDED', 'MODIFIED'):
                    print("[FirebaseSync] Novedad remota detectada en tiempo real. Ejecutando Pull...", flush=True)
                    pull_remote_changes()

        doc_ref = _firestore_db.collection('sync_metadata').document('global_state')
        doc_ref.on_snapshot(on_global_state_change)
        _listener_registered = True
        print("[FirebaseSync] Escuchador de eventos remotos en tiempo real (on_snapshot) activo.", flush=True)
    except Exception as e:
        print(f"[FirebaseSync] Aviso: Listener realtime no pudo iniciarse (se usará polling): {e}", flush=True)

def push_local_changes():
    """Sube registros nuevos o actualizados (sync_status = 0) desde SQLite a Firebase."""
    if not _firestore_db:
        return 0

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
            _firestore_db.collection('sync_metadata').document('global_state').set({'last_change': now_iso})
        except Exception:
            pass

    conn.close()
    return total_pushed

_table_pull_timestamps = {}

def reconcile_with_firestore(table=None):
    """
    Compara los UUIDs existentes en Firestore con los de SQLite:
    1. Si un registro estaba sincronizado (sync_status = 1) en SQLite pero ya NO existe en Firestore (fue eliminado), se elimina de SQLite.
    2. Si un documento existe en Firestore pero NO en SQLite, se descarga e inserta en SQLite.
    """
    if not _firestore_db:
        if not init_firebase():
            return 0
    
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

            # 1. Eliminar de SQLite los registros que fueron borrados en Firestore
            for r in local_rows:
                loc_id = r['id']
                loc_uuid = r['uuid']
                loc_sync = r['sync_status']
                if loc_uuid:
                    local_uuids.add(loc_uuid)
                    if loc_sync == 1 and loc_uuid not in remote_uuids:
                        cursor.execute(f"DELETE FROM {tbl} WHERE id = ?", (loc_id,))
                        total_reconciled += 1
                        print(f"[FirebaseSync] Reconciliación: Eliminado registro huérfano local en {tbl} (UUID: {loc_uuid})", flush=True)

            # 2. Insertar o actualizar documentos que están en Firestore
            for r_uuid, r_data in remote_docs_map.items():
                if r_uuid not in local_uuids:
                    r_data['uuid'] = r_uuid
                    r_data['sync_status'] = 1
                    keys = [k for k in r_data.keys() if k != 'id']
                    cols_str = ", ".join(keys)
                    placeholders = ", ".join(["?"] * len(keys))
                    vals = [r_data[k] for k in keys]
                    try:
                        cursor.execute(f"INSERT INTO {tbl} ({cols_str}) VALUES ({placeholders})", vals)
                        total_reconciled += 1
                    except Exception as ins_err:
                        if 'UNIQUE' in str(ins_err) and tbl == 'arca_compras_csv':
                            try:
                                set_cols = [k for k in r_data.keys() if k not in ('id', 'uuid')]
                                set_clause = ", ".join([f"{k} = ?" for k in set_cols])
                                values = [r_data[k] for k in set_cols]
                                values.extend([r_uuid, 1, r_data.get('cuit_emisor'), r_data.get('punto_de_venta'), r_data.get('numero_desde')])
                                cursor.execute(f"UPDATE {tbl} SET {set_clause}, uuid = ?, sync_status = ? WHERE cuit_emisor = ? AND punto_de_venta = ? AND numero_desde = ?", values)
                                total_reconciled += 1
                            except Exception:
                                pass

            conn.commit()
        except Exception as e:
            print(f"[FirebaseSync] Error en reconciliación de {tbl}: {e}", flush=True)

    conn.close()
    if total_reconciled > 0:
        SYNC_STATUS["last_remote_update"] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
    return total_reconciled

def pull_remote_changes(force_full=False):
    """Descarga e integra deltas por tabla desde Firebase a SQLite local."""
    global _table_pull_timestamps
    if not _firestore_db:
        if not init_firebase():
            return 0

    total_pulled = 0
    conn = db_manager.get_connection()
    cursor = conn.cursor()

    current_pull_time = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for table in SYNC_TABLES:
        try:
            last_ts = '' if force_full else _table_pull_timestamps.get(table)

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
                    if remote_updated >= local_updated or force_full:
                        set_cols = [k for k in data.keys() if k not in ('id', 'uuid')]
                        if set_cols:
                            set_clause = ", ".join([f"{k} = ?" for k in set_cols])
                            values = [data[k] for k in set_cols]
                            values.extend([1, rec_uuid])
                            cursor.execute(f"UPDATE {table} SET {set_clause}, sync_status = ? WHERE uuid = ?", values)
                            total_pulled += 1
                else:
                    data['uuid'] = rec_uuid
                    data['sync_status'] = 1
                    keys = [k for k in data.keys() if k != 'id']
                    cols_str = ", ".join(keys)
                    placeholders = ", ".join(["?"] * len(keys))
                    vals = [data[k] for k in keys]
                    try:
                        cursor.execute(f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})", vals)
                        total_pulled += 1
                    except Exception as e_ins:
                        if 'UNIQUE constraint failed' in str(e_ins):
                            if table == 'proveedores' and 'nombre' in data:
                                cursor.execute(
                                    "UPDATE proveedores SET cuit=?, categoria=?, keywords=?, detalles=?, uuid=?, updated_at=?, sync_status=1 WHERE nombre=?",
                                    (data.get('cuit', ''), data.get('categoria', 'General'), data.get('keywords', '[]'), data.get('detalles', '{}'), rec_uuid, remote_updated, data['nombre'])
                                )
                                total_pulled += 1
                            elif table == 'arca_compras_csv':
                                set_cols = [k for k in data.keys() if k not in ('id', 'uuid')]
                                set_clause = ", ".join([f"{k} = ?" for k in set_cols])
                                values = [data[k] for k in set_cols]
                                values.extend([rec_uuid, 1, data.get('cuit_emisor'), data.get('punto_de_venta'), data.get('numero_desde')])
                                cursor.execute(f"UPDATE {table} SET {set_clause}, uuid = ?, sync_status = ? WHERE cuit_emisor = ? AND punto_de_venta = ? AND numero_desde = ?", values)
                                total_pulled += 1
                            elif table == 'recaudacion_diaria' and 'fecha' in data:
                                set_cols = ", ".join([f"{k}=?" for k in keys if k != 'fecha'])
                                vals_u = [data[k] for k in keys if k != 'fecha'] + [data['fecha']]
                                cursor.execute(f"UPDATE recaudacion_diaria SET {set_cols}, uuid=?, sync_status=1 WHERE fecha=?", vals_u + [rec_uuid])
                                total_pulled += 1
                            elif table == 'estacionamiento_diario' and 'fecha' in data:
                                set_cols = ", ".join([f"{k}=?" for k in keys if k != 'fecha'])
                                vals_u = [data[k] for k in keys if k != 'fecha'] + [data['fecha']]
                                cursor.execute(f"UPDATE estacionamiento_diario SET {set_cols}, uuid=?, sync_status=1 WHERE fecha=?", vals_u + [rec_uuid])
                                total_pulled += 1
                            elif table == 'caja_chica_arqueo' and 'fecha' in data:
                                set_cols = ", ".join([f"{k}=?" for k in keys if k != 'fecha'])
                                vals_u = [data[k] for k in keys if k != 'fecha'] + [data['fecha']]
                                cursor.execute(f"UPDATE caja_chica_arqueo SET {set_cols}, uuid=?, sync_status=1 WHERE fecha=?", vals_u + [rec_uuid])
                                total_pulled += 1

            _table_pull_timestamps[table] = current_pull_time
        except Exception as ex:
            err_str = str(ex)
            if 'Quota exceeded' in err_str or 'RESOURCE_EXHAUSTED' in err_str or '429' in err_str:
                SYNC_STATUS["mode"] = "ERROR"
                SYNC_STATUS["message"] = "Cuota de Firebase en proceso de actualización / propagación"
            print(f"[FirebaseSync] Error pull tabla {table}: {ex}", flush=True)

    if total_pulled > 0:
        SYNC_STATUS["last_remote_update"] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
        print(f"[FirebaseSync] Integrados {total_pulled} registros desde la nube a SQLite local.", flush=True)

    conn.commit()
    conn.close()
    return total_pulled

def sync_cycle():
    """Un ciclo completo de sincronización (Push + Pull)."""
    if not _firestore_db:
        if not init_firebase():
            return
    try:
        pushed = push_local_changes()
        pulled = pull_remote_changes()
        SYNC_STATUS["last_sync"] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        if SYNC_STATUS["mode"] == "ERROR" and "Cuota" in str(SYNC_STATUS.get("message", "")):
            SYNC_STATUS["mode"] = "ONLINE_SYNC"
            SYNC_STATUS["message"] = "Conectado a Firebase Cloud Sync Relay"
    except Exception as e:
        SYNC_STATUS["error"] = str(e)

def _sync_worker_loop(interval=10):
    print(f"[FirebaseSync] Hilo de sincronización iniciado (Intervalo: {interval}s).", flush=True)
    cycle_count = 0
    while not _stop_event.is_set():
        if not _firestore_db:
            init_firebase()
        if _firestore_db:
            sync_cycle()
            cycle_count += 1
            if cycle_count >= 30:
                cycle_count = 0
                try:
                    reconcile_with_firestore()
                except Exception:
                    pass
        time.sleep(interval)

def start_sync_engine(interval=10):
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
