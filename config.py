import os
import sys

# Rutas Base (Relativas al proyecto para pruebas, pueden cambiarse a C:\...)
if getattr(sys, 'frozen', False):
    # Si se ejecuta como .exe compilado por PyInstaller
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # Si se ejecuta el script normal
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

API_KEY_FILE = os.path.join(BASE_DIR, 'api_key.txt')

def obfuscate_key(key):
    if not key or key == "TU_API_KEY_AQUI" or key.startswith("ENC:"):
        return key
    import random, string
    reversed_key = key[::-1]
    obfuscated = "ENC:"
    for char in reversed_key:
        junk = ''.join(random.choices(string.ascii_letters + string.digits, k=3))
        obfuscated += char + junk
    return obfuscated

def deobfuscate_key(obf_key):
    if not obf_key or obf_key == "TU_API_KEY_AQUI":
        return obf_key
    if obf_key.startswith("ENC:"):
        payload = obf_key[4:]
        reversed_key = payload[::4]
        return reversed_key[::-1]
    return obf_key

if os.path.exists(API_KEY_FILE):
    try:
        with open(API_KEY_FILE, 'r', encoding='utf-8') as f:
            raw_key = f.read().strip()
            AI_API_KEY = deobfuscate_key(raw_key)
            
            # Si la clave no estaba encriptada, la encriptamos y guardamos
            if raw_key and raw_key != "TU_API_KEY_AQUI" and not raw_key.startswith("ENC:"):
                with open(API_KEY_FILE, 'w', encoding='utf-8') as f_out:
                    f_out.write(obfuscate_key(raw_key))
    except Exception:
        AI_API_KEY = "TU_API_KEY_AQUI"
else:
    AI_API_KEY = "TU_API_KEY_AQUI"

INPUT_FOLDER = os.path.join(BASE_DIR, "Facturas_A_Procesar")
OUTPUT_FOLDER = os.path.join(BASE_DIR, "Facturas_Procesadas")
UNRECOGNIZED_FOLDER = os.path.join(BASE_DIR, "Facturas_No_Reconocidas")
CSV_ARCA_FOLDER = os.path.join(BASE_DIR, "CSV ARCA")
REGISTROS_FOLDER = os.path.join(BASE_DIR, "registros")
REMITOS_FOLDER = os.path.join(BASE_DIR, "Remitos")
ARCA_LOG_FILE = os.path.join(REGISTROS_FOLDER, "arca_error_log.txt")

# Asegurar que las carpetas existan (se crean automáticamente si no)
os.makedirs(INPUT_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(UNRECOGNIZED_FOLDER, exist_ok=True)
os.makedirs(CSV_ARCA_FOLDER, exist_ok=True)
os.makedirs(REGISTROS_FOLDER, exist_ok=True)
os.makedirs(REMITOS_FOLDER, exist_ok=True)

# Extensiones a monitorear
ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"]

# CUIT propio para ignorar en logs de OCR (Receptor)
MY_CUIT_FILE = os.path.join(BASE_DIR, 'my_cuit.txt')
MY_CUIT = ""
if os.path.exists(MY_CUIT_FILE):
    try:
        with open(MY_CUIT_FILE, 'r', encoding='utf-8') as f:
            MY_CUIT = f.read().strip()
    except Exception:
        pass

import json

SUPPLIERS_FILE = os.path.join(BASE_DIR, "suppliers.json")

# Diccionario de Proveedores y Expresiones Regulares
if os.path.exists(SUPPLIERS_FILE):
    try:
        with open(SUPPLIERS_FILE, 'r', encoding='utf-8') as f:
            SUPPLIERS = json.load(f)
    except Exception as e:
        print(f"Error cargando {SUPPLIERS_FILE}: {e}")
        SUPPLIERS = {}
else:
    SUPPLIERS = {}

