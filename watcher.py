import os
import time
import threading
from watchdog.observers.polling import PollingObserver as Observer
from watchdog.events import FileSystemEventHandler
from processor import process_invoice
from config import INPUT_FOLDER, ALLOWED_EXTENSIONS

class InvoiceHandler(FileSystemEventHandler):
    def __init__(self, watcher_manager):
        self.watcher_manager = watcher_manager

    def process_file(self, file_path):
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            return
            
        _, ext = os.path.splitext(file_path)
        if ext.lower() in ALLOWED_EXTENSIONS:
            self.watcher_manager.update_activity()
            print(f"Nuevo archivo detectado: {file_path}", flush=True)
            try:
                process_invoice(file_path)
            except Exception as e:
                print(f"Error al procesar {file_path}: {e}", flush=True)
            self.watcher_manager.update_activity()

    def on_created(self, event):
        self.process_file(event.src_path)

    def on_moved(self, event):
        self.process_file(event.dest_path)

class WatcherManager:
    def __init__(self):
        self.observer = None
        self.is_running = False
        self.is_processing_batch = False
        self.total_files_to_process = 0
        self.files_processed_so_far = 0
        self.last_activity_time = time.time()
        self.auto_stop_thread = None
        self.is_ai_processing = False
        
    def update_activity(self):
        self.last_activity_time = time.time()
        
    def _auto_stop_worker(self):
        while self.is_running or self.is_processing_batch:
            # Si pasaron más de 300 segundos (5 minutos) sin actividad
            if time.time() - self.last_activity_time > 300:
                print("Inactividad detectada (5 min). Deteniendo el vigía automáticamente.", flush=True)
                self.stop()
                break
            time.sleep(5)
            
    def _process_existing_files_worker(self):
        self.is_processing_batch = True
        self.files_processed_so_far = 0
        self.update_activity()
        
        if not os.path.exists(INPUT_FOLDER):
            os.makedirs(INPUT_FOLDER)
            
        print("Buscando archivos existentes en la carpeta de entrada...", flush=True)
        files_to_process = []
        for filename in os.listdir(INPUT_FOLDER):
            file_path = os.path.join(INPUT_FOLDER, filename)
            if os.path.isfile(file_path):
                _, ext = os.path.splitext(file_path)
                if ext.lower() in ALLOWED_EXTENSIONS:
                    files_to_process.append(file_path)
                    
        self.total_files_to_process = len(files_to_process)
        
        for file_path in files_to_process:
            self.update_activity()
            print(f"Archivo existente encontrado: {file_path}", flush=True)
            try:
                process_invoice(file_path)
            except Exception as e:
                print(f"Error al procesar archivo existente {file_path}: {e}", flush=True)
            self.files_processed_so_far += 1
            self.update_activity()
            
        self.is_processing_batch = False
        
        # Una vez terminado el lote, iniciamos el observer en tiempo real
        if not self.is_running:
            event_handler = InvoiceHandler(self)
            self.observer = Observer()
            self.observer.schedule(event_handler, path=INPUT_FOLDER, recursive=False)
            self.observer.start()
            self.is_running = True
            print(f"Vigía iniciado en {INPUT_FOLDER}", flush=True)
            
            # Start the auto stop worker
            self.auto_stop_thread = threading.Thread(target=self._auto_stop_worker)
            self.auto_stop_thread.daemon = True
            self.auto_stop_thread.start()
                        
    def start(self):
        if self.is_running or self.is_processing_batch:
            return False, "El vigía ya está corriendo o procesando un lote."
            
        if not os.path.exists(INPUT_FOLDER):
            os.makedirs(INPUT_FOLDER)
            
        self.update_activity()
        thread = threading.Thread(target=self._process_existing_files_worker)
        thread.daemon = True
        thread.start()
        
        return True, "Vigía iniciando. Procesando lote en segundo plano."

    def stop(self):
        if not self.is_running:
            return False, "El vigía no está corriendo."
            
        if self.observer:
            self.observer.stop()
            # No hacemos join en auto_stop porque traba el observer desde otro hilo.
            # self.observer.join()
        self.is_running = False
        print("Vigía detenido.", flush=True)
        return True, "Vigía detenido correctamente."

# Instancia global para ser usada desde la app Flask
watcher_manager = WatcherManager()
