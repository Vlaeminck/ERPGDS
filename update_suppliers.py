import os
import sys
import re
import csv
import io

def clean_supplier_name(name):
    # Eliminar espacios múltiples
    name = re.sub(r'\s+', ' ', name).strip()
    words = name.split()
    capitalized_words = []
    # Siglas o términos que deben permanecer completamente en mayúsculas
    always_upper = {"SA", "SRL", "S.A.", "S.R.L.", "SH", "S.H.", "IV", "III", "II", "I", "S.A", "S.R"}
    for word in words:
        # Remover puntuación para comparar si es sigla
        word_stripped = re.sub(r'[^\w\.]', '', word).upper()
        if word_stripped in always_upper or word.upper() in always_upper:
            capitalized_words.append(word.upper())
        else:
            capitalized_words.append(word.capitalize())
    return " ".join(capitalized_words)

def format_cuit(cuit_str):
    # Dejar solo dígitos
    cuit_digits = re.sub(r'\D', '', cuit_str)
    if len(cuit_digits) == 11:
        return f"{cuit_digits[:2]}-{cuit_digits[2:10]}-{cuit_digits[10]}"
    return cuit_str

def get_base_keywords(clean_name):
    name_lower = clean_name.lower().strip()
    
    # Expresiones regulares para eliminar sufijos y descripciones comerciales comunes de la razón social
    suffixes = [
        r'\bs\.\s*cap\s+i\s+secc\s+iv\b',
        r'\bs\.\s*cap\s+i\s+iv\b',
        r'\bsociedad ley 19550 cap i seccion iv\b',
        r'\bsociedad ley 19550 cap i seccion iv de\b',
        r'\bsociedad anonima comercial e industrial y agropecuaria\b',
        r'\bsociedad anonima industrial comercial financiera inmobiliaria\b',
        r'\bcentro integral de comercializacion sociedad anonima\b',
        r'\bcooperativa obrera limitada de consumo y vivienda\b',
        r'\bmonitoreo de alarmas sa\b',
        r'\btelecom argentina sociedad anonima\b',
        r'\btelefonica moviles argentina sociedad anonima\b',
        r'\boperadora de estaciones de servicios sa\b',
        r'\bcompania de transporte de energia electrica\b',
        r'\bempresa distribuidora y comercializadora norte\b',
        r'\bsociedad anonima comercial\b',
        r'\bcomercial e industrial\b',
        r'\bde buenos aires s a\b',
        r'\bde buenos aires sa\b',
        r'\bde buenos aires\b',
        r'\bde argentina s a\b',
        r'\bde argentina sa\b',
        r'\bargentina sa\b',
        r'\bargentina s.a.\b',
        r'\bsociedad anonima\b',
        r'\bsociedad del estado\b',
        r'\bs.a.s.\b',
        r'\bsas\b',
        r'\bs.r.l.\b',
        r'\bsrl\b',
        r'\bs.a.\b',
        r'\bsa\b',
        r'\bs.h.\b',
        r'\bsh\b',
        r'\bs.c.a.\b',
        r'\bs.c.\b',
        r'\bltda\b',
        r'\blimitada\b',
    ]
    
    base = name_lower
    for suffix in suffixes:
        base = re.sub(suffix, '', base)
        
    base = re.sub(r'\s+', ' ', base).strip()
    
    keywords = [name_lower]
    if base and base != name_lower:
        keywords.append(base)
        
    # Manejar conjunciones " y " o " de " para nombres compuestos
    parts = re.split(r'\s+y\s+|\s+de\s+', name_lower)
    if len(parts) > 1:
        for part in parts:
            part_clean = part.strip()
            # Limpiar de sufijos comunes si queda algo de ellos
            for suffix in suffixes:
                part_clean = re.sub(suffix, '', part_clean)
            part_clean = re.sub(r'\s+', ' ', part_clean).strip()
            if part_clean and len(part_clean) > 3:  # Evitar palabras extremadamente cortas
                keywords.append(part_clean)
                
    return list(dict.fromkeys(keywords))

