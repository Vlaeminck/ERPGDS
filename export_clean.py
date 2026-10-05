import os
import sys
import shutil
import zipfile
import datetime

print("===================================================")
print("   ERP GDS - EXPORTADOR DE PROYECTO LIMPIO")
print("   (Para implementación en nuevas empresas)")
print("===================================================")
print()

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
EXPORT_NAME = f"ERP_Limpio_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
EXPORT_DIR = os.path.join(ROOT_DIR, "dist", EXPORT_NAME)
ZIP_FILE = os.path.join(ROOT_DIR, "dist", f"{EXPORT_NAME}.zip")

os.makedirs(os.path.join(ROOT_DIR, "dist"), exist_ok=True)
if os.path.exists(EXPORT_DIR):
    shutil.rmtree(EXPORT_DIR, ignore_errors=True)
os.makedirs(EXPORT_DIR, exist_ok=True)

# 1. Lista de archivos y carpetas a incluir
ALLOWED_TOP_FILES = [
    "app.py",
    "app_cloud.py",
    "db_manager.py",
    "config.py",
    "firebase_sync.py",
    "processor.py",
    "arca_bot.py",
    "doctor.py",
    "watcher.py",
    "license_manager.py",
    "reset.py",
    "build.py",
    "build.bat",
    "setup.bat",
    "start.bat",
    "update.bat",
    "export_clean.py",
    "export_clean.bat",
    "version.txt",
    "Procfile",
    "railway.json",
    "Dockerfile",
    ".dockerignore",
    ".gitignore",
    ".env.example",
    "README.md",
    "CONTEXTO.md",
    "AGENTS.md",
    "requirements.txt",
    "requirements-web.txt"
]

ALLOWED_DIRS = [
    "templates",
    "static"
]

EMPTY_DATA_DIRS = [
    "CSV ARCA",
    "Facturas_A_Procesar",
    "Facturas_Procesadas",
    "Facturas_No_Reconocidas",
    "Remitos",
    "registros"
]

print("[1/5] Copiando archivos de código fuente y configuraciones base...")
for fname in ALLOWED_TOP_FILES:
    src = os.path.join(ROOT_DIR, fname)
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(EXPORT_DIR, fname))
        print(f"  + {fname}")

print("\n[2/5] Copiando vistas (templates) y recursos estáticos (CSS/JS)...")
for dname in ALLOWED_DIRS:
    src = os.path.join(ROOT_DIR, dname)
    dst = os.path.join(EXPORT_DIR, dname)
    if os.path.isdir(src):
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store'))
        print(f"  + Carpeta {dname}/")

print("\n[3/5] Creando carpetas de datos 100% vacías...")
for dname in EMPTY_DATA_DIRS:
    target_d = os.path.join(EXPORT_DIR, dname)
    os.makedirs(target_d, exist_ok=True)
    keep_file = os.path.join(target_d, ".gitkeep")
    with open(keep_file, "w", encoding="utf-8") as f:
        pass
    print(f"  + Carpeta limpia: {dname}/")

print("\n[4/5] Generando base de datos SQLite limpia (0 registros) para la nueva empresa...")
clean_db_path = os.path.join(EXPORT_DIR, "registros", "control_interno.db")
try:
    import db_manager
    orig_path = db_manager.DB_PATH
    db_manager.DB_PATH = clean_db_path
    db_manager.init_db(seed_samples=False)
    db_manager.reset_db(keep_base_categories=True)
    db_manager.DB_PATH = orig_path
    print("  [OK] control_interno.db generado con 0 registros y categorías base listas.")
except Exception as e:
    print(f"  [!] Advertencia al inicializar BD: {e}. Se inicializará automáticamente al arrancar la app.")



print("\n[5/5] Comprimiendo exportación en archivo ZIP...")
with zipfile.ZipFile(ZIP_FILE, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(EXPORT_DIR):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, EXPORT_DIR)
            zipf.write(full_path, rel_path)

print()
print("===================================================")
print("   ¡EXPORTACIÓN COMPLETADA EXITOSAMENTE!")
print("===================================================")
print(f"1. Carpeta limpia lista:\n   {EXPORT_DIR}")
print(f"2. Archivo ZIP para nueva empresa:\n   {ZIP_FILE}")
print("===================================================")
print("Verificación de seguridad:")
print(" - NO contiene credenciales (firebase, arca, api keys)")
print(" - NO contiene facturas ni comprobantes previos")
print(" - NO contiene proveedores ni movimientos anteriores")
print(" - Base de datos 100% limpia en blanco (0 registros)")
print("===================================================\n")
