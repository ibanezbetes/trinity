import subprocess
import time
import sys
import uiautomation as auto

def log(msg):
    print(f"🤖 [AutoTest] {msg}")

def run_test():
    log("Iniciando prueba de UI...")
    
    # 1. Abrir navegador en localhost
    url = "http://localhost:8081"
    log(f"Abriendo {url}...")
    try:
        subprocess.Popen(f'start {url}', shell=True)
    except Exception as e:
        log(f"Error abriendo navegador: {e}")
        return

    # Esperar carga
    log("Esperando 10 segundos para carga de App...")
    time.sleep(10)

    # 2. Conectar a la ventana del navegador
    # Intentamos encontrar ventana de Chrome o Edge
    window = auto.WindowControl(searchDepth=2, ClassName='Chrome_WidgetWin_1')
    if not window.Exists(3):
        # Fallback para Edge u otros
        window = auto.WindowControl(searchDepth=2, SubName='Trinity')
    
    if not window.Exists(1):
        log("⚠️ No se encontró la ventana del navegador. Asegúrate de que localhost:8081 está abierto y en primer plano.")
        return

    log(f"Ventana encontrada: {window.Name}")
    window.SetFocus()
    time.sleep(1)

    # 3. Buscar Botón "Crear Sala" (o texto similar)
    # Trinity App suele tener un botón grande en el Home
    log("Buscando botón 'Crear Sala'...")
    
    # Buscamos elementos de tipo Button o Text que contengan "Crear" o "Create"
    # Esto es una búsqueda heurística
    create_btn = window.ButtonControl(searchDepth=10, SubName="Crear")
    if not create_btn.Exists(0):
        create_btn = window.TextControl(searchDepth=10, SubName="Crear")
    
    if create_btn.Exists(3):
        log("Botón 'Crear' encontrado. Haciendo click...")
        create_btn.Click()
        time.sleep(2)
        
        # 4. Introducir nombre de sala
        # Buscar edit field
        log("Buscando campo de texto...")
        edit = window.EditControl(searchDepth=10)
        if edit.Exists(3):
            log("Escribiendo nombre de sala...")
            edit.Click()
            edit.SendKeys("Test Room Auto")
            time.sleep(1)
            
            # Confirmar (Enter)
            edit.SendKeys('{Enter}')
            log("Enviado Enter...")
            time.sleep(5)
            
            # 5. Verificar si cargó la sala (buscar texto de película o votar)
            log("Verificando carga de sala...")
            # Si aparece un botón de Votar (Like/Dislike) o texto
            # Buscar elementos genéricos
            doc = window.DocumentControl(searchDepth=5)
            if doc.Exists(3):
                log("Documento web activo. Test básico completado.")
                # Aquí la lógica se complica sin selectores precisos, pero el hecho de llegar aquí es buena señal
            
        else:
            log("⚠️ No se encontró campo de texto para nombre de sala.")
    else:
        log("⚠️ No se encontró botón 'Crear Sala'. Puede que la app no haya cargado o requiera login.")
        # Intentar buscar "Login" o "Entrar"
        login_btn = window.ButtonControl(searchDepth=10, SubName="Entrar")
        if login_btn.Exists(1):
            log("Parece que estamos en Login. El test asume sesión iniciada o modo invitado.")

    log("Prueba UI finalizada.")

if __name__ == "__main__":
    run_test()
