import os
import sys
import shutil
import re

print("=" * 65)
print(" ⚠️  ADVERTENCIA DE REINICIO DE FÁBRICA (RESET TOTAL) ⚠️")
print("=" * 65)
print("ESTA ACCIÓN ES IRREVERSIBLE E IMPLICA LO SIGUIENTE:")
print("1. Se eliminarán TODAS las facturas procesadas, pendientes y remitos.")
print("2. Se borrarán los historiales de facturas no reconocidas y logs.")
print("3. Se vaciará por completo la carpeta de CSV de ARCA.")
print("4. Se eliminarán TODOS los proveedores registrados (suppliers.json).")
print("5. Se borrarán las credenciales de ARCA (arca_credentials.json).")
print("6. Se resetearán la API Key de Gemini y el CUIT propio guardados.")
print("\nBásicamente, la aplicación volverá a estar completamente en blanco de fábrica.")
print("=" * 65)

# Soporte para argumento --force o --yes
force = "--force" in sys.argv or "--yes" in sys.argv or "-y" in sys.argv

if not force:
    try:
        resp = input("\n¿Estás ABSOLUTAMENTE SEGURO de que deseas continuar? (escribe 'SI' para aceptar): ").strip()
        if resp.upper() != "SI":
            print("\n[INFO] Operación cancelada de forma segura. No se ha borrado nada.")
            sys.exit(0)
    except KeyboardInterrupt:
        print("\n\n[INFO] Operación cancelada por el usuario.")
        sys.exit(0)

print("\nProcediendo con el restablecimiento de fábrica...\n")

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

# 2. Eliminar Archivos de Configuración de Usuario y Datos
print("\n--- 2. Eliminando archivos de base de datos y credenciales ---")
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
        print(f"[-] Archivo '{fname}' no existía.")

# 3. Resetear variables en config.py
print("\n--- 3. Reseteando configuración en config.py ---")
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

# 4. Limpiar Caché de Python (__pycache__)
print("\n--- 4. Limpiando archivos temporales de caché ---")
for root, dirs, files in os.walk(base_dir):
    for d in dirs:
        if d in ["__pycache__", ".pytest_cache"]:
            pycache_path = os.path.join(root, d)
            try:
                shutil.rmtree(pycache_path)
                print(f"[OK] Caché eliminada: {os.path.relpath(pycache_path, base_dir)}")
            except Exception as e:
                print(f"[!] Error eliminando caché {pycache_path}: {e}")

print("\n" + "="*60)
print("  ✨ ¡APLICACIÓN COMPLETAMENTE RESTABLECIDA A FÁBRICA! ✨")
print("  PDFWatcher se encuentra 100% limpio y listo desde cero.")
print("="*60)