def read_csv_safe(file_path):
    encodings = ['utf-8', 'latin-1', 'cp1252', 'utf-8-sig']
    for encoding in encodings:
        try:
            with open(file_path, mode='r', encoding=encoding) as f:
                content = f.read()
            return content, encoding
        except (UnicodeDecodeError, PermissionError, OSError):
            continue
    raise ValueError(f"No se pudo acceder o decodificar el archivo {file_path}.")

def extract_suppliers_from_csv_folder(csv_folder):
    if not os.path.exists(csv_folder):
        print(f"La carpeta {csv_folder} no existe.")
        return []
    
    # Descomprimir automáticamente cualquier archivo ZIP presente en la carpeta
    import zipfile
    for f in os.listdir(csv_folder):
        if f.lower().endswith('.zip'):
            zip_path = os.path.join(csv_folder, f)
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    for zip_info in zip_ref.infolist():
                        if zip_info.filename.lower().endswith('.csv'):
                            zip_info.filename = os.path.basename(zip_info.filename)
                            zip_ref.extract(zip_info, csv_folder)
                print(f"Extraído archivo CSV desde ZIP: {f}")
            except Exception as e_zip:
                print(f"Error al descomprimir ZIP {f}: {e_zip}")
    
    csv_files = [os.path.join(csv_folder, f) for f in os.listdir(csv_folder) if f.lower().endswith('.csv')]
    if not csv_files:
        print(f"No se encontraron archivos CSV en {csv_folder}")
        return []
    
    extracted_suppliers = []
    
    for file_path in csv_files:
        print(f"Leyendo CSV: {os.path.basename(file_path)}")
        try:
            content, encoding = read_csv_safe(file_path)
            reader = csv.reader(io.StringIO(content), delimiter=';')
            rows = list(reader)
            if not rows:
                continue
                
            header = [col.strip().replace('"', '') for col in rows[0]]
            
            try:
                cuit_idx = header.index("Nro. Doc. Emisor")
                name_idx = header.index("Denominación Emisor")
            except ValueError:
                cuit_idx = 7
                name_idx = 8
                
            for row in rows[1:]:
                if len(row) <= max(cuit_idx, name_idx):
                    continue
                cuit = row[cuit_idx].strip().replace('"', '')
                name = row[name_idx].strip().replace('"', '')
                if cuit and name:
                    extracted_suppliers.append((cuit, name))
        except Exception as e:
            print(f"Error procesando {os.path.basename(file_path)}: {e}")
            
    return extracted_suppliers

