import sys
import os
import time
import threading
import importlib
from datetime import datetime
from flask import Flask, render_template, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename
from watcher import watcher_manager
from update_suppliers import update_config_suppliers
import doctor
import config
import license_manager
import db_manager

try:
    db_manager.init_db()
except Exception as e:
    print(f"Error al inicializar DB control interno: {e}")

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)

app.config['UPLOAD_FOLDER'] = config.CSV_ARCA_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16 MB max

# Control de ciclo de vida (Auto-Apagado)
last_ping_time = time.time()

@app.before_request
def update_last_ping():
    global last_ping_time
    last_ping_time = time.time()

@app.route('/api/ping', methods=['POST'])
def ping():
    global last_ping_time
    last_ping_time = time.time()
    return jsonify({"status": "ok"})

@app.after_request
def add_header(response):
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '-1'
    return response

def count_files(directory):
    if not os.path.exists(directory):
        return 0
    valid_exts = tuple(config.ALLOWED_EXTENSIONS)
    return sum(1 for root, dirs, files in os.walk(directory) for f in files if f.lower().endswith(valid_exts))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status')
def status():
    pending = count_files(config.INPUT_FOLDER)
    processed = count_files(config.OUTPUT_FOLDER)
    unrecognized = count_files(config.UNRECOGNIZED_FOLDER)
    remitos = count_files(config.REMITOS_FOLDER)
    
    return jsonify({
        "watcher_running": watcher_manager.is_running,
        "stats": {
            "pending": pending,
            "processed": processed,
            "unrecognized": unrecognized,
            "remitos": remitos
        }
    })

@app.route('/api/suppliers')
def get_suppliers():
    importlib.reload(config)
    suppliers = []
    for name, data in config.SUPPLIERS.items():
        suppliers.append({
            "name": name,
            "keywords": data.get("keywords", []),
            "regex": data.get("invoice_regex", "")
        })
    return jsonify(suppliers)

@app.route('/api/suppliers/stats')
def supplier_stats():
    importlib.reload(config)
    current_year = str(datetime.now().year)
    total_suppliers = len(config.SUPPLIERS)
    
    supplier_counts = {}
    total_invoices_ytd = 0
    valid_exts = tuple(config.ALLOWED_EXTENSIONS) if hasattr(config, 'ALLOWED_EXTENSIONS') else ('.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp')

    if os.path.exists(config.OUTPUT_FOLDER):
        for root, dirs, files in os.walk(config.OUTPUT_FOLDER):
            for file in files:
                if file.startswith('.') or not file.lower().endswith(valid_exts):
                    continue
                rel_path = os.path.relpath(os.path.join(root, file), config.OUTPUT_FOLDER)
                parts = rel_path.replace('\\', '/').split('/')
                if len(parts) >= 4:
                    year, month, supplier = parts[0], parts[1], parts[2]
                else:
                    year, month, supplier = "-", "-", "Desconocido"
                
                if year == current_year:
                    total_invoices_ytd += 1
                    supplier_counts[supplier] = supplier_counts.get(supplier, 0) + 1

    sorted_suppliers = sorted(supplier_counts.items(), key=lambda x: x[1], reverse=True)
    
    top_10 = []
    for rank, (supplier_name, count) in enumerate(sorted_suppliers[:10], 1):
        pct = round((count / total_invoices_ytd * 100), 1) if total_invoices_ytd > 0 else 0
        top_10.append({
            "rank": rank,
            "name": supplier_name,
            "count": count,
            "percentage": pct
        })
        
    return jsonify({
        "total_suppliers": total_suppliers,
        "current_year": current_year,
        "total_invoices_ytd": total_invoices_ytd,
        "top_suppliers": top_10
    })

@app.route('/api/progress')
def progress():
    return jsonify({
        "is_processing_batch": watcher_manager.is_processing_batch,
        "is_ai_processing": watcher_manager.is_ai_processing,
        "total": watcher_manager.total_files_to_process,
        "processed": watcher_manager.files_processed_so_far
    })

@app.route('/api/processed_invoices')
def processed_invoices():
    invoices = []
    if os.path.exists(config.OUTPUT_FOLDER):
        for root, dirs, files in os.walk(config.OUTPUT_FOLDER):
            for file in files:
                if file == '.gitkeep':
                    continue
                rel_path = os.path.relpath(os.path.join(root, file), config.OUTPUT_FOLDER)
                parts = rel_path.replace('\\', '/').split('/')
                if len(parts) >= 4:
                    year, month, supplier = parts[0], parts[1], parts[2]
                    filename = parts[-1]
                else:
                    year, month, supplier = "-", "-", "Desconocido"
                    filename = file
                    
                invoices.append({
                    "filename": filename,
                    "supplier": supplier,
                    "date": f"{month} {year}",
                    "path": rel_path.replace('\\', '/')
                })
    return jsonify(invoices)

def parse_error_log():
    log_path = os.path.join(config.REGISTROS_FOLDER, "errores_debug.txt")
    error_map = {}
    if not os.path.exists(log_path):
        return error_map
        
    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        blocks = content.split("=========================================")
        for block in blocks:
            lines = [l.strip() for l in block.strip().split('\n') if l.strip()]
            if not lines:
                continue
            
            timestamp = ""
            filename = ""
            error_type = ""
            details = []
            in_details = False
            
            for line in lines:
                if line.startswith("Fecha/Hora:"):
                    timestamp = line.replace("Fecha/Hora:", "").strip()
                elif line.startswith("Archivo:"):
                    filename = line.replace("Archivo:", "").strip()
                elif line.startswith("Tipo de Error:"):
                    error_type = line.replace("Tipo de Error:", "").strip()
                elif line.startswith("Detalles:"):
                    in_details = True
                elif in_details:
                    details.append(line)
                    
            if filename:
                error_map[filename] = {
                    "timestamp": timestamp,
                    "error_type": error_type or "No reconocido",
                    "details": "\n".join(details) if details else "Sin detalles adicionales."
                }
    except Exception as e:
        print(f"Error parseando errores_debug.txt: {e}")
        
    return error_map

