import os
import sys
import time
import json
import base64
import glob
import datetime
import traceback
from threading import Lock

import selenium
import selenium.webdriver
import selenium.webdriver.edge.webdriver
import selenium.webdriver.edge.options
import selenium.webdriver.edge.service
import selenium.webdriver.chrome.webdriver
import selenium.webdriver.chrome.options
import selenium.webdriver.chrome.service
import selenium.webdriver.common.by
import selenium.webdriver.support.ui
import selenium.webdriver.support.expected_conditions
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.edge.webdriver import WebDriver as EdgeDriver
from selenium.webdriver.chrome.webdriver import WebDriver as ChromeDriver
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.chrome.options import Options as ChromeOptions

import config

# Archivo seguro de credenciales
CREDENTIALS_FILE = os.path.join(config.BASE_DIR, "arca_credentials.json")
_bot_lock = Lock()
_bot_status = {
    "running": False,
    "step": "IDLE",
    "message": "En espera",
    "last_run": None,
    "last_error": None
}

def log_arca_event(level, message, details=""):
    """Escribe logs detallados en registros/arca_error_log.txt y consola."""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] [{level.upper()}] {message}\n"
    if details:
        entry += f"  Detalles: {details}\n"
    entry += "-" * 60 + "\n"
    
    print(f"[ARCA-BOT] [{level}] {message}", flush=True)
    
    try:
        os.makedirs(config.REGISTROS_FOLDER, exist_ok=True)
        with open(config.ARCA_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception as e:
        print(f"Error escribiendo en arca_error_log.txt: {e}", flush=True)

def get_arca_logs():
    """Lee el archivo de logs de ARCA para mostrar en el frontend/API."""
    if not os.path.exists(config.ARCA_LOG_FILE):
        return "No hay registros de depuración aún."
    try:
        with open(config.ARCA_LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
            return "".join(lines[-150:])  # Últimas 150 líneas
    except Exception as e:
        return f"Error al leer logs: {e}"

def save_arca_credentials(cuit, clave_fiscal, representada=""):
    """Guarda las credenciales de ARCA de forma ofuscada localmente."""
    cuit_clean = "".join(filter(str.isdigit, str(cuit)))
    if len(cuit_clean) != 11:
        raise ValueError("El CUIT de ARCA debe tener 11 dígitos numéricos.")

    # Si la contraseña recibida es la máscara o está vacía, mantener la previa guardada
    if not clave_fiscal or clave_fiscal.strip() == '••••••••':
        old = get_arca_credentials()
        if old and old.get("clave"):
            clave_fiscal = old["clave"]
        else:
            raise ValueError("La Clave Fiscal ingresada no es válida.")

    if not clave_fiscal or len(clave_fiscal.strip()) < 4:
        raise ValueError("La Clave Fiscal ingresada no es válida.")

    rep_clean = "".join(filter(str.isdigit, str(representada))) if representada else ""

    clave_b64 = base64.b64encode(clave_fiscal.strip().encode('utf-8')).decode('ascii')
    data = {
        "cuit": cuit_clean,
        "clave": clave_b64,
        "representada": rep_clean or representada.strip(),
        "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    with open(CREDENTIALS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    log_arca_event("INFO", f"Credenciales de ARCA guardadas para CUIT: {cuit_clean}")
    return True

def get_arca_credentials():
    """Obtiene las credenciales de ARCA guardadas."""
    if not os.path.exists(CREDENTIALS_FILE):
        return None
    try:
        with open(CREDENTIALS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        cuit = data.get("cuit", "")
        clave_enc = data.get("clave", "")
        representada = data.get("representada", getattr(config, 'MY_CUIT', ''))
        try:
            clave = base64.b64decode(clave_enc.encode('ascii')).decode('utf-8') if clave_enc else ""
        except Exception:
            clave = clave_enc
        return {"cuit": cuit, "clave": clave, "representada": representada, "updated_at": data.get("updated_at")}
    except Exception as e:
        log_arca_event("ERROR", f"Error leyendo credenciales de ARCA: {e}")
        return None

def update_status(step, message, error=None):
    global _bot_status
    _bot_status["step"] = step
    _bot_status["message"] = message
    if error:
        _bot_status["last_error"] = str(error)
    log_arca_event("INFO" if not error else "ERROR", f"Paso: {step} - {message}", details=error)

def get_bot_status():
    return _bot_status

def find_and_click_buscar(driver):
    """Encuentra y hace clic de forma exhaustiva en el botón BUSCAR del formulario de ARCA."""
    from selenium.webdriver.common.by import By
    
    # 1. Búsqueda por IDs conocidos (incluyendo #buscarComprobantes)
    for b_id in ["buscarComprobantes", "btnBuscar", "buscar", "btn-buscar", "btnConsultar"]:
        try:
            elems = driver.find_elements(By.ID, b_id)
            for el in elems:
                if el.is_displayed():
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
                    time.sleep(0.5)
                    try:
                        el.click()
                    except Exception:
                        driver.execute_script("arguments[0].click();", el)
                    log_arca_event("INFO", f"¡Botón BUSCAR localizado y presionado por ID #{b_id}!")
                    return True
        except Exception:
            pass

    # 2. Buscar por XPATH coincidiendo con texto o valor 'BUSCAR'
    candidates = driver.find_elements(By.XPATH, "//*[self::button or self::input][contains(translate(text(), 'buscar', 'BUSCAR'), 'BUSCAR') or contains(translate(@value, 'buscar', 'BUSCAR'), 'BUSCAR')] | //button[contains(@class, 'btn')] | //button[@id='buscarComprobantes']")
    for el in candidates:
        try:
            if not el.is_displayed():
                continue
            txt = (el.text or el.get_attribute("value") or el.get_attribute("id") or "").strip().upper()
            if "BUSCAR" in txt or "CONSULTAR" in txt or el.get_attribute("id") == "buscarComprobantes":
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
                time.sleep(0.5)
                try:
                    el.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", el)
                log_arca_event("INFO", f"¡Botón BUSCAR localizado y presionado! ({el.tag_name}, texto/id='{txt}')")
                return True
        except Exception:
            pass
            
    # 3. Búsqueda por botones primarios o submits
    btns = driver.find_elements(By.CSS_SELECTOR, "#buscarComprobantes, button.btn-primary, button[type='submit'], input[type='submit'], input[type='button'], #btnBuscar, button")
    for b in btns:
        try:
            if not b.is_displayed():
                continue
            val = (b.text or b.get_attribute("value") or b.get_attribute("id") or "").strip().upper()
            if "BUSCAR" in val or "CONSULTAR" in val or b.get_attribute("id") in ["buscarComprobantes", "btnBuscar"]:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", b)
                time.sleep(0.5)
                try:
                    b.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", b)
                log_arca_event("INFO", f"¡Botón BUSCAR localizado vía selector genérico! ({b.tag_name}, texto/id='{val}')")
                return True
        except Exception:
            pass

    return False

def find_and_click_csv(driver):
    """Encuentra y hace clic en el botón CSV de la tabla de resultados."""
    from selenium.webdriver.common.by import By
    
    candidates = driver.find_elements(By.XPATH, "//button[contains(text(), 'CSV')] | //a[contains(text(), 'CSV')] | //*[contains(@class, 'buttons-csv')] | //*[contains(@title, 'CSV')] | //span[contains(text(), 'CSV')] | //button[contains(@class, 'dt-button')]")
    for el in candidates:
        try:
            if not el.is_displayed():
                continue
            txt = (el.text or el.get_attribute("title") or el.get_attribute("class") or "").strip().upper()
            if "CSV" in txt:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
                time.sleep(0.5)
                try:
                    el.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", el)
                log_arca_event("INFO", f"¡Botón CSV localizado y presionado! ({el.tag_name})")
                return True
        except Exception:
            pass
            
    # Búsqueda por botones Datatables
    dt_btns = driver.find_elements(By.CSS_SELECTOR, "button.buttons-csv, a.dt-button, .dt-buttons button, .dt-buttons a")
    for b in dt_btns:
        try:
            if not b.is_displayed():
                continue
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", b)
            time.sleep(0.5)
            try:
                b.click()
            except Exception:
                driver.execute_script("arguments[0].click();", b)
            log_arca_event("INFO", f"¡Botón CSV presionado vía clase DataTables! ({b.tag_name})")
            return True
        except Exception:
            pass

    return False

def run_arca_bot_sync(full_year=False):
    """
    Ejecuta el flujo completo de Selenium respetando la secuencia exacta de pantallas de ARCA:
    1. Login (auth.afip.gob.ar)
    2. Click en 'Mis Comprobantes' y cambio a la NUEVA PESTAÑA.
    3. Selección de persona/empresa representada (ej. GASTRO MARKET S.R.L.).
    4. Click en tarjeta 'Recibidos'.
    5. Ajuste de fecha del comprobante (1 de enero del año actual o 1 del mes a hoy).
    6. Click en 'BUSCAR' (utilizando el localizador exhaustivo).
    7. Click en 'CSV' para descargar.
    """
    global _bot_status
    if not _bot_lock.acquire(blocking=False):
        return {"success": False, "message": "El bot de ARCA ya está ejecutándose."}

    _bot_status["running"] = True
    _bot_status["last_error"] = None
    update_status("STARTING", "Iniciando proceso de sincronización con ARCA...")

    driver = None
    try:
        creds = get_arca_credentials()
        if not creds or not creds.get("cuit") or not creds.get("clave"):
            raise ValueError("No se encontraron credenciales de ARCA guardadas. Por favor regístralas en Ajustes.")

        cuit = creds["cuit"]
        clave = creds["clave"]
        target_rep = creds.get("representada") or getattr(config, 'MY_CUIT', '')

        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        update_status("LAUNCHING_BROWSER", "Iniciando motor de navegación silencioso...")

        download_folder = config.CSV_ARCA_FOLDER
        os.makedirs(download_folder, exist_ok=True)

        files_before = set(glob.glob(os.path.join(download_folder, "*")))

        options_edge = EdgeOptions()
        options_edge.add_argument("--headless=new")
        options_edge.add_argument("--disable-gpu")
        options_edge.add_argument("--no-sandbox")
        options_edge.add_argument("--window-size=1920,1080")
        options_edge.add_argument("--disable-dev-shm-usage")
        prefs = {
            "download.default_directory": download_folder,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True
        }
        options_edge.add_experimental_option("prefs", prefs)

        driver = None
        try:
            driver = EdgeDriver(options=options_edge)
            log_arca_event("INFO", "Navegador Microsoft Edge iniciado con éxito.")
        except Exception as e_edge:
            log_arca_event("WARNING", f"Microsoft Edge no disponible ({e_edge}). Probando Chrome...")
            options_chrome = ChromeOptions()
            options_chrome.add_argument("--headless=new")
            options_chrome.add_argument("--disable-gpu")
            options_chrome.add_argument("--no-sandbox")
            options_chrome.add_argument("--window-size=1920,1080")
            options_chrome.add_experimental_option("prefs", prefs)
            driver = ChromeDriver(options=options_chrome)
            log_arca_event("INFO", "Navegador Google Chrome iniciado con éxito.")

        wait = WebDriverWait(driver, 20)

        # Paso 1: Login en ARCA
        update_status("LOGGING_IN", f"Accediendo al portal de ARCA para CUIT {cuit[:2]}***{cuit[-2:]}...")
        login_url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml"
        driver.get(login_url)
        log_arca_event("INFO", f"Navegando a página de login: {login_url}")

        user_input = wait.until(EC.element_to_be_clickable((By.ID, "F1:username")))
        user_input.clear()
        time.sleep(0.3)
        user_input.send_keys(cuit)
        time.sleep(0.3)
        
        btn_next = wait.until(EC.element_to_be_clickable((By.ID, "F1:btnSiguiente")))
        btn_next.click()
        log_arca_event("INFO", "CUIT ingresado, advancing a contraseña...")

        pass_input = wait.until(EC.visibility_of_element_located((By.ID, "F1:password")))
        pass_input.clear()
        time.sleep(0.3)
        pass_input.send_keys(clave)
        time.sleep(0.3)
        
        btn_login = wait.until(EC.element_to_be_clickable((By.ID, "F1:btnIngresar")))
        driver.execute_script("arguments[0].click();", btn_login)
        log_arca_event("INFO", "Clave Fiscal ingresada, enviando formulario de inicio de sesión...")

        time.sleep(5)
        current_url = driver.current_url
        log_arca_event("INFO", f"URL actual tras login: {current_url}")

        if "login" in current_url.lower() or "clave" in current_url.lower():
            err_text = ""
            try:
                err_elems = driver.find_elements(By.CSS_SELECTOR, ".alert-danger, .has-error, #divError, span.text-danger, font[color='red'], div[style*='color: red'], .invalid-feedback")
                if err_elems:
                    err_text = " ".join([e.text for e in err_elems if e.text.strip()])
            except Exception:
                pass
            
            if not err_text:
                err_text = "Clave o usuario incorrecto"

            raise RuntimeError(f"ARCA rechazó el inicio de sesión: '{err_text}'. Por favor verifica que el CUIT ({cuit}) y la Clave Fiscal ingresados en Ajustes sean los correctos.")

        # Paso 2: Navegar a Mis Comprobantes
        update_status("NAVIGATING", "Abriendo servicio Mis Comprobantes...")
        
        try:
            mc_elem = wait.until(EC.element_to_be_clickable((
                By.XPATH, 
                "//div[contains(text(), 'Mis Comprobantes')] | //h3[contains(text(), 'Mis Comprobantes')] | //p[contains(text(), 'Mis Comprobantes')] | //a[contains(@title, 'Mis Comprobantes')] | //span[contains(text(), 'Mis Comprobantes')]"
            )))
            mc_elem.click()
            log_arca_event("INFO", "Hiciste clic en la tarjeta Mis Comprobantes.")
        except Exception as e_mc:
            log_arca_event("WARNING", f"No se pudo hacer clic directo en Mis Comprobantes ({e_mc}), navegando por URL...")
            driver.get("https://serviciosjava.afip.gob.ar/comprobantes/")

        time.sleep(4)

        # CAMBIO A LA NUEVA PESTAÑA GENERADA
        if len(driver.window_handles) > 1:
            driver.switch_to.window(driver.window_handles[-1])
            log_arca_event("INFO", f"Cambio exitoso a la nueva pestaña abierta por Mis Comprobantes: {driver.current_url}")

        # Paso 3: Selección de Representada / Persona
        rep_clean = "".join(filter(str.isdigit, str(target_rep)))
        log_arca_event("INFO", f"Verificando pantalla de selección de representada/empresa (Target: '{target_rep}', CUIT: '{rep_clean}')...")

        time.sleep(3)
        page_src = driver.page_source.lower()
        if "elegí una persona" in page_src or "representar a" in page_src or len(driver.find_elements(By.XPATH, "//*[contains(text(), 'Elegí una persona') or contains(text(), 'REPRESENTAR A')]")) > 0:
            log_arca_event("INFO", "Pantalla 'Elegí una persona para ingresar' detectada.")
            
            rep_formatted = f"{rep_clean[:2]}-{rep_clean[2:10]}-{rep_clean[10]}" if len(rep_clean) == 11 else rep_clean
            
            search_terms = []
            if rep_formatted:
                search_terms.append(rep_formatted)
            if rep_clean:
                search_terms.append(rep_clean)
            if target_rep:
                clean_name = str(target_rep).replace("S.R.L.", "").replace("SRL", "").replace("S.A.", "").replace("SA", "").strip()
                if clean_name and clean_name not in search_terms:
                    search_terms.append(clean_name)
                if str(target_rep) not in search_terms:
                    search_terms.append(str(target_rep))

            selected_and_navigated = False

            for term in search_terms:
                if selected_and_navigated:
                    break

                log_arca_event("INFO", f"Buscando opción con término: '{term}'")

                # XPath para encontrar el elemento o sus ancestros clickeables
                xpath_query = (
                    f"//*[contains(text(), '{term}')]/ancestor-or-self::*[self::div or self::button or self::input or self::a or self::li or @onclick or contains(@class, 'card') or contains(@class, 'persona') or contains(@class, 'item') or contains(@class, 'row')][1]"
                    f" | //*[contains(text(), '{term}')]"
                )
                candidates = driver.find_elements(By.XPATH, xpath_query)

                for cand in candidates:
                    try:
                        if not cand.is_displayed():
                            continue
                        
                        log_arca_event("INFO", f"Intentando hacer clic en candidato para '{term}' ({cand.tag_name}, class='{cand.get_attribute('class')}')")
                        
                        # 1. Clic nativo con Selenium
                        try:
                            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", cand)
                            time.sleep(0.3)
                            cand.click()
                        except Exception:
                            driver.execute_script("arguments[0].click();", cand)

                        time.sleep(3)

                        # Verificar si navegó fuera de la pantalla de selección
                        if "elegí una persona" not in driver.page_source.lower() and "representar a" not in driver.page_source.lower():
                            selected_and_navigated = True
                            log_arca_event("INFO", f"¡Selección exitosa! Se navegó fuera de la pantalla de selección tras clic en '{term}'.")
                            break
                        else:
                            # Reintentar clic en ancestros si el elemento interno no provocó la navegación
                            parent = cand
                            for level in range(4):
                                try:
                                    parent = parent.find_element(By.XPATH, "..")
                                    if parent:
                                        log_arca_event("INFO", f"Reintentando clic en ancestro nivel {level+1} ({parent.tag_name})...")
                                        try:
                                            parent.click()
                                        except Exception:
                                            driver.execute_script("arguments[0].click();", parent)
                                        time.sleep(3)
                                        if "elegí una persona" not in driver.page_source.lower() and "representar a" not in driver.page_source.lower():
                                            selected_and_navigated = True
                                            log_arca_event("INFO", f"¡Selección exitosa tras clic en ancestro nivel {level+1}!")
                                            break
                                except Exception:
                                    break
                            if selected_and_navigated:
                                break
                    except Exception as e_click:
                        log_arca_event("WARNING", f"Error durante intento de clic en candidato: {e_click}")

            if not selected_and_navigated:
                log_arca_event("WARNING", "No se logró avanzar con términos específicos. Probando opciones genéricas en la pantalla...")
                generic_btns = driver.find_elements(By.CSS_SELECTOR, ".btn-empresa, .persona-item, div.card, button[type='submit'], input[type='button'], a.list-group-item, div[onclick]")
                for gb in generic_btns:
                    try:
                        if gb.is_displayed():
                            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", gb)
                            time.sleep(0.3)
                            try:
                                gb.click()
                            except Exception:
                                driver.execute_script("arguments[0].click();", gb)
                            time.sleep(3)
                            if "elegí una persona" not in driver.page_source.lower():
                                selected_and_navigated = True
                                log_arca_event("INFO", "¡Selección exitosa mediante opción genérica!")
                                break
                    except Exception:
                        pass

            if not selected_and_navigated:
                raise RuntimeError(f"No se pudo seleccionar la empresa/representada '{target_rep}' en la pantalla 'Elegí una persona para ingresar'.")

        # Paso 4: Click en tarjeta 'Recibidos' (Paso 3 del Paso a paso)
        update_status("SELECTING_SECTION", "Ingresando a Comprobantes Recibidos...")
        time.sleep(2)
        
        clicked_recibidos = False
        rec_candidates = driver.find_elements(By.XPATH, "//*[contains(text(), 'Recibidos')] | //a[contains(@href, 'recibidos')] | //*[contains(@class, 'card') or contains(@class, 'box') or self::a or self::button][.//text()[contains(translate(., 'recibidos', 'RECIBIDOS'), 'RECIBIDOS')]]")
        for el in rec_candidates:
            try:
                if el.is_displayed():
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
                    time.sleep(0.3)
                    try:
                        el.click()
                    except Exception:
                        driver.execute_script("arguments[0].click();", el)
                    
                    time.sleep(3)
                    if "recibidos" in driver.current_url.lower() or len(driver.find_elements(By.CSS_SELECTOR, "#buscarComprobantes, input.daterange, #fDesde, #fHasta")) > 0 or "comprobantes recibidos" in driver.page_source.lower():
                        clicked_recibidos = True
                        log_arca_event("INFO", f"Se ingresó correctamente a la sección 'Comprobantes Recibidos'. (URL: {driver.current_url})")
                        break
            except Exception as e_rec:
                log_arca_event("WARNING", f"Intento de clic en Recibidos falló: {e_rec}")

        if not clicked_recibidos:
            if len(driver.find_elements(By.CSS_SELECTOR, "#buscarComprobantes, input.daterange, input[name*='fecha'], #fechaComprobante")) == 0:
                raise RuntimeError("No se pudo ingresar a la sección 'Comprobantes Recibidos'.")

        # Paso 5: Ajustar periodo de fechas
        today = datetime.date.today()
        existing_csvs = [f for f in glob.glob(os.path.join(download_folder, "*")) if f.lower().endswith(('.csv', '.zip'))]
        if full_year or not existing_csvs:
            date_start_str = today.replace(month=1, day=1).strftime("%d/%m/%Y")
            log_arca_event("INFO", f"Sincronización inicial/año completo activa: descargando desde {date_start_str} hasta {today.strftime('%d/%m/%Y')}")
        else:
            date_start_str = today.replace(day=1).strftime("%d/%m/%Y")
            log_arca_event("INFO", f"Sincronización mensual activa: descargando desde {date_start_str} hasta {today.strftime('%d/%m/%Y')}")
        date_end_str = today.strftime("%d/%m/%Y")
        date_range_val = f"{date_start_str} - {date_end_str}"

        update_status("SETTING_DATES", f"Configurando fecha de comprobante: {date_range_val}...")

        date_range_set = False
        try:
            date_elems = driver.find_elements(By.CSS_SELECTOR, "#fechaComprobante, #fechaEmision, input.daterange, input[name*='fecha'], input[id*='fecha'], input[placeholder*='Fecha']")
            for de in date_elems:
                if de.is_displayed():
                    driver.execute_script("arguments[0].value = ''; arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input')); arguments[0].dispatchEvent(new Event('change'));", de, date_range_val)
                    date_range_set = True
                    log_arca_event("INFO", f"Fijada fecha del comprobante a '{date_range_val}'.")
                    break
        except Exception as e_dates:
            log_arca_event("WARNING", f"Advertencia al ajustar fecha del comprobante: {e_dates}")

        if not date_range_set:
            try:
                f_desde = driver.find_elements(By.CSS_SELECTOR, "#fDesde, #fechaDesde, input[name='fechaDesde']")
                f_hasta = driver.find_elements(By.CSS_SELECTOR, "#fHasta, #fechaHasta, input[name='fechaHasta']")
                if f_desde and f_hasta:
                    driver.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change'));", f_desde[0], date_start_str)
                    driver.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change'));", f_hasta[0], date_end_str)
                    log_arca_event("INFO", f"Fijadas fechas desde '{date_start_str}' hasta '{date_end_str}'.")
            except Exception as e_dh:
                log_arca_event("WARNING", f"Error ajustando fechas desde/hasta: {e_dh}")

        time.sleep(1.5)

        # Paso 6: Click en botón 'BUSCAR'
        update_status("QUERYING", "Haciendo clic en el botón BUSCAR...")
        if not find_and_click_buscar(driver):
            log_arca_event("ERROR", "No se pudo localizar el botón BUSCAR en el formulario.")
            raise RuntimeError("No se pudo localizar el botón BUSCAR en la pantalla de Comprobantes Recibidos.")

        time.sleep(6)

        # Paso 7: Descargar CSV (Paso dificil 2)
        update_status("DOWNLOADING", "Descargando archivo CSV de comprobantes...")
        if not find_and_click_csv(driver):
            log_arca_event("ERROR", "No se pudo localizar el botón CSV en la tabla de resultados.")
            raise RuntimeError("No se pudo localizar el botón CSV en los resultados de la consulta.")

        # Esperar archivo descargado en CSV ARCA (soporta .csv y .zip)
        downloaded_file = None
        for i in range(35):
            time.sleep(1)
            files_after = set(glob.glob(os.path.join(download_folder, "*")))
            new_files = {f for f in (files_after - files_before) if f.lower().endswith(('.csv', '.zip')) and not f.endswith('.crdownload') and not f.endswith('.tmp')}
            if new_files:
                downloaded_file = list(new_files)[0]
                break

        if not downloaded_file:
            all_valid = sorted([f for f in glob.glob(os.path.join(download_folder, "*")) if f.lower().endswith(('.csv', '.zip'))], key=os.path.getmtime, reverse=True)
            if all_valid:
                downloaded_file = all_valid[0]
                log_arca_event("INFO", f"Comprobante tomado de la carpeta: {os.path.basename(downloaded_file)}")
            else:
                raise RuntimeError("No se detectó el archivo CSV/ZIP descargado de ARCA en la carpeta CSV ARCA.")

        # Si el archivo descargado es un ZIP, descomprimirlo automáticamente
        if downloaded_file.lower().endswith('.zip'):
            import zipfile
            try:
                log_arca_event("INFO", f"Descomprimiendo archivo ZIP descargado: {os.path.basename(downloaded_file)}...")
                with zipfile.ZipFile(downloaded_file, 'r') as zip_ref:
                    for zip_info in zip_ref.infolist():
                        if zip_info.filename.lower().endswith('.csv'):
                            zip_info.filename = os.path.basename(zip_info.filename)
                            zip_ref.extract(zip_info, download_folder)
                            log_arca_event("INFO", f"CSV extraído exitosamente desde ZIP: {zip_info.filename}")
            except Exception as e_unzip:
                log_arca_event("WARNING", f"Advertencia al descomprimir ZIP: {e_unzip}")

        # Paso 8: Procesar el CSV e integrar proveedores
        update_status("PROCESSING", "Procesando archivo CSV y actualizando lista de proveedores...")
        import importlib
        from update_suppliers import update_config_suppliers

        res_update = update_config_suppliers()
        importlib.reload(config)
        updated_count = res_update.get("added", 0) if isinstance(res_update, dict) else (res_update or 0)

        _bot_status["last_run"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        msg_success = f"¡Sincronización exitosa con ARCA! Archivo '{os.path.basename(downloaded_file)}' procesado ({updated_count} proveedores sincronizados)."
        update_status("COMPLETED", msg_success)
        log_arca_event("INFO", msg_success)

        return {
            "success": True,
            "message": msg_success,
            "file": os.path.basename(downloaded_file)
        }

    except Exception as e:
        full_tb = traceback.format_exc()
        err_msg = f"Error en la sincronización con ARCA: {str(e)}"
        
        if driver:
            try:
                screenshot_path = os.path.join(config.REGISTROS_FOLDER, "arca_error_screenshot.png")
                driver.save_screenshot(screenshot_path)
                log_arca_event("ERROR", f"Captura de pantalla de error guardada en: {screenshot_path}")
            except Exception:
                pass

        log_arca_event("ERROR", err_msg, details=full_tb)
        update_status("ERROR", "Falló la sincronización con ARCA", error=err_msg)
        return {"success": False, "message": err_msg, "traceback": full_tb}

    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
        _bot_status["running"] = False
        _bot_lock.release()
