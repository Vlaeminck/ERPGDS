import os
import time
from pywinauto.application import Application
from pywinauto import Desktop

def run_scanner():
    print("Iniciando la app de Escáner...")
    os.startfile('windowsscan:')
    time.sleep(4) # Esperar a que la interfaz cargue
    
    app = Desktop(backend="uia")
    try:
        # Buscar la ventana principal
        print("Buscando ventana 'Escáner'...")
        window = app.window(title="Escáner")
        window.wait('visible', timeout=10)
        
        # Ponerla al frente
        try:
            window.set_focus()
        except:
            pass
            
        # Buscar el botón "Digitalizar"
        print("Buscando botón 'Digitalizar'...")
        btn = window.child_window(title="Digitalizar", control_type="Button")
        btn.wait('visible', timeout=10)
        
        # Hacer clic
        print("Haciendo clic en Digitalizar...")
        btn.click_input()
        
        # Esperar a que termine. Sabemos que terminó cuando aparece el botón "Cerrar" arriba a la derecha.
        print("Esperando a que finalice el escaneo...")
        try:
            close_btn = window.child_window(title="Cerrar", control_type="Button")
            close_btn.wait('visible', timeout=120) # Puede tardar un rato en escanear
        except Exception:
            # Fallback: esperar un tiempo fijo si no se detecta el botón
            print("No se detectó el botón Cerrar, esperando 15 segundos...")
            time.sleep(15)
            
        # Cerrar la aplicación
        print("Cerrando la ventana...")
        window.close()
        print("Automatización completada exitosamente.")
        return True
    except Exception as e:
        print(f"Error en macro: {e}")
        return False

if __name__ == "__main__":
    run_scanner()