@app.route('/api/unrecognized_invoices')
def unrecognized_invoices():
    error_map = parse_error_log()
    invoices = []
    if os.path.exists(config.UNRECOGNIZED_FOLDER):
        for root, dirs, files in os.walk(config.UNRECOGNIZED_FOLDER):
            for file in files:
                if file == '.gitkeep':
                    continue
                rel_path = os.path.relpath(os.path.join(root, file), config.UNRECOGNIZED_FOLDER).replace('\\', '/')
                err_info = error_map.get(file, {
                    "timestamp": "-",
                    "error_type": "No reconocido",
                    "details": "El comprobante no pudo ser clasificado como factura fiscal ni remito."
                })
                invoices.append({
                    "filename": file,
                    "error_type": err_info["error_type"],
                    "details": err_info["details"],
                    "date": err_info["timestamp"],
                    "path": rel_path
                })
    return jsonify(invoices)

@app.route('/api/unrecognized_file/<path:filepath>')
def serve_unrecognized_file(filepath):
    return send_from_directory(config.UNRECOGNIZED_FOLDER, filepath)

@app.route('/api/processed_remitos')
def processed_remitos():
    remitos = []
    if os.path.exists(config.REMITOS_FOLDER):
        for root, dirs, files in os.walk(config.REMITOS_FOLDER):
            for file in files:
                if file == '.gitkeep':
                    continue
                rel_path = os.path.relpath(os.path.join(root, file), config.REMITOS_FOLDER)
                parts = rel_path.replace('\\', '/').split('/')
                if len(parts) >= 3:
                    year, month = parts[0], parts[1]
                    filename = parts[-1]
                else:
                    year, month = "-", "-"
                    filename = file
                    
                remitos.append({
                    "filename": filename,
                    "supplier": "Remito / Comprobante No Fiscal",
                    "date": f"{month} {year}",
                    "path": rel_path.replace('\\', '/')
                })
    return jsonify(remitos)

@app.route('/api/remito_file/<path:filepath>')
def serve_remito_file(filepath):
    return send_from_directory(config.REMITOS_FOLDER, filepath)

@app.route('/api/user_history', methods=['GET', 'DELETE'])
def handle_user_history():
    from processor import get_user_history, clear_user_history
    if request.method == 'DELETE':
        success = clear_user_history()
        return jsonify({"success": success, "message": "Historial limpiado correctamente"})
    else:
        return jsonify(get_user_history())

@app.route('/api/file/<path:filepath>')
def serve_file(filepath):
    return send_from_directory(config.OUTPUT_FOLDER, filepath)

import zipfile

@app.route('/api/upload_csv', methods=['POST'])
def upload_csv():
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "message": "No se envió ningún archivo"}), 400
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({"success": False, "message": "Ningún archivo seleccionado"}), 400
            
        raw_name = file.filename
        ext = os.path.splitext(raw_name)[1].lower()
        
        if ext in ['.csv', '.zip']:
            safe_name = secure_filename(raw_name)
            name_part, ext_part = os.path.splitext(safe_name)
            timestamp = time.strftime('%Y%m%d_%H%M%S')
            
            if not name_part or len(name_part) < 2:
                final_name = f"upload_{timestamp}{ext_part}"
            else:
                final_name = f"{name_part}_{timestamp}{ext_part}"
                
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], final_name)
            
            try:
                file.save(file_path)
            except PermissionError:
                import uuid
                fallback_name = f"upload_{timestamp}_{uuid.uuid4().hex[:6]}{ext_part}"
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], fallback_name)
                file.save(file_path)
            
            if ext == '.zip':
                try:
                    with zipfile.ZipFile(file_path, 'r') as zip_ref:
                        for zip_info in zip_ref.infolist():
                            if zip_info.filename.lower().endswith('.csv'):
                                zip_info.filename = os.path.basename(zip_info.filename)
                                zip_ref.extract(zip_info, app.config['UPLOAD_FOLDER'])
                    os.remove(file_path)
                except Exception as e:
                    return jsonify({"success": False, "message": f"Error extrayendo ZIP: {e}"}), 500

            # Trigger update
            from update_suppliers import update_config_suppliers
            result = update_config_suppliers()
            
            # Reload processor indices and config so it recognizes new suppliers without restarting
            import processor
            processor.reload_config()
            
            if not result:
                result = {"success": True, "message": "Proceso finalizado correctamente."}
            elif isinstance(result, dict) and "success" not in result:
                result["success"] = True
            
            return jsonify(result)
            
        return jsonify({"success": False, "message": "Tipo de archivo inválido. Solo se admiten archivos CSV o ZIP."}), 400
    except Exception as e:
        print(f"Error en /api/upload_csv: {e}", flush=True)
        return jsonify({"success": False, "message": f"Error procesando archivo CSV: {str(e)}"}), 500

