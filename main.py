import time
import os
from watchdog.observers.polling import PollingObserver as Observer
from watchdog.events import FileSystemEventHandler
from processor import process_invoice
from config import INPUT_FOLDER, ALLOWED_EXTENSIONS

class InvoiceHandler(FileSystemEventHandler):
    def process_file(self, file_path):
        # Asegurarse de que el archivo existe y no es una carpeta
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            return
            
        _, ext = os.path.splitext(file_path)
        if ext.lower() in ALLOWED_EXTENSIONS:
            print(f"Nuevo archivo detectado: {file_path}", flush=True)
            try:
                process_invoice(file_path)
            except Exception as e:
                print(f"Error al procesar {file_path}: {e}", flush=True)

    def on_created(self, event):
        self.process_file(event.src_path)

    def on_moved(self, event):
        # on_moved se dispara cuando un archivo se mueve o se renombra en la carpeta
        self.process_file(event.dest_path)

def main():
    if not os.path.exists(INPUT_FOLDER):
        os.makedirs(INPUT_FOLDER)
        print(f"Carpeta de entrada creada: {INPUT_FOLDER}", flush=True)
    
    # Procesar archivos que ya existen en la carpeta de entrada al iniciar
    print("Buscando archivos existentes en la carpeta de entrada...", flush=True)
    for filename in os.listdir(INPUT_FOLDER):
        file_path = os.path.join(INPUT_FOLDER, filename)
        if os.path.isfile(file_path):
            _, ext = os.path.splitext(file_path)
            if ext.lower() in ALLOWED_EXTENSIONS:
                print(f"Archivo existente encontrado: {file_path}", flush=True)
                try:
                    process_invoice(file_path)
                except Exception as e:
                    print(f"Error al procesar archivo existente {file_path}: {e}", flush=True)
        
    event_handler = InvoiceHandler()
    observer = Observer()
    observer.schedule(event_handler, path=INPUT_FOLDER, recursive=False)
    
    print(f"\nIniciando el Vigía en tiempo real en {INPUT_FOLDER}...", flush=True)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("\nVigía detenido.", flush=True)
        
    observer.join()

if __name__ == "__main__":
    main()
