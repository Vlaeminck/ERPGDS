import os
import shutil
import re
import datetime
from config import OUTPUT_FOLDER, UNRECOGNIZED_FOLDER, SUPPLIERS

MONTHS_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
    7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
}
VALID_MONTHS = list(MONTHS_ES.values())

def get_active_suppliers_normalized():
    return {name.lower().strip(): name for name in SUPPLIERS.keys()}

def scan_database():
    anomalies = []
    
    if not os.path.exists(OUTPUT_FOLDER):
        return anomalies

    active_suppliers = get_active_suppliers_normalized()

    # Walk root
    for item in os.listdir(OUTPUT_FOLDER):
        item_path = os.path.join(OUTPUT_FOLDER, item)
        
        # Ignorar archivos ocultos
        if item.startswith('.'):
            continue
            
        # 1. Archivos en la raíz
        if os.path.isfile(item_path):
            anomalies.append({
                "type": "archivo_desubicado",
                "severity": "high",
                "path": item_path,
                "message": f"Archivo '{item}' encontrado directamente en la raíz."
            })
            continue

        # 2. Verificar estructura de Años
        if os.path.isdir(item_path):
            if not re.match(r'^\d{4}$', item):
                anomalies.append({
                    "type": "carpeta_invalida",
                    "severity": "high",
                    "path": item_path,
                    "message": f"Carpeta '{item}' en la raíz que no parece un año válido."
                })
                continue
            
            # Dentro del Año
            year = item
            for month_folder in os.listdir(item_path):
                month_path = os.path.join(item_path, month_folder)
                
                # Ignorar ocultos
                if month_folder.startswith('.'):
                    continue
                    
                if os.path.isfile(month_path):
                    anomalies.append({
                        "type": "archivo_desubicado",
                        "severity": "high",
                        "path": month_path,
                        "message": f"Archivo '{month_folder}' encontrado dentro de la carpeta del año {year}."
                    })
                    continue
                    
                if month_folder not in VALID_MONTHS:
                    anomalies.append({
                        "type": "mes_invalido",
                        "severity": "medium",
                        "path": month_path,
                        "message": f"Carpeta '{month_folder}' no es un mes válido estándar."
                    })
                
                # Dentro del Mes (Proveedores)
                for sup_folder in os.listdir(month_path):
                    if sup_folder.startswith('.'):
                        continue
                        
                    sup_path = os.path.join(month_path, sup_folder)
                    
                    if os.path.isfile(sup_path):
                        anomalies.append({
                            "type": "archivo_desubicado",
                            "severity": "high",
                            "path": sup_path,
                            "message": f"Archivo '{sup_folder}' encontrado dentro de {year}/{month_folder} (debe estar dentro de un proveedor)."
                        })
                        continue
                        
                    # Verificar si la carpeta está vacía
                    files_in_sup = os.listdir(sup_path)
                    if not files_in_sup:
                        anomalies.append({
                            "type": "carpeta_vacia",
                            "severity": "low",
                            "path": sup_path,
                            "message": f"Carpeta '{sup_folder}' vacía."
                        })
                        continue
                        
                    # Verificar si el proveedor existe en config.py
                    sup_norm = sup_folder.lower().strip()
                    if sup_norm not in active_suppliers:
                        anomalies.append({
                            "type": "proveedor_no_reconocido",
                            "severity": "medium",
                            "path": sup_path,
                            "folder_name": sup_folder,
                            "message": f"Carpeta de proveedor '{sup_folder}' no se encuentra activa en el sistema."
                        })
                        
                    # Verificar archivos atípicos
                    for file in files_in_sup:
                        if file.startswith('.'):
                            continue
                        if not re.match(r'^(?:DUPLICADO_)?\d{4,5}\s*-\s*\d{8}(?:\s*\(Rescatado IA\))?', file):
                            anomalies.append({
                                "type": "nombre_atipico",
                                "severity": "low",
                                "path": os.path.join(sup_path, file),
                                "message": f"El archivo '{file}' no sigue el formato estándar '0000 - 00000000'."
                            })
                            
    return anomalies

def fix_database():
    anomalies = scan_database()
    fixes_applied = 0
    errors = []
    
    active_suppliers = get_active_suppliers_normalized()
    
    # Asegurar que exista carpeta de no reconocidas
    if not os.path.exists(UNRECOGNIZED_FOLDER):
        os.makedirs(UNRECOGNIZED_FOLDER)

    for anomaly in anomalies:
        try:
            path = anomaly['path']
            if not os.path.exists(path):
                continue
                
            # Carpeta Vacía -> Eliminar
            if anomaly['type'] == 'carpeta_vacia':
                os.rmdir(path)
                fixes_applied += 1
                
            # Archivo desubicado en la raíz o en año o en mes -> Mover a No Reconocidas
            elif anomaly['type'] == 'archivo_desubicado':
                filename = os.path.basename(path)
                dest = os.path.join(UNRECOGNIZED_FOLDER, f"DESUBICADO_{filename}")
                shutil.move(path, dest)
                fixes_applied += 1
                
            # Proveedor no reconocido -> Intentar Smart Match, si no, lo dejamos (o se podría mover a No Reconocidas)
            # Para mayor seguridad, el Smart Match unirá proveedores con nombres muy similares.
            elif anomaly['type'] == 'proveedor_no_reconocido':
                folder_name = anomaly['folder_name']
                
                # Función para limpiar sufijos societarios comunes para mejor emparejamiento
                def clean_for_match(s):
                    s = s.lower().strip()
                    s = re.sub(r'\b(s\.?a\.?|s\.?r\.?l\.?|cicsa|hnos)\b', '', s)
                    return re.sub(r'\s+', ' ', s).strip()
                    
                folder_name_clean = clean_for_match(folder_name)
                
                best_match = None
                for active_norm, active_real in active_suppliers.items():
                    active_clean = clean_for_match(active_norm)
                    # Emparejar si uno está contenido en el otro de forma significativa (> 4 caracteres para evitar falsos positivos)
                    if len(folder_name_clean) > 4 and len(active_clean) > 4:
                        if folder_name_clean in active_clean or active_clean in folder_name_clean:
                            best_match = active_real
                            break
                        
                if best_match:
                    # Mover los archivos a la carpeta correcta del proveedor
                    parent_dir = os.path.dirname(path)
                    target_dir = os.path.join(parent_dir, best_match)
                    if not os.path.exists(target_dir):
                        os.makedirs(target_dir)
                        
                    for f in os.listdir(path):
                        src = os.path.join(path, f)
                        dst = os.path.join(target_dir, f)
                        if not os.path.exists(dst):
                            shutil.move(src, dst)
                        else:
                            import uuid
                            # Evitar colisión, renombrar
                            name, ext = os.path.splitext(f)
                            dst = os.path.join(target_dir, f"{name}_DUPLICADO_{uuid.uuid4().hex[:6]}{ext}")
                            shutil.move(src, dst)
                    
                    # Eliminar la carpeta vieja que ahora está vacía
                    try:
                        shutil.rmtree(path, ignore_errors=True)
                    except Exception:
                        pass
                    fixes_applied += 1
                    
        except Exception as e:
            errors.append(str(e))
            
    return {"success": True, "fixes": fixes_applied, "errors": errors}