@app.route('/api/upload_invoice', methods=['POST'])
def upload_invoice():
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "message": "No se envió ningún archivo"}), 400
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({"success": False, "message": "Ningún archivo seleccionado"}), 400
            
        valid_exts = tuple(config.ALLOWED_EXTENSIONS)
        if file and file.filename.lower().endswith(valid_exts):
            raw_name = file.filename
            safe_name = secure_filename(raw_name)
            name, ext = os.path.splitext(raw_name)
            timestamp = time.strftime('%Y%m%d_%H%M%S')
            
            if not safe_name or len(safe_name) < 4:
                filename = f"factura_{timestamp}{ext.lower()}"
            else:
                s_name, s_ext = os.path.splitext(safe_name)
                filename = f"{s_name}_{timestamp}{s_ext}"
            
            file_path = os.path.join(config.INPUT_FOLDER, filename)
            file.save(file_path)
            
            # Iniciar el vigía automáticamente
            watcher_manager.start()
            
            return jsonify({"success": True, "message": "Factura cargada exitosamente"})
            
        return jsonify({"success": False, "message": "Tipo de archivo no permitido. Sube un PDF o Imagen."}), 400
    except Exception as e:
        print(f"Error en /api/upload_invoice: {e}", flush=True)
        return jsonify({"success": False, "message": f"Error al subir factura: {str(e)}"}), 500

@app.route('/api/license/status')
def license_status():
    force = request.args.get('force', 'false').lower() == 'true'
    status = license_manager.check_license_status(force_network=force)
    return jsonify(status)

@app.route('/api/watcher/start', methods=['POST'])
def start_watcher():
    lic_status = license_manager.check_license_status()
    if not lic_status.get("valid"):
        return jsonify({"success": False, "message": f"Licencia inactiva: {lic_status.get('message')}"})
    
    import processor
    processor.reload_config()
    
    success, msg = watcher_manager.start()
    return jsonify({"success": success, "message": msg})

@app.route('/api/watcher/stop', methods=['POST'])
def stop_watcher():
    success, msg = watcher_manager.stop()
    return jsonify({"success": success, "message": msg})

