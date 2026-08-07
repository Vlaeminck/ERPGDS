import os
import time
import json
import uuid
import datetime
import threading
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

def init_firebase():
    global _firestore_db, SYNC_STATUS
    creds_path = getattr(config, 'FIREBASE_CREDENTIALS_PATH', os.path.join(os.path.dirname(__file__), 'firebase_credentials.json'))
    
    if not os.path.exists(creds_path):
        SYNC_STATUS["enabled"] = False
        SYNC_STATUS["mode"] = "OFFLINE_LOCAL"
        SYNC_STATUS["message"] = "Coloque firebase_credentials.json para activar Cloud Sync"
        print("[FirebaseSync] Modo Local Activo (Sin credenciales de Firebase aún).", flush=True)
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            cred = credentials.Certificate(creds_path)
            firebase_admin.initialize_app(cred)

        _firestore_db = firestore.client()
        SYNC_STATUS["enabled"] = True
        SYNC_STATUS["mode"] = "ONLINE_SYNC"
        SYNC_STATUS["message"] = "Conectado a Firebase Cloud Sync Relay"
        print("[FirebaseSync] Conectado exitosamente a Firebase Firestore!", flush=True)
        return True
    except Exception as e:
        SYNC_STATUS["enabled"] = False
        SYNC_STATUS["mode"] = "ERROR"
        SYNC_STATUS["message"] = f"Error al inicializar Firebase: {str(e)}"
        SYNC_STATUS["error"] = str(e)
        print(f"[FirebaseSync] Error inicializando Firebase: {e}", flush=True)
        return False

def push_local_changes():
    """Sincroniza cambios locales (sync_status = 0) hacia Firebase Firestore."""
    if not _firestore_db:
        return 0

    total_pushed = 0
    conn = db_manager.get_connection()
    cursor = conn.cursor()

    for table in SYNC_TABLES:
        try:
            cursor.execute(f"SELECT * FROM {table} WHERE sync_status = 0")
            rows = cursor.fetchall()
            for r in rows:
                r_dict = dict(r)
                record_uuid = r_dict.get('uuid')
                if not record_uuid:
                    record_uuid = uuid.uuid4().hex
                    now_iso = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    cursor.execute(f"UPDATE {table} SET uuid = ?, updated_at = ? WHERE id = ?", (record_uuid, now_iso, r_dict['id']))
                    r_dict['uuid'] = record_uuid
                    r_dict['updated_at'] = now_iso

                # Formatear datos para Firestore
                doc_data = {k: v for k, v in r_dict.items() if k != 'id'}
                doc_data['sync_status'] = 1

                # Subir a la colección Firestore /{table}/{uuid}
                doc_ref = _firestore_db.collection(table).document(record_uuid)
                doc_ref.set(doc_data, merge=True)

                # Marcar como sincronizado en SQLite
                cursor.execute(f"UPDATE {table} SET sync_status = 1 WHERE id = ?", (r_dict['id'],))
                total_pushed += 1
        except Exception as ex:
            print(f"[FirebaseSync] Error push tabla {table}: {ex}", flush=True)

    conn.commit()
    conn.close()
    return total_pushed

def pull_remote_changes():
    """Descarga e integra cambios nuevos o actualizados desde Firebase a SQLite local."""
    if not _firestore_db:
        return 0

    total_pulled = 0
    conn = db_manager.get_connection()
    cursor = conn.cursor()

    for table in SYNC_TABLES:
        try:
            # Obtener documentos de Firestore
            docs = _firestore_db.collection(table).stream()
            for doc in docs:
                data = doc.to_dict()
                rec_uuid = doc.id or data.get('uuid')
                if not rec_uuid:
                    continue

                remote_updated = data.get('updated_at', '')

                # Verificar si existe en SQLite por UUID
                cursor.execute(f"SELECT id, updated_at FROM {table} WHERE uuid = ?", (rec_uuid,))
                local_row = cursor.fetchone()

                if local_row:
                    local_updated = local_row['updated_at'] or ''
                    if remote_updated > local_updated:
                        # Actualizar en SQLite
                        set_clause = ", ".join([f"{k} = ?" for k in data.keys() if k not in ('id', 'uuid')])
                        values = [data[k] for k in data.keys() if k not in ('id', 'uuid')]
                        values.extend([1, rec_uuid]) # sync_status = 1
                        cursor.execute(f"UPDATE {table} SET {set_clause}, sync_status = ? WHERE uuid = ?", values)
                        total_pulled += 1
                else:
                    # Insertar nuevo registro en SQLite
                    data['uuid'] = rec_uuid
                    data['sync_status'] = 1
                    keys = list(data.keys())
                    cols_str = ", ".join(keys)
                    placeholders = ", ".join(["?"] * len(keys))
                    vals = [data[k] for k in keys]
                    try:
                        cursor.execute(f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})", vals)
                        total_pulled += 1
                    except Exception:
                        pass
        except Exception as ex:
            print(f"[FirebaseSync] Error pull tabla {table}: {ex}", flush=True)

    conn.commit()
    conn.close()
    return total_pulled

def sync_cycle():
    """Un ciclo completo de sincronización (Push + Pull)."""
    if not _firestore_db:
        return
    try:
        pushed = push_local_changes()
        pulled = pull_remote_changes()
        SYNC_STATUS["last_sync"] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        SYNC_STATUS["synced_count"] += (pushed + pulled)
    except Exception as e:
        SYNC_STATUS["error"] = str(e)

def _sync_worker_loop(interval=10):
    print(f"[FirebaseSync] Hilo de sincronización iniciado (Intervalo: {interval}s).", flush=True)
    while not _stop_event.is_set():
        if _firestore_db:
            sync_cycle()
        time.sleep(interval)

def start_sync_engine(interval=10):
    global _sync_thread
    init_firebase()
    if _sync_thread is None or not _sync_thread.is_alive():
        _stop_event.clear()
        _sync_thread = threading.Thread(target=_sync_worker_loop, args=(interval,), daemon=True)
        _sync_thread.start()

def get_sync_status():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    pending = 0
    for table in SYNC_TABLES:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE sync_status = 0")
            pending += cursor.fetchone()[0]
        except Exception:
            pass
    conn.close()

    SYNC_STATUS["pending_count"] = pending
    return SYNC_STATUS