def update_config_suppliers():
    import config
    BASE_DIR = config.BASE_DIR
    CSV_FOLDER = config.CSV_ARCA_FOLDER
    CONFIG_PATH = os.path.join(BASE_DIR, "config.py")
    
    # 1. Cargar proveedores existentes
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)
        
    try:
        import config
        import importlib
        importlib.reload(config)
        existing_suppliers = getattr(config, "SUPPLIERS", {})
    except Exception as e:
        print(f"Advertencia: No se pudo importar config.py ({e}). Se iniciará con una lista vacía de proveedores.")
        existing_suppliers = {}
        
    # Construir conjunto de palabras clave y nombres existentes para deduplicación
    existing_keywords = set()
    existing_names = set()
    
    for s_name, s_data in existing_suppliers.items():
        existing_names.add(s_name.lower().strip())
        existing_keywords.add(s_name.lower().strip())
        for kw in s_data.get("keywords", []):
            existing_keywords.add(kw.lower().strip())
            cuit_digits = re.sub(r'\D', '', kw)
            if len(cuit_digits) == 11:
                existing_keywords.add(cuit_digits)
                existing_keywords.add(format_cuit(cuit_digits))
                
    # 2. Extraer proveedores de los archivos CSV
    raw_extracted = extract_suppliers_from_csv_folder(CSV_FOLDER)
    
    # 3. Procesar y deduplicar nuevos proveedores
    updated_suppliers = dict(existing_suppliers)
    added_count = 0
    skipped_count = 0
    
    for cuit, name in raw_extracted:
        cuit_digits = re.sub(r'\D', '', cuit)
        cuit_formatted = format_cuit(cuit_digits)
        clean_name = clean_supplier_name(name)
        clean_name_lower = clean_name.lower().strip()
        
        is_duplicate = (
            cuit_digits in existing_keywords or
            cuit_formatted in existing_keywords or
            clean_name_lower in existing_keywords or
            clean_name_lower in existing_names
        )
        
        if is_duplicate:
            skipped_count += 1
            continue
            
        keywords = [clean_name_lower]
        if len(cuit_digits) == 11:
            keywords.append(cuit_formatted)
            keywords.append(cuit_digits)
            
        updated_suppliers[clean_name] = {
            "keywords": keywords,
            "invoice_regex": r"(\d{4,5}\s*-\s*\d{8})"
        }
        
        existing_names.add(clean_name_lower)
        existing_keywords.add(clean_name_lower)
        if len(cuit_digits) == 11:
            existing_keywords.add(cuit_digits)
            existing_keywords.add(cuit_formatted)
            
        added_count += 1
        print(f"Nuevo proveedor identificado: {clean_name} (CUIT: {cuit_formatted})")
        
    print(f"\nResumen preliminar de extracción:")
    print(f"- Proveedores nuevos identificados: {added_count}")
    print(f"- Proveedores ya existentes omitidos: {skipped_count}")
    
    # 4. Re-procesar y enriquecer todos los proveedores en la lista final con palabras clave simplificadas
    print("\nEnriqueciendo palabras clave para todos los proveedores (viejos y nuevos)...")
    final_suppliers = {}
    for s_name, s_data in updated_suppliers.items():
        # Encontrar CUIT en los keywords existentes
        cuit_digits = None
        for kw in s_data.get("keywords", []):
            clean_kw = re.sub(r'\D', '', kw)
            if len(clean_kw) == 11:
                cuit_digits = clean_kw
                break
                
        # Obtener palabras clave base
        kws = get_base_keywords(s_name)
        
        # Agregar CUIT si se encontró
        if cuit_digits:
            cuit_formatted = format_cuit(cuit_digits)
            if cuit_formatted not in kws:
                kws.append(cuit_formatted)
            if cuit_digits not in kws:
                kws.append(cuit_digits)
                
        # Mantener palabras clave personalizadas originales (excluyendo genéricas de una sola palabra)
        for kw in s_data.get("keywords", []):
            kw_lower = kw.lower().strip()
            clean_kw = re.sub(r'\D', '', kw)
            if len(clean_kw) != 11 and kw_lower not in kws:
                # Si el keyword es una sola palabra y la base de la razón social tiene múltiples palabras, la omitimos
                base_words = [w for w in get_base_keywords(s_name) if len(re.sub(r'\D', '', w)) != 11]
                shortest_base = min(base_words, key=len) if base_words else ""
                if len(kw_lower.split()) == 1 and len(shortest_base.split()) > 1:
                    continue
                kws.append(kw_lower)
                
        final_suppliers[s_name] = {
            "keywords": kws,
            "invoice_regex": s_data.get("invoice_regex", r"(\d{4,5}\s*-\s*\d{8})")
        }
        
    # 5. Escribir los cambios en suppliers.json
    SUPPLIERS_PATH = os.path.join(BASE_DIR, "suppliers.json")
    try:
        import json
        with open(SUPPLIERS_PATH, 'w', encoding='utf-8') as f:
            json.dump(final_suppliers, f, indent=4, ensure_ascii=False)
            
        msg = f"¡Éxito! suppliers.json ha sido actualizado correctamente. {added_count} nuevos, {skipped_count} omitidos."
        print(msg)
        return {"success": True, "added": added_count, "skipped": skipped_count, "message": msg}
        
    except Exception as e:
        msg = f"Error al escribir en suppliers.json: {e}"
        print(msg)
        return {"success": False, "message": msg}

if __name__ == "__main__":
    update_config_suppliers()