@app.route('/api/settings/api_key', methods=['POST'])
def save_api_key():
    data = request.get_json()
    api_key = data.get('api_key', '').strip()
    
    if not api_key:
        return jsonify({"success": False, "message": "La API Key no puede estar vacía"}), 400
        
    try:
        # Save to api_key.txt for compiled environments
        api_key_path = os.path.join(config.BASE_DIR, 'api_key.txt')
        obfuscated_key = config.obfuscate_key(api_key)
        with open(api_key_path, 'w', encoding='utf-8') as f:
            f.write(obfuscated_key)
        config.AI_API_KEY = api_key
        return jsonify({"success": True, "message": "API Key guardada correctamente"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Error al guardar la clave: {e}"}), 500

@app.route('/api/settings/get_api_key', methods=['GET'])
def get_api_key():
    key = getattr(config, 'AI_API_KEY', '')
    if key == "TU_API_KEY_AQUI":
        key = ""
    return jsonify({"api_key": key})

@app.route('/api/settings/cuit', methods=['POST'])
def save_cuit():
    data = request.get_json()
    cuit = data.get('cuit', '').strip()
    
    import re
    cuit_digits = re.sub(r'\D', '', cuit)
    if len(cuit_digits) == 11:
        cuit_formatted = f"{cuit_digits[:2]}-{cuit_digits[2:10]}-{cuit_digits[10]}"
    else:
        cuit_formatted = cuit
    
    try:
        cuit_path = os.path.join(config.BASE_DIR, 'my_cuit.txt')
        with open(cuit_path, 'w', encoding='utf-8') as f:
            f.write(cuit_formatted)
        config.MY_CUIT = cuit_formatted
        
        # Recargar para que processor también se entere (por si acaso)
        import processor
        processor.reload_config()
        
        return jsonify({"success": True, "message": "CUIT guardado correctamente"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Error al guardar CUIT: {e}"}), 500

@app.route('/api/settings/get_cuit', methods=['GET'])
def get_cuit():
    cuit = getattr(config, 'MY_CUIT', '')
    return jsonify({"cuit": cuit})

# --- Rutas Bot Sincronización ARCA ---
import arca_bot

@app.route('/api/arca/credentials', methods=['GET', 'POST'])
def arca_credentials():
    if request.method == 'GET':
        creds = arca_bot.get_arca_credentials()
        has_api_key = bool(config.AI_API_KEY and config.AI_API_KEY != "TU_API_KEY_AQUI")
        if creds:
            return jsonify({
                "configured": True,
                "cuit": creds.get("cuit", ""),
                "representada": creds.get("representada", ""),
                "has_clave": bool(creds.get("clave")),
                "has_api_key": has_api_key,
                "updated_at": creds.get("updated_at")
            })
        return jsonify({"configured": False, "cuit": "", "representada": "", "has_clave": False, "has_api_key": has_api_key})
    
    data = request.json or {}
    cuit = data.get("cuit", "")
    clave = data.get("clave", "")
    representada = data.get("representada", "")
    api_key = data.get("api_key", "").strip()

    if api_key:
        try:
            api_key_path = os.path.join(config.BASE_DIR, 'api_key.txt')
            obfuscated_key = config.obfuscate_key(api_key)
            with open(api_key_path, 'w', encoding='utf-8') as f:
                f.write(obfuscated_key)
            config.AI_API_KEY = api_key
        except Exception as e_key:
            print(f"Error guardando API Key en modal: {e_key}")

    try:
        arca_bot.save_arca_credentials(cuit, clave, representada)
        return jsonify({"success": True, "message": "Credenciales guardadas de forma segura."})
    except ValueError as ve:
        return jsonify({"success": False, "message": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": f"Error guardando credenciales: {e}"}), 500

@app.route('/api/arca/sync', methods=['POST'])
def arca_sync():
    lic_status = license_manager.check_license_status()
    if not lic_status.get("valid"):
        return jsonify({"success": False, "message": f"Licencia inactiva: {lic_status.get('message')}"})
    
    creds = arca_bot.get_arca_credentials()
    if not creds or not creds.get("cuit") or not creds.get("clave"):
        return jsonify({"success": False, "configured": False, "message": "Debes configurar tu CUIT y Clave Fiscal de ARCA antes de sincronizar."}), 400

    status = arca_bot.get_bot_status()
    if status.get("running"):
        return jsonify({"success": False, "message": "La sincronización con ARCA ya está en curso."})

    req_data = request.get_json(silent=True) or {}
    full_year = req_data.get("full_year", False)

    def run_async():
        res = arca_bot.run_arca_bot_sync(full_year=full_year)
        try:
            import processor
            processor.reload_config()
        except Exception as e_reload:
            print(f"Error reordenando configuración tras sync: {e_reload}")

    thread = threading.Thread(target=run_async)
    thread.start()
    return jsonify({"success": True, "message": "Iniciando sincronización automatizada con ARCA..."})

@app.route('/api/arca/status', methods=['GET'])
def arca_status():
    return jsonify(arca_bot.get_bot_status())

@app.route('/api/arca/logs', methods=['GET'])
def arca_logs():
    return jsonify({"logs": arca_bot.get_arca_logs()})

@app.route('/api/doctor/scan', methods=['GET'])
def doctor_scan():
    try:
        anomalies = doctor.scan_database()
        return jsonify({"success": True, "anomalies": anomalies})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/doctor/fix', methods=['POST'])
def doctor_fix():
    try:
        result = doctor.fix_database()
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

import threading

scanning_lock = threading.Lock()

@app.route('/api/open_scanner', methods=['POST'])
def open_scanner():
    lic_status = license_manager.check_license_status()
    if not lic_status.get("valid"):
        return jsonify({"success": False, "message": f"Licencia inactiva: {lic_status.get('message')}"})
        
    import subprocess
    import os
    import time
    from config import INPUT_FOLDER
    
    if not scanning_lock.acquire(blocking=False):
        return jsonify({"success": False, "message": "El escáner ya está en uso. Por favor espera a que termine el escaneo actual."})
        
    try:
        # Generar nombre de archivo único
        filename = f"Escáner_{time.strftime('%Y%m%d_%H%M%S')}.pdf"
        output_path = os.path.join(INPUT_FOLDER, filename)
        
        naps2_path = r"C:\Program Files\NAPS2\NAPS2.Console.exe"
        
        # Iniciar el vigía si no estaba corriendo (durará 5 min sin actividad)
        watcher_manager.start()
        
        def run_scanner():
            try:
                kwargs = {}
                if getattr(subprocess, 'CREATE_NO_WINDOW', None) is not None:
                    kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
                
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 0
                kwargs['startupinfo'] = startupinfo
                
                subprocess.run([naps2_path, '-o', output_path], **kwargs)
            except Exception as e:
                print(f"Error durante el escaneo con NAPS2: {e}", flush=True)
            finally:
                scanning_lock.release()
                
        # Ejecutar de fondo sin bloquear el servidor web
        thread = threading.Thread(target=run_scanner)
        thread.start()
        
        return jsonify({"success": True, "message": "Iniciando escaneo silencioso con NAPS2..."})
    except Exception as e:
        scanning_lock.release()
        return jsonify({"success": False, "message": f"Error: {e}"})

# ==========================================
# RUTAS DE CONTROL INTERNO (PLANILLAS ERP)
# ==========================================

@app.route('/api/recaudacion', methods=['GET', 'POST'])
def api_recaudacion():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    if request.method == 'POST':
        data = request.json or {}
        fecha = data.get('fecha')
        if not fecha:
            return jsonify({"error": "Fecha es requerida"}), 400
            
        nave_real = float(data.get('nave_real', 0))
        nave_maxi = float(data.get('nave_maxi', 0))
        diff_nave = nave_real - nave_maxi
        
        efectivo_real = float(data.get('efectivo_real', 0))
        efectivo_maxi = float(data.get('efectivo_maxi', 0))
        diff_efectivo = efectivo_real - efectivo_maxi
        
        py_real = float(data.get('py_real', 0))
        py_maxi = float(data.get('py_maxi', 0))
        diff_py = py_real - py_maxi
        
        mp_real = float(data.get('mp_real', 0))
        mp_maxi = float(data.get('mp_maxi', 0))
        diff_mp = mp_real - mp_maxi
        
        banco_real = float(data.get('banco_real', 0))
        banco_maxi = float(data.get('banco_maxi', 0))
        diff_banco = banco_real - banco_maxi
        
        total_diario = nave_real + efectivo_real + py_real + mp_real + banco_real
        diferencia_total = diff_nave + diff_efectivo + diff_py + diff_mp + diff_banco
        proyeccion = float(data.get('proyeccion_recaudacion', 0))
        diff_proy = total_diario - proyeccion
        
        cursor.execute('''
            INSERT INTO recaudacion_diaria (
                fecha, dia_nombre, efectivo_cub, cubiertos,
                nave_real, nave_maxi, diff_nave,
                efectivo_real, efectivo_maxi, diff_efectivo,
                py_real, py_maxi, diff_py,
                mp_real, mp_maxi, diff_mp,
                banco_real, banco_maxi, diff_banco,
                total_diario, diferencia_total, proyeccion_recaudacion, comentario, diff_proyeccion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fecha) DO UPDATE SET
                dia_nombre=excluded.dia_nombre,
                efectivo_cub=excluded.efectivo_cub,
                cubiertos=excluded.cubiertos,
                nave_real=excluded.nave_real,
                nave_maxi=excluded.nave_maxi,
                diff_nave=excluded.diff_nave,
                efectivo_real=excluded.efectivo_real,
                efectivo_maxi=excluded.efectivo_maxi,
                diff_efectivo=excluded.diff_efectivo,
                py_real=excluded.py_real,
                py_maxi=excluded.py_maxi,
                diff_py=excluded.diff_py,
                mp_real=excluded.mp_real,
                mp_maxi=excluded.mp_maxi,
                diff_mp=excluded.diff_mp,
                banco_real=excluded.banco_real,
                banco_maxi=excluded.banco_maxi,
                diff_banco=excluded.diff_banco,
                total_diario=excluded.total_diario,
                diferencia_total=excluded.diferencia_total,
                proyeccion_recaudacion=excluded.proyeccion_recaudacion,
                comentario=excluded.comentario,
                diff_proyeccion=excluded.diff_proyeccion
        ''', (
            fecha, data.get('dia_nombre', ''), int(data.get('efectivo_cub', 0)), int(data.get('cubiertos', 0)),
            nave_real, nave_maxi, diff_nave,
            efectivo_real, efectivo_maxi, diff_efectivo,
            py_real, py_maxi, diff_py,
            mp_real, mp_maxi, diff_mp,
            banco_real, banco_maxi, diff_banco,
            total_diario, diferencia_total, proyeccion, data.get('comentario', ''), diff_proy
        ))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    mes = request.args.get('mes')
    if mes and mes != 'all':
        cursor.execute("SELECT * FROM recaudacion_diaria WHERE fecha LIKE ? ORDER BY fecha ASC", (f"{mes}%",))
    else:
        cursor.execute("SELECT * FROM recaudacion_diaria ORDER BY fecha ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return jsonify(rows)


@app.route('/api/estacionamiento', methods=['GET', 'POST', 'DELETE'])
def api_estacionamiento():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    if request.method == 'DELETE':
        data = request.json or {}
        fecha = data.get('fecha')
        if fecha:
            cursor.execute("DELETE FROM estacionamiento_diario WHERE fecha = ?", (fecha,))
            conn.commit()
        conn.close()
        return jsonify({"success": True})

    if request.method == 'POST':
        data = request.json or {}
        fecha = data.get('fecha')
        if not fecha:
            return jsonify({"error": "Fecha requerida"}), 400
            
        caja_tc = float(data.get('caja_ticketcontrol', 0))
        cash = float(data.get('controlado_cash', 0))
        mp = float(data.get('controlado_mp', 0))
        total = cash + mp
        diferencia = total - caja_tc
        
        cursor.execute('''
            INSERT INTO estacionamiento_diario (fecha, dia_nombre, caja_ticketcontrol, controlado_cash, controlado_mp, total, diferencia, comentario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fecha) DO UPDATE SET
                dia_nombre=excluded.dia_nombre,
                caja_ticketcontrol=excluded.caja_ticketcontrol,
                controlado_cash=excluded.controlado_cash,
                controlado_mp=excluded.controlado_mp,
                total=excluded.total,
                diferencia=excluded.diferencia,
                comentario=excluded.comentario
        ''', (fecha, data.get('dia_nombre', ''), caja_tc, cash, mp, total, diferencia, data.get('comentario', '')))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    mes = request.args.get('mes')
    if mes and mes != 'all':
        cursor.execute("SELECT * FROM estacionamiento_diario WHERE fecha LIKE ? ORDER BY fecha ASC", (f"{mes}%",))
        rows = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT SUM(controlado_cash), SUM(controlado_mp), SUM(total), SUM(diferencia) FROM estacionamiento_diario WHERE fecha LIKE ?", (f"{mes}%",))
    else:
        cursor.execute("SELECT * FROM estacionamiento_diario ORDER BY fecha ASC")
        rows = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT SUM(controlado_cash), SUM(controlado_mp), SUM(total), SUM(diferencia) FROM estacionamiento_diario")
        
    tot_cash, tot_mp, tot_total, tot_diff = cursor.fetchone()
    tot_cash = tot_cash or 0
    tot_mp = tot_mp or 0
    tot_total = tot_total or 0
    tot_diff = tot_diff or 0
    
    # Gastos fijos propios del estacionamiento
    cursor.execute("SELECT SUM(monto) FROM estacionamiento_gastos")
    gasto_operativo = cursor.fetchone()[0] or 0
    ganancia_neta_estacionamiento = tot_total - gasto_operativo
    
    conn.close()
    return jsonify({
        "registros": rows,
        "totales": {
            "total_cash": tot_cash,
            "total_mp": tot_mp,
            "total_ganancia": tot_total,
            "total_diferencia": tot_diff,
            "gasto_operativo": gasto_operativo,
            "ganancia_neta": ganancia_neta_estacionamiento
        }
    })


@app.route('/api/estacionamiento/gastos', methods=['GET', 'POST', 'DELETE'])
def api_estacionamiento_gastos():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    if request.method == 'POST':
        data = request.json or {}
        concepto = data.get('concepto')
        monto = float(data.get('monto', 0))
        if not concepto:
            return jsonify({"error": "Concepto requerido"}), 400
            
        cursor.execute('''
            INSERT INTO estacionamiento_gastos (concepto, monto)
            VALUES (?, ?)
            ON CONFLICT(concepto) DO UPDATE SET monto=excluded.monto
        ''', (concepto, monto))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    elif request.method == 'DELETE':
        data = request.json or {}
        concepto = data.get('concepto')
        if concepto:
            cursor.execute("DELETE FROM estacionamiento_gastos WHERE concepto = ?", (concepto,))
            conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    cursor.execute("SELECT * FROM estacionamiento_gastos ORDER BY id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT SUM(monto) FROM estacionamiento_gastos")
    total_gasto = cursor.fetchone()[0] or 0
    conn.close()
    return jsonify({"gastos": rows, "total": total_gasto})


@app.route('/api/caja_chica/movimientos', methods=['GET', 'POST'])
def api_caja_chica_movimientos():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    if request.method == 'POST':
        data = request.json or {}
        fecha = data.get('fecha', datetime.now().strftime('%Y-%m-%d'))
        retirado = float(data.get('monto_retirado', 0))
        ingresado = float(data.get('monto_ingresado', 0))
        motivo = data.get('motivo', '')
        responsable = data.get('responsable', 'Admin')
        categoria = data.get('categoria', 'General')
        
        cursor.execute('''
            INSERT INTO caja_chica_movimientos (fecha, monto_retirado, monto_ingresado, motivo, responsable, categoria)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (fecha, retirado, ingresado, motivo, responsable, categoria))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    mes = request.args.get('mes')
    if mes and mes != 'all':
        cursor.execute("SELECT * FROM caja_chica_movimientos WHERE fecha LIKE ? ORDER BY id DESC", (f"{mes}%",))
        rows = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT SUM(monto_ingresado), SUM(monto_retirado) FROM caja_chica_movimientos WHERE fecha LIKE ?", (f"{mes}%",))
    else:
        cursor.execute("SELECT * FROM caja_chica_movimientos ORDER BY id DESC")
        rows = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT SUM(monto_ingresado), SUM(monto_retirado) FROM caja_chica_movimientos")
        
    tot_ing, tot_egr = cursor.fetchone()
    tot_ing = tot_ing or 0
    tot_egr = tot_egr or 0
    fondo_total = tot_ing - tot_egr
    pct_caja = round((tot_egr / tot_ing * 100), 2) if tot_ing > 0 else 0
    
    conn.close()
    return jsonify({
        "movimientos": rows,
        "resumen": {
            "ingresado_acumulado": tot_ing,
            "gasto_total": tot_egr,
            "fondo_total": fondo_total,
            "porcentaje_caja": pct_caja
        }
    })


@app.route('/api/caja_chica/arqueo', methods=['GET', 'POST'])
def api_caja_chica_arqueo():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    if request.method == 'POST':
        data = request.json or {}
        fecha = data.get('fecha', datetime.now().strftime('%Y-%m-%d'))
        b20k = int(data.get('b_20000', 0))
        b10k = int(data.get('b_10000', 0))
        b2k = int(data.get('b_2000', 0))
        b1k = int(data.get('b_1000', 0))
        b500 = int(data.get('b_500', 0))
        b200 = int(data.get('b_200', 0))
        b100 = int(data.get('b_100', 0))
        b50 = int(data.get('b_50', 0))
        b20 = int(data.get('b_20', 0))
        
        total_contado = (b20k * 20000) + (b10k * 10000) + (b2k * 2000) + (b1k * 1000) + \
                        (b500 * 500) + (b200 * 200) + (b100 * 100) + (b50 * 50) + (b20 * 20)
                        
        cursor.execute("SELECT SUM(monto_ingresado) - SUM(monto_retirado) FROM caja_chica_movimientos")
        fondo_sistema = cursor.fetchone()[0] or 0
        diff_arqueo = total_contado - fondo_sistema
        
        cursor.execute('''
            INSERT INTO caja_chica_arqueo (fecha, b_20000, b_10000, b_2000, b_1000, b_500, b_200, b_100, b_50, b_20, total_efectivo_contado, diferencia_arqueo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fecha) DO UPDATE SET
                b_20000=excluded.b_20000, b_10000=excluded.b_10000, b_2000=excluded.b_2000,
                b_1000=excluded.b_1000, b_500=excluded.b_500, b_200=excluded.b_200,
                b_100=excluded.b_100, b_50=excluded.b_50, b_20=excluded.b_20,
                total_efectivo_contado=excluded.total_efectivo_contado, diferencia_arqueo=excluded.diferencia_arqueo
        ''', (fecha, b20k, b10k, b2k, b1k, b500, b200, b100, b50, b20, total_contado, diff_arqueo))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "total_contado": total_contado, "diferencia": diff_arqueo})
        
    cursor.execute("SELECT * FROM caja_chica_arqueo ORDER BY fecha DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    return jsonify(dict(row) if row else {})


@app.route('/api/gastos_fijos', methods=['GET', 'POST'])
def api_gastos_fijos():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    if request.method == 'POST':
        data = request.json or {}
        concepto = data.get('concepto')
        monto = float(data.get('monto_mensual', 0))
        if not concepto:
            return jsonify({"error": "Concepto requerido"}), 400
            
        cursor.execute('''
            INSERT INTO gastos_fijos (concepto, monto_mensual)
            VALUES (?, ?)
            ON CONFLICT(concepto) DO UPDATE SET monto_mensual=excluded.monto_mensual
        ''', (concepto, monto))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
        
    cursor.execute("SELECT * FROM gastos_fijos ORDER BY id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT SUM(monto_mensual) FROM gastos_fijos")
    total_gasto = cursor.fetchone()[0] or 0
    conn.close()
    return jsonify({"gastos": rows, "total": total_gasto})


@app.route('/api/cuentas_por_pagar', methods=['GET'])
def api_cuentas_por_pagar():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    
    # 1. Sincronizar facturas procesadas de config.OUTPUT_FOLDER si aún no están en DB
    if os.path.exists(config.OUTPUT_FOLDER):
        for root, dirs, files in os.walk(config.OUTPUT_FOLDER):
            for file in files:
                if file.startswith('.') or not file.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg')):
                    continue
                rel_path = os.path.relpath(os.path.join(root, file), config.OUTPUT_FOLDER)
                parts = rel_path.replace('\\', '/').split('/')
                if len(parts) >= 4:
                    year, month, supplier = parts[0], parts[1], parts[2]
                else:
                    supplier = "Desconocido"
                    
                cursor.execute("SELECT COUNT(*) FROM proveedores_cuentas_pagar WHERE factura_numero = ?", (file,))
                if cursor.fetchone()[0] == 0:
                    cursor.execute('''
                        INSERT INTO proveedores_cuentas_pagar (proveedor_nombre, factura_numero, fecha, monto_total, estado, monto_pagado)
                        VALUES (?, ?, ?, ?, 'Pendiente', 0)
                    ''', (supplier, file, datetime.now().strftime('%Y-%m-%d'), 0))
        conn.commit()
        
    mes = request.args.get('mes')
    if mes and mes != 'all':
        cursor.execute("SELECT * FROM proveedores_cuentas_pagar WHERE fecha LIKE ? ORDER BY id DESC", (f"{mes}%",))
        rows = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT SUM(monto_total), SUM(monto_pagado) FROM proveedores_cuentas_pagar WHERE fecha LIKE ?", (f"{mes}%",))
    else:
        cursor.execute("SELECT * FROM proveedores_cuentas_pagar ORDER BY id DESC")
        rows = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT SUM(monto_total), SUM(monto_pagado) FROM proveedores_cuentas_pagar")
        
    tot_fact, tot_pag = cursor.fetchone()
    tot_fact = tot_fact or 0
    tot_pag = tot_pag or 0
    pendiente = tot_fact - tot_pag
    
    conn.close()
    return jsonify({
        "cuentas": rows,
        "resumen": {
            "total_facturado": tot_fact,
            "total_pagado": tot_pag,
            "total_pendiente": pendiente
        }
    })


@app.route('/api/cuentas_por_pagar/registrar_pago', methods=['POST'])
def api_registrar_pago_proveedor():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    data = request.json or {}
    cuenta_id = data.get('id')
    monto_pago = float(data.get('monto', 0))
    medio_pago = data.get('medio_pago', 'Caja Chica')
    fecha_pago = data.get('fecha_pago', datetime.now().strftime('%Y-%m-%d'))
    
    if not cuenta_id or monto_pago <= 0:
        return jsonify({"error": "Datos inválidos"}), 400
        
    cursor.execute("SELECT * FROM proveedores_cuentas_pagar WHERE id = ?", (cuenta_id,))
    row = cursor.fetchone()
    if not row:
        return jsonify({"error": "Cuenta no encontrada"}), 404
        
    nuevo_pagado = row['monto_pagado'] + monto_pago
    nuevo_estado = 'Pagado' if nuevo_pagado >= row['monto_total'] and row['monto_total'] > 0 else 'Pagado Parcial'
    
    cursor.execute('''
        UPDATE proveedores_cuentas_pagar
        SET monto_pagado = ?, estado = ?, fecha_pago = ?, medio_pago = ?
        WHERE id = ?
    ''', (nuevo_pagado, nuevo_estado, fecha_pago, medio_pago, cuenta_id))
    
    # Si el pago es con Caja Chica / Alivios, generar movimiento de egreso automático
    if medio_pago == 'Caja Chica':
        cursor.execute('''
            INSERT INTO caja_chica_movimientos (fecha, monto_retirado, monto_ingresado, motivo, responsable, categoria)
            VALUES (?, ?, 0, ?, 'Sistema', 'Proveedor')
        ''', (fecha_pago, monto_pago, f"Pago a Proveedor: {row['proveedor_nombre']} ({row['factura_numero']})"))
        
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route('/api/dashboard/resumen', methods=['GET'])
def api_dashboard_resumen():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    
    mes = request.args.get('mes')
    if mes and mes != 'all':
        cursor.execute("SELECT SUM(total_diario) FROM recaudacion_diaria WHERE fecha LIKE ?", (f"{mes}%",))
        tot_rec = cursor.fetchone()[0] or 0
        
        cursor.execute("SELECT SUM(total) FROM estacionamiento_diario WHERE fecha LIKE ?", (f"{mes}%",))
        tot_est = cursor.fetchone()[0] or 0
        
        cursor.execute("SELECT SUM(monto_retirado) FROM caja_chica_movimientos WHERE fecha LIKE ?", (f"{mes}%",))
        gasto_caja = cursor.fetchone()[0] or 0
    else:
        cursor.execute("SELECT SUM(total_diario) FROM recaudacion_diaria")
        tot_rec = cursor.fetchone()[0] or 0
        
        cursor.execute("SELECT SUM(total) FROM estacionamiento_diario")
        tot_est = cursor.fetchone()[0] or 0
        
        cursor.execute("SELECT SUM(monto_retirado) FROM caja_chica_movimientos")
        gasto_caja = cursor.fetchone()[0] or 0
        
    ganancia_bruta = tot_rec + tot_est
    
    cursor.execute("SELECT SUM(monto_mensual) FROM gastos_fijos")
    gasto_fijo = cursor.fetchone()[0] or 0
    
    ganancia_neta = ganancia_bruta - gasto_caja - gasto_fijo
    
    conn.close()
    return jsonify({
        "ganancia_bruta": ganancia_bruta,
        "gasto_caja": gasto_caja,
        "gasto_fijo": gasto_fijo,
        "ganancia_neta": ganancia_neta,
        "recaudacion_total": tot_rec,
        "estacionamiento_total": tot_est
    })


@app.route('/api/meses_disponibles', methods=['GET'])
def api_meses_disponibles():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    
    queries = [
        "SELECT DISTINCT strftime('%Y-%m', fecha) FROM recaudacion_diaria WHERE fecha IS NOT NULL AND fecha != ''",
        "SELECT DISTINCT strftime('%Y-%m', fecha) FROM estacionamiento_diario WHERE fecha IS NOT NULL AND fecha != ''",
        "SELECT DISTINCT strftime('%Y-%m', fecha) FROM caja_chica_movimientos WHERE fecha IS NOT NULL AND fecha != ''",
        "SELECT DISTINCT strftime('%Y-%m', fecha) FROM proveedores_cuentas_pagar WHERE fecha IS NOT NULL AND fecha != ''"
    ]
    
    meses_set = set()
    for q in queries:
        try:
            cursor.execute(q)
            for r in cursor.fetchall():
                if r[0] and len(r[0]) == 7:
                    meses_set.add(r[0])
        except Exception:
            pass
            
    now = datetime.now()
    cur_month = now.strftime('%Y-%m')
    meses_set.add(cur_month)
    
    # Agregar mes siguiente (ej. 2026-08)
    next_m = (now.month % 12) + 1
    next_y = now.year + (1 if now.month == 12 else 0)
    meses_set.add(f"{next_y}-{next_m:02d}")
    
    conn.close()
    
    lista_meses = sorted(list(meses_set), reverse=True)
    return jsonify({"meses": lista_meses, "mes_actual": cur_month})


if __name__ == '__main__':
    import webbrowser
    from threading import Timer
    import config
    import sys
    import os
    import subprocess

    def check_and_install_dependencies():
        tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        naps2_path = r"C:\Program Files\NAPS2\NAPS2.Console.exe"
        
        missing = []
        if not os.path.exists(tesseract_path):
            missing.append(("Tesseract OCR", "UB-Mannheim.TesseractOCR"))
        if not os.path.exists(naps2_path):
            missing.append(("NAPS2", "NAPS2.NAPS2"))
            
        if missing:
            names = ", ".join([name for name, _ in missing])
            try:
                import ctypes
                msg = f"PDFWatcher necesita instalar componentes adicionales para funcionar correctamente:\n\n{names}\n\nSe abrirá una ventana de consola (pantalla negra) mostrando el progreso de la descarga e instalación. ¡NO LA CIERRES!\nPor favor, acepta los permisos de administrador (UAC) si Windows te los pide.\n\nEl programa se abrirá automáticamente al terminar. ¡Gracias por tu paciencia!"
                ctypes.windll.user32.MessageBoxW(0, msg, "Instalando Dependencias de PDFWatcher", 0x40 | 0x0)
            except Exception:
                pass
            
            print("\n" + "="*65)
            print("⏳ [Instalación Automática] Descargando dependencias del sistema")
            print("="*65)
            for name, pkg_id in missing:
                print(f"Descargando e instalando {name} (por favor espere)...")
                try:
                    # En modo --windowed, forzamos la creacion de una consola visible para que el usuario vea el progreso
                    creationflags = 0
                    if hasattr(subprocess, 'CREATE_NEW_CONSOLE'):
                        creationflags = subprocess.CREATE_NEW_CONSOLE
                        
                    subprocess.run(["winget", "install", "--id", pkg_id, "-e", "--accept-package-agreements", "--accept-source-agreements"], check=True, creationflags=creationflags)
                    print(f"[✔] {name} instalado correctamente.")
                except Exception as e:
                    print(f"[X] Error instalando {name}. Puede que requiera instalación manual. Error: {e}")
            print("="*65 + "\n")

    check_and_install_dependencies()

    def check_timeout():
        global last_ping_time
        time.sleep(15)
        while True:
            time.sleep(3)
            # Evitar apagar si hay tareas activas en segundo plano
            bot_running = False
            try:
                import arca_bot
                bot_running = arca_bot.get_bot_status().get("running", False)
            except Exception:
                pass
                
            if bot_running or watcher_manager.is_processing_batch:
                last_ping_time = time.time()
                
            # Si pasan más de 25 segundos sin recibir pings ni peticiones, se cerró la pestaña web
            if time.time() - last_ping_time > 25:
                print("No se detectó actividad web. Apagando servidor...", flush=True)
                try:
                    watcher_manager.stop()
                except Exception:
                    pass
                os._exit(0)
                
    threading.Thread(target=check_timeout, daemon=True).start()

    print("\nIniciando la aplicación web...")

    def open_browser():
        webbrowser.open_new('http://127.0.0.1:5000/')

    Timer(1, open_browser).start()

    app.run(debug=False, port=5000, use_reloader=False, threaded=True)
