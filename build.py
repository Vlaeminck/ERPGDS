import os
import sys
import subprocess
import shutil

print("===================================================")
print("GDSERP (ERP GDS) - Generador de Compilación (.exe)")
print("===================================================")
print()

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(ROOT_DIR, "dist", "GDSERP")

# 0. Cerrar instancias de GDSERP.exe si estuvieran abiertas
try:
    subprocess.call(["taskkill", "/F", "/IM", "GDSERP.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except Exception:
    pass

# Intentar limpiar dist/GDSERP si existe
if os.path.exists(DIST_DIR):
    try:
        shutil.rmtree(DIST_DIR, ignore_errors=True)
    except Exception:
        pass

# 1. Verificación de entorno y dependencias
print("[1/5] Verificando e instalando dependencias desde requirements.txt...")
try:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
except Exception as e:
    print(f"[ERROR] Error al instalar dependencias: {e}")
    sys.exit(1)

# 2. Preparar comando PyInstaller
print("[2/5] Compilando la aplicación con PyInstaller...")

pyinstaller_cmd = [
    sys.executable, "-m", "PyInstaller",
    "--noconfirm",
    "--onedir",
    "--windowed",
    "--name=GDSERP",
    "--collect-all=selenium",
    "--collect-all=firebase_admin",
    "--collect-all=google",
    "--collect-all=openpyxl",
    "--add-data=templates;templates",
    "--add-data=static;static",
    "--hidden-import=firebase_admin",
    "--hidden-import=firebase_admin.credentials",
    "--hidden-import=firebase_admin.firestore",
    "--hidden-import=firebase_sync",
    "--hidden-import=db_manager",
    "--hidden-import=sqlite3",
    "--hidden-import=openpyxl",
    "--hidden-import=openpyxl.cell",
    "--hidden-import=openpyxl.styles",
    "--hidden-import=selenium.webdriver.edge.webdriver",
    "--hidden-import=selenium.webdriver.chrome.webdriver",
    "app.py"
]

if os.path.exists(os.path.join(ROOT_DIR, "version.txt")):
    pyinstaller_cmd.insert(6, "--version-file=version.txt")

try:
    subprocess.check_call(pyinstaller_cmd)
    print("[OK] Compilación con PyInstaller completada.")
except Exception as e:
    print(f"[ERROR] Falló la compilación: {e}")
    sys.exit(1)

# 3. Limpieza de carpeta build temporal
print("[3/5] Limpiando archivos temporales de construcción...")
build_folder = os.path.join(ROOT_DIR, "build")
if os.path.exists(build_folder):
    try:
        shutil.rmtree(build_folder)
    except Exception:
        pass

# 4. Crear estructura de carpetas necesarias en dist/GDSERP
print("[4/5] Creando carpetas de entorno en la compilación final (dist/GDSERP)...")
required_folders = [
    "CSV ARCA",
    "Facturas_A_Procesar",
    "Facturas_Procesadas",
    "Facturas_No_Reconocidas",
    "Remitos",
    "registros"
]

for folder in required_folders:
    target_path = os.path.join(DIST_DIR, folder)
    os.makedirs(target_path, exist_ok=True)
    print(f"  [OK] Carpeta de entorno lista: {folder}")

# Copiar base de datos inicial si existe
registros_src = os.path.join(ROOT_DIR, "registros")
registros_dist = os.path.join(DIST_DIR, "registros")
if os.path.exists(registros_src):
    for f in os.listdir(registros_src):
        src_f = os.path.join(registros_src, f)
        dst_f = os.path.join(registros_dist, f)
        if os.path.isfile(src_f) and not os.path.exists(dst_f):
            shutil.copy2(src_f, dst_f)

print()
print("===================================================")
print(" ¡COMPILACIÓN COMPLETADA EXITOSAMENTE! ")
print(" Ejecutable final: dist\\GDSERP\\GDSERP.exe")
print("===================================================")
