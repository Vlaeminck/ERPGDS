import os
import sys
import shutil
import re

print("=" * 65)
print("  ADVERTENCIA DE REINICIO DE FABRICA (RESET TOTAL)")
print("=" * 65)
print("ESTA ACCION ES IRREVERSIBLE E IMPLICA LO SIGUIENTE:")
print("1. Se eliminaran TODAS las facturas procesadas, pendientes y remitos.")
print("2. Se borraran los historiales de facturas no reconocidas y logs.")
print("3. Se vaciara por completo la carpeta de CSV de ARCA.")
print("4. Se eliminaran TODOS los proveedores registrados de la base de datos.")
print("5. Se borraran las credenciales de ARCA y la API Key de Gemini.")
print("6. Se vaciaran TODAS las tablas de la base de datos SQLite (0 registros).")
print("\nBasicamente, la aplicacion volvera a estar 100% en blanco de fabrica.")
print("=" * 65)

# Soporte para argumento --force o --yes
force = "--force" in sys.argv or "--yes" in sys.argv or "-y" in sys.argv

if not force:
    try:
        resp = input("\n¿Estas ABSOLUTAMENTE SEGURO de que deseas continuar? (escribe 'SI' para aceptar): ").strip()
        if resp.upper() != "SI":
            print("\n[INFO] Operacion cancelada de forma segura. No se ha borrado nada.")
            sys.exit(0)
    except KeyboardInterrupt:
        print("\n\n[INFO] Operacion cancelada por el usuario.")
        sys.exit(0)

print("\nProcediendo con el restablecimiento de fabrica...\n")

base_dir = os.path.dirname(os.path.abspath(__file__))

def clean_folder(folder_name):
    folder_path = os.path.join(base_dir, folder_name)
    if os.path.exists(folder_path):
        count = 0
        for filename in os.listdir(folder_path):
            if filename.lower() in ['.gitkeep', '.gitignore', 'desktop.ini']:
                continue
            file_path = os.path.join(folder_path, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
                count += 1
            except Exception as e:
                print(f"[!] Error eliminando {file_path}: {e}")
        print(f"[OK] Carpetas/archivos en '{folder_name}' limpiados ({count} elementos).")
    else:
        print(f"[-] Carpeta '{folder_name}' no existe.")

# 1. Limpiar Carpetas de Datos
print("--- 1. Limpiando carpetas de trabajo ---")
clean_folder("Facturas_A_Procesar")
clean_folder("Facturas_Procesadas")
clean_folder("Facturas_No_Reconocidas")
clean_folder("CSV ARCA")
clean_folder("Remitos")
clean_folder("registros")

# 2. Eliminar Archivos de Configuracion de Usuario y Datos
print("\n--- 2. Eliminando archivos de configuracion y credenciales ---")
files_to_remove = [
    "suppliers.json",
    "arca_credentials.json",
    "api_key.txt",
    "my_cuit.txt",
    "sys_config.dat",
    "test.txt",
    "Pruebaupdate.txt"
]

for fname in files_to_remove:
    fpath = os.path.join(base_dir, fname)
    if os.path.exists(fpath):
        try:
            os.remove(fpath)
            print(f"[OK] Archivo '{fname}' eliminado exitosamente.")
        except Exception as e:
            print(f"[!] Error eliminando '{fname}': {e}")
    else:
        print(f"[-] Archivo '{fname}' no existia.")

# 3. Vaciar y Reinicializar Base de Datos SQLite (100% Vacia)
print("\n--- 3. Restableciendo base de datos SQLite (control_interno.db) ---")
try:
    import db_manager
    db_manager.reset_db()
except Exception as e:
    print(f"[!] Error restableciendo la base de datos: {e}")

# 4. Resetear variables en config.py
print("\n--- 4. Reseteando configuracion en config.py ---")
config_path = os.path.join(base_dir, "config.py")
if os.path.exists(config_path):
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Resetear AI_API_KEY
        content = re.sub(r'AI_API_KEY\s*=\s*[\'"].*?[\'"]', 'AI_API_KEY = "TU_API_KEY_AQUI"', content)
        # Resetear MY_CUIT
        content = re.sub(r'MY_CUIT\s*=\s*[\'"].*?[\'"]', 'MY_CUIT = ""', content)
        
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("[OK] config.py reseteado a valores iniciales.")
    except Exception as e:
        print(f"[!] Error reseteando config.py: {e}")

# 5. Limpiar Cache de Python (__pycache__)
print("\n--- 5. Limpiando archivos temporales de cache ---")
for root, dirs, files in os.walk(base_dir):
    for d in dirs:
        if d in ["__pycache__", ".pytest_cache"]:
            pycache_path = os.path.join(root, d)
            try:
                shutil.rmtree(pycache_path)
                print(f"[OK] Cache eliminada: {os.path.relpath(pycache_path, base_dir)}")
            except Exception as e:
                print(f"[!] Error eliminando cache {pycache_path}: {e}")

print("\n" + "="*65)
print("   SISTEMA COMPLETAMENTE RESTABLECIDO A FABRICA Y 100% VACIO")
print("  Toda la informacion y base de datos han quedado limpias desde cero.")
print("="*65)
