import uuid
import requests
import os
import sys
import datetime
import json
import time

try:
    import config
    BASE_DIR = config.BASE_DIR
except ImportError:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# La URL de tu base de datos de Firebase Realtime Database.
# Ajusta si tu DB tiene otra URL (por ejemplo si está en otra región o no tiene -default-rtdb)
FIREBASE_DB_URL = "https://pdfw-licencias-default-rtdb.firebaseio.com"

def get_hardware_id():
    """Genera un identificador único para esta máquina basado en la dirección MAC."""
    mac = uuid.getnode()
    # Formatear la MAC address en una string más amigable como HW-XXXX-YYYY
    mac_str = f"{mac:012X}"
    if len(mac_str) > 8:
        hw_id = f"HW-{mac_str[:4]}-{mac_str[4:]}"
    else:
        hw_id = f"HW-{mac_str}"
    return hw_id

CACHE_FILE = os.path.join(BASE_DIR, "sys_config.dat")
import base64

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                b64_str = f.read()
                json_str = base64.b64decode(b64_str).decode('utf-8')
                return json.loads(json_str)
        except Exception:
            return None
    return None

def save_cache(data):
    try:
        # Añadir timestamp de la comprobación
        data['_last_check'] = time.time()
        json_str = json.dumps(data)
        b64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            f.write(b64_str)
    except Exception:
        pass

_memory_cache = None

def check_license_status(force_network=False):
    """Consulta a Firebase si el hardware ID actual tiene licencia activa y si no ha expirado. Si no hay internet, usa el caché."""
    global _memory_cache
    
    hw_id = get_hardware_id()
    
    # Usar caché en memoria si ya se calculó en esta sesión
    if not force_network and _memory_cache is not None:
        return _memory_cache

    cached_data = load_cache()
    data = None
    should_fetch = True

    # Revisar si tenemos un caché válido de hace menos de 7 días
    if not force_network and cached_data and isinstance(cached_data, dict):
        last_check = cached_data.get('_last_check', 0)
        # 7 días = 7 * 24 * 60 * 60 = 604800 segundos
        if time.time() - last_check < 604800:
            should_fetch = False
            data = cached_data

    if should_fetch:
        # URL de consulta: https://pdfw-licencias-default-rtdb.firebaseio.com/licenses/HW-XXXX-YYYY.json
        url = f"{FIREBASE_DB_URL}/licenses/{hw_id}.json"
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data and isinstance(data, dict):
                    save_cache(data)
                else:
                    # El ID es nuevo (no existe en Firebase). Activamos 15 días de prueba automáticamente.
                    trial_expires = (datetime.date.today() + datetime.timedelta(days=15)).strftime("%Y-%m-%d")
                    trial_data = {"active": True, "expires": trial_expires, "type": "trial"}
                    try:
                        requests.put(url, json=trial_data, timeout=5)
                        data = trial_data
                        save_cache(data)
                    except requests.RequestException:
                        data = None
        except requests.RequestException:
            # Error de conexión, usamos el caché aunque sea viejo
            data = cached_data
    
    if data and isinstance(data, dict):
        is_active = data.get("active", False)
        expiration = data.get("expires", None)
        days_left = None
        
        if is_active and expiration:
            try:
                exp_date = datetime.datetime.strptime(expiration, "%Y-%m-%d").date()
                today = datetime.date.today()
                delta = (exp_date - today).days
                
                if delta < 0:
                    return {
                        "valid": False,
                        "hw_id": hw_id,
                        "message": f"Licencia expirada el {expiration}",
                        "details": data,
                        "days_left": 0
                    }
                else:
                    days_left = delta
            except ValueError:
                pass # Formato de fecha inválido, se asume sin vencimiento
        
        result = {
            "valid": is_active,
            "hw_id": hw_id,
            "message": ("Licencia activa" if not expiration else f"Válida hasta {expiration}") if is_active else "Licencia inactiva o expirada",
            "details": data,
            "days_left": days_left
        }
        _memory_cache = result
        return result
    else:
        result = {
            "valid": False,
            "hw_id": hw_id,
            "message": "Licencia no encontrada o sin conexión a internet",
            "details": None,
            "days_left": None
        }
        _memory_cache = result
        return result

if __name__ == "__main__":
    print(f"Hardware ID: {get_hardware_id()}")
    print(f"License Status: {check_license_status()}")
