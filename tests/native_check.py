"""Prueba del ejecutable real en X11 con un journal temporal separado."""
import ctypes
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import time

import gi
gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gdk, GdkX11, Gtk

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification"
OUT.mkdir(exist_ok=True)
EXECUTABLE = ROOT / "src-tauri/target/release/sukijournal"
sources = [path for folder in (ROOT / "frontend", ROOT / "src-tauri/src")
           for path in folder.rglob("*") if path.is_file()]
assert EXECUTABLE.exists() and EXECUTABLE.stat().st_mtime >= max(path.stat().st_mtime for path in sources), \
    "Compilá el ejecutable release actualizado antes de ejecutar la prueba nativa (ver README)."
Gtk.init([])
x11 = ctypes.CDLL("libX11.so.6")
xtest = ctypes.CDLL("libXtst.so.6")
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
xtest.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
xtest.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtest.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
display = x11.XOpenDisplay(None)
assert display, "Se necesita una sesión X11"


def wait_for(predicate, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        while Gtk.events_pending():
            Gtk.main_iteration_do(False)
        if predicate():
            return
        time.sleep(0.05)
    raise TimeoutError("Se agotó el tiempo de espera")


def geometry(native):
    # La geometría cacheada de una ventana Gdk extranjera puede preceder al ajuste del WM.
    info = subprocess.check_output(["xwininfo", "-id", hex(native.get_xid())], text=True)
    return tuple(int(re.search(label + r":\s*(-?\d+)", info).group(1)) for label in
                 ("Absolute upper-left X", "Absolute upper-left Y", "Width", "Height"))


def click(native, x, y):
    root_x, root_y, _, _ = geometry(native)
    xtest.XTestFakeMotionEvent(display, -1, root_x + x, root_y + y, 0)
    x11.XFlush(display)
    time.sleep(0.05)
    xtest.XTestFakeButtonEvent(display, 1, 1, 0)
    x11.XFlush(display)
    time.sleep(0.05)
    xtest.XTestFakeButtonEvent(display, 1, 0, 0)
    x11.XFlush(display)
    time.sleep(0.1)


def key(keysym):
    code = x11.XKeysymToKeycode(display, keysym)
    xtest.XTestFakeKeyEvent(display, code, 1, 0)
    xtest.XTestFakeKeyEvent(display, code, 0, 0)
    x11.XFlush(display)
    time.sleep(0.05)


def drawing_stroke(native, points):
    root_x, root_y, _, _ = geometry(native)
    for index, (x,y) in enumerate(points):
        xtest.XTestFakeMotionEvent(display,-1,root_x+x,root_y+y,0)
        if index == 0:
            xtest.XTestFakeButtonEvent(display,1,1,0)
        x11.XFlush(display)
        time.sleep(0.12)
    xtest.XTestFakeButtonEvent(display,1,0,0)
    x11.XFlush(display)
    time.sleep(0.15)


def scroll_top(native, x):
    root_x, root_y, _, _ = geometry(native)
    xtest.XTestFakeMotionEvent(display, -1, root_x + x, root_y + 200, 0)
    for _ in range(40):
        xtest.XTestFakeButtonEvent(display, 4, 1, 0)
        xtest.XTestFakeButtonEvent(display, 4, 0, 0)
    x11.XFlush(display)
    time.sleep(0.3)


def click_tool(native, y):
    # El foco del catálogo puede desplazar la barra lateral. Restablecerla antes
    # de usar las coordenadas de sus herramientas.
    scroll_top(native, 100)
    click(native, 100, y)


def modified_key(keysym, modifier=0xFFE1):
    code = x11.XKeysymToKeycode(display, modifier)
    xtest.XTestFakeKeyEvent(display, code, 1, 0)
    key(keysym)
    xtest.XTestFakeKeyEvent(display, code, 0, 0)
    x11.XFlush(display)


def native_dialog(title):
    found = []

    def opened():
        tree = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
        for match in re.finditer(r'(0x[0-9a-f]+) "' + re.escape(title) + r'"', tree):
            info = subprocess.check_output(["xwininfo", "-id", match.group(1)], text=True)
            # GTK conserva ventanas ocultas de selectores cancelados. Esperar la
            # ventana visible evita enviar teclas al selector anterior.
            if 'Map State: IsViewable' in info:
                found.append(int(match.group(1), 16))
                return True
        return False

    wait_for(opened)
    x11.XSetInputFocus(display, found[0], 1, 0)
    x11.XFlush(display)
    time.sleep(0.3)
    return GdkX11.X11Window.foreign_new_for_display(Gdk.Display.get_default(), found[0])


def enter_file_path(title, path):
    dialog = native_dialog(title)
    screenshot(dialog, 'stage7-native-file-dialog.png')
    modified_key(ord('l'), modifier=0xFFE3)  # Ctrl+L: ubicación del selector GTK.
    modified_key(ord('a'), modifier=0xFFE3)  # Incluir también la extensión preseleccionada.
    type_ascii(str(path))
    if title.startswith('Abrir'):
        key(0xFF0D)  # Resolver la ubicación antes de confirmar la selección.
        time.sleep(0.5)
    _, _, width, height = geometry(dialog)
    info = subprocess.check_output(['xwininfo', '-id', hex(dialog.get_xid())], text=True)
    if 'Map State: IsViewable' in info:
        print(f'Selector {title}: {geometry(dialog)}', flush=True)
        click(dialog, width - 50, height - 24)  # Confirmar con Guardar o Abrir.
    time.sleep(0.3)
    screenshot(Gdk.get_default_root_window(), 'stage7-native-file-choice.png')


def accept_name(value):
    time.sleep(0.2)
    type_ascii(value)  # El campo se abre con el nombre seleccionado.
    key(0xFF09)  # Cancelar.
    key(0xFF09)  # Aceptar.
    key(0xFF0D)


def type_ascii(value):
    shifted = dict(zip('~!@#$%^&*()_+{}|:"<>?', '`1234567890-=[]\\;\',./'))
    for character in value:
        if character.isupper():
            modified_key(ord(character.lower()))
        elif character in shifted:
            modified_key(ord(shifted[character]))
        else:
            key(0xFF0D if character == '\n' else ord(character))
        time.sleep(0.02)


def screenshot(native, name):
    _, _, width, height = geometry(native)
    pixbuf = Gdk.pixbuf_get_from_window(native, 0, 0, width, height)
    assert pixbuf is not None
    pixbuf.savev(str(OUT / name), "png", [], [])


with tempfile.TemporaryDirectory(prefix="suki-stage7-", dir=OUT) as temporary:
    environment = dict(os.environ, XDG_DATA_HOME=temporary,
                       XDG_CACHE_HOME=str(Path(temporary) / "cache"),
                       XDG_CONFIG_HOME=str(Path(temporary) / "config"))
    database = Path(temporary) / "com.sukijournal.desktop/journal/journal.sqlite"

    def state():
        if not database.exists():
            return None
        try:
            with sqlite3.connect(database) as connection:
                return {"journal": connection.execute("SELECT title,active_page_id,revision FROM journal").fetchone(),
                        "pages": connection.execute("SELECT id,title,elements FROM pages ORDER BY position").fetchall()}
        except sqlite3.Error:
            return None

    def file_path():
        try:
            with sqlite3.connect(database) as connection:
                row = connection.execute("SELECT data FROM session_metadata WHERE id = 1").fetchone()
                return json.loads(row[0]).get('path') if row else None
        except sqlite3.Error:
            return None

    reports = []
    for run in (1, 2):
        log_path = OUT / f"stage7-native-{run}.log"
        with log_path.open("w") as log:
            process = subprocess.Popen([str(EXECUTABLE)],
                                       cwd=ROOT, env=environment, stdout=log, stderr=log)
            try:
                window_id = []

                def opened():
                    assert process.poll() is None, "El ejecutable terminó antes de abrir"
                    tree = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
                    for match in re.finditer(r'(0x[0-9a-f]+) "Suki Journal"', tree):
                        owner = subprocess.check_output(
                            ["xprop", "-id", match.group(1), "_NET_WM_PID"], text=True)
                        if re.search(rf"= {process.pid}$", owner.strip()):
                            window_id.append(int(match.group(1), 16))
                            return True
                    return False

                wait_for(opened)
                native = GdkX11.X11Window.foreign_new_for_display(Gdk.Display.get_default(), window_id[0])
                wait_for(lambda: state() is not None)
                # Dar tiempo al WebView para cargar el estado y registrar el cierre.
                time.sleep(2)
                x11.XSetInputFocus(display, window_id[0], 1, 0)
                x11.XFlush(display)
                if run == 1:
                    assert len(state()["pages"]) == 1
                    screenshot(native, "stage7-native-initial.png")
                    click(native, 364, geometry(native)[3] - 36)
                    wait_for(lambda: len(state()["pages"]) == 2)
                    key(0xFF0D)  # Enter: el botón + conserva su foco.
                    wait_for(lambda: len(state()["pages"]) == 3)
                    click(native, 276, geometry(native)[3] - 36)  # Página 1.
                    wait_for(lambda: state()["journal"][1] == "page-1")
                    click_tool(native, 387)  # Texto.
                    key(0xFF0D)  # Crear un texto en la zona visible.
                    wait_for(lambda: len(json.loads(state()["pages"][0][2])) == 1)
                    type_ascii('mis ideas\nsegunda linea')
                    wait_for(lambda: json.loads(state()["pages"][0][2])[0]['text'] == 'mis ideas\nsegunda linea')
                    # Mover con teclado y después cambiar el tamaño.
                    modified_key(0xFF09)
                    modified_key(0xFF09)
                    modified_key(0xFF53)  # Shift+Right: 24 px.
                    modified_key(0xFF54)  # Shift+Down: 24 px.
                    for _ in range(3):
                        key(0xFF09)
                        time.sleep(0.1)
                    modified_key(0xFF53)
                    modified_key(0xFF54)
                    wait_for(lambda: all(json.loads(state()["pages"][0][2])[0][name] == value
                        for name,value in [('x',48),('y',48),('width',264),('height',184)]))
                    # Conservar también el texto de la etapa anterior junto al post-it.
                    modified_key(0xFF09)
                    modified_key(0xFF57, modifier=0xFFE3)  # Ctrl+End: ubicar el cursor al final.
                    key(ord('x'))
                    final_text = 'mis ideas\nsegunda lineax'
                    wait_for(lambda: json.loads(state()['pages'][0][2])[0]['text'] == final_text)
                    click_tool(native, 228)  # Post-it.
                    time.sleep(0.2)
                    key(0xFF0D)  # Crear la nota con Enter en la hoja enfocada.
                    wait_for(lambda: len(json.loads(state()['pages'][0][2])) == 2)
                    type_ascii('recordatorios\nregar plantas')
                    wait_for(lambda: json.loads(state()['pages'][0][2])[1]['text'] == 'recordatorios\nregar plantas')
                    key(0xFF09)  # Campo -> selector de color.
                    key(0xFF54)  # ArrowDown: amarillo -> rosa.
                    wait_for(lambda: json.loads(state()['pages'][0][2])[1]['color'] == 'pink')
                    for _ in range(3):
                        modified_key(0xFF09)  # Selector -> campo -> eliminar -> mover.
                        time.sleep(0.1)
                    for _ in range(13):
                        modified_key(0xFF53)
                        time.sleep(0.05)
                    modified_key(0xFF54)
                    for _ in range(4):
                        key(0xFF09)  # Mover -> eliminar -> campo -> color -> tamaño.
                        time.sleep(0.1)
                    modified_key(0xFF53)
                    modified_key(0xFF54)
                    wait_for(lambda: all(json.loads(state()['pages'][0][2])[1][name] == value
                        for name,value in [('x',336),('y',48),('width',264),('height',264)]))
                    # Volver al texto de la nota antes de elegir un sellito.
                    modified_key(0xFF09)
                    time.sleep(0.1)
                    modified_key(0xFF09)
                    time.sleep(0.1)
                    modified_key(0xFF57, modifier=0xFFE3)
                    key(ord('x'))
                    final_note = 'recordatorios\nregar plantasx'
                    wait_for(lambda: json.loads(state()['pages'][0][2])[1]['text'] == final_note)
                    click_tool(native, 281)  # Sellitos; abre el catálogo y enfoca la hoja.
                    time.sleep(0.2)
                    for _ in range(6):
                        # Hoja -> área de trabajo -> cuatro herramientas creativas -> Luna.
                        modified_key(0xFF09)
                        time.sleep(0.1)
                    screenshot(native, 'stage7-native-picker-focus.png')
                    key(0xFF0D)  # Elegir Luna y volver a la hoja.
                    key(0xFF0D)  # Colocar el dibujo con teclado.
                    wait_for(lambda: len(json.loads(state()['pages'][0][2])) == 3)
                    screenshot(native, 'stage7-native-stamp-choice.png')
                    assert json.loads(state()['pages'][0][2])[2]['stamp'] == 'moon', json.loads(state()['pages'][0][2])[2]
                    # El sellito comienza con Mover enfocado y no contiene un campo de texto.
                    for _ in range(24):
                        modified_key(0xFF53)
                        time.sleep(0.05)
                    modified_key(0xFF54)
                    for _ in range(2):
                        key(0xFF09)  # Mover -> eliminar -> tamaño.
                        time.sleep(0.1)
                    modified_key(0xFF53)
                    wait_for(lambda: all(json.loads(state()['pages'][0][2])[2][name] == value
                        for name,value in [('x',600),('y',48),('width',184),('height',184)]))
                    modified_key(ord('z'), modifier=0xFFE3)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[2]['width'] == 160)
                    modified_key(ord('y'), modifier=0xFFE3)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[2]['width'] == 184)
                    # Confirmar una última escala antes de agregar el calendario.
                    modified_key(0xFF54)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[2]['width'] == 208)
                    click_tool(native, 334)  # Calendario; el selector de mes recibe el foco.
                    time.sleep(0.2)
                    key(0xFF50)  # Home: Enero.
                    key(0xFF54)  # Febrero.
                    key(0xFF09)  # Año.
                    modified_key(ord('a'), modifier=0xFFE3)
                    type_ascii('2024')
                    key(0xFF09)  # Colocar calendario.
                    key(0xFF0D)  # Confirmar mes/año y enfocar la hoja.
                    key(0xFF0D)  # Colocar con teclado.
                    wait_for(lambda: len(json.loads(state()['pages'][0][2])) == 4)
                    assert json.loads(state()['pages'][0][2])[3]['year'] == 2024
                    assert json.loads(state()['pages'][0][2])[3]['month'] == 2
                    # Mover el calendario debajo de los elementos anteriores.
                    modified_key(0xFF53)
                    for _ in range(16):
                        modified_key(0xFF54)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[3]['y'] == 408)
                    for _ in range(3):
                        key(0xFF09)  # Mover -> eliminar -> mes -> año.
                    modified_key(ord('a'), modifier=0xFFE3)
                    type_ascii('2100')
                    key(0xFF09)  # Salir del año confirma el período; tamaño recibe el foco.
                    wait_for(lambda: json.loads(state()['pages'][0][2])[3]['year'] == 2100)
                    modified_key(ord('z'), modifier=0xFFE3)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[3]['year'] == 2024)
                    modified_key(ord('y'), modifier=0xFFE3)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[3]['year'] == 2100)
                    modified_key(0xFF53)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[3]['width'] == 384)
                    # Confirmar la geometría antes de probar las herramientas creativas.
                    modified_key(0xFF54)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[3]['height'] == 364)

                    # Selección con teclado y formato aplicado desde la barra lateral real.
                    print('Elementos anteriores, geometría e historial: aprobados', flush=True)
                    scroll_top(native, 900)  # Tab al tamaño del calendario desplazó la hoja.
                    click(native, 400, 265)
                    modified_key(0xFF50, modifier=0xFFE3)  # Ctrl+Home.
                    for _ in range(9):
                        modified_key(0xFF53)
                    click_tool(native, 597)  # Subrayado.
                    wait_for(lambda: len(json.loads(state()['pages'][0][2])[0].get('marks', [])) == 1)
                    click_tool(native, 645)  # Remarcado sobre la misma selección.
                    wait_for(lambda: len(json.loads(state()['pages'][0][2])[0].get('marks', [])) == 2)
                    click(native, 100, 737)  # Pasar directamente al selector conserva la frase.
                    key(0xFF57)  # End: elegir el nuevo Violeta.
                    key(0xFF0D)
                    wait_for(lambda: json.loads(state()['pages'][0][2])[0]['marks'][1].get('color') == 'violet')
                    click(native, 1000, 480)  # Salir del texto haciendo clic en la hoja libre.
                    click(native, 100, 737)
                    key(0xFF50)  # Amarillo para futuras marcas.
                    key(0xFF0D)
                    time.sleep(0.5)
                    assert json.loads(state()['pages'][0][2])[0]['marks'][1]['color'] == 'violet'
                    key(0xFF57)  # Volver a Violeta, sin recuperar la selección anterior.
                    click(native, 400, 300)  # El aviso de formato desplaza el campo hacia abajo.
                    for _ in range(14):
                        key(0xFF09)  # Recorrer los elementos hasta el primer día del calendario.
                    key(0xFF0D)  # Remarcar el día con teclado.
                    wait_for(lambda: json.loads(state()['pages'][0][2])[3].get('dayHighlights') == [
                        {'year':2100,'month':2,'day':1,'color':'violet'}])
                    click(native, 1000, 480)
                    scroll_top(native, 100)
                    click(native, 100, 737)
                    key(0xFF50)
                    key(0xFF0D)
                    time.sleep(0.5)
                    assert json.loads(state()['pages'][0][2])[3]['dayHighlights'] == [
                        {'year':2100,'month':2,'day':1,'color':'violet'}]
                    click_tool(native, 500)  # Washi tape.
                    click(native, 100, 737)  # Color de la próxima cinta.
                    key(0xFF57)
                    key(0xFF0D)
                    for _ in range(3):
                        key(0xFF09)  # Color -> diseño -> área de trabajo -> hoja.
                    key(0xFF0D)
                    wait_for(lambda: len(json.loads(state()['pages'][0][2])) == 5)
                    assert json.loads(state()['pages'][0][2])[4]['color'] == 'violet'
                    scroll_top(native,900)
                    click_tool(native, 549)  # Abrir el panel de dibujo con teclado.
                    key(0xFF0D)
                    drawing_stroke(native,[(400,305),(510,350),(640,305)])
                    drawing_stroke(native,[(400,390),(510,435),(640,390)])
                    assert len(json.loads(state()['pages'][0][2])) == 5
                    screenshot(native,'drawing-panel-native.png')
                    click(native,650,488)  # Tilde verde: confirmar ambos trazos como un dibujo.
                    wait_for(lambda: len(json.loads(state()['pages'][0][2])) == 6)
                    assert len(json.loads(state()['pages'][0][2])[5]['strokes']) == 2

                    click(native, geometry(native)[2] - 210, geometry(native)[3] - 36)
                    accept_name('Mi semana')
                    wait_for(lambda: state()['pages'][0][1] == 'Mi semana')
                    click(native, geometry(native)[2] - 140, geometry(native)[3] - 36)
                    key(0xFF1B)  # Cancelar eliminación.
                    assert len(state()['pages']) == 3
                    click(native, geometry(native)[2] - 140, geometry(native)[3] - 36)
                    key(0xFF09)  # Cancelar -> Eliminar página.
                    key(0xFF0D)
                    wait_for(lambda: len(state()['pages']) == 2)
                    modified_key(ord('z'), modifier=0xFFE3)
                    wait_for(lambda: len(state()['pages']) == 3)
                    assert len(json.loads(state()['pages'][0][2])) == 6
                    print('Formato, decoraciones y administración de páginas: aprobados', flush=True)

                    # Diálogos GTK reales: cancelar, guardar, crear otro journal y abrir.
                    modified_key(ord('s'), modifier=0xFFE3)
                    native_dialog('Guardar bullet journal')
                    key(0xFF1B)
                    time.sleep(0.3)
                    assert file_path() is None
                    first_file = Path(temporary) / 'ideas-native.suki'
                    modified_key(ord('s'), modifier=0xFFE3)
                    enter_file_path('Guardar bullet journal', first_file)
                    wait_for(lambda: file_path() == str(first_file))
                    first_bytes = first_file.read_bytes()
                    exported = json.loads(first_bytes)['journal']
                    assert len(exported['pages']) == 3
                    assert len(exported['pages'][0]['elements']) == 6
                    assert len(exported['pages'][0]['elements'][0]['marks']) == 2
                    assert exported['pages'][0]['elements'][0]['marks'][1]['color'] == 'violet'
                    assert exported['pages'][0]['elements'][3]['dayHighlights'] == [{'year':2100,'month':2,'day':1,'color':'violet'}]
                    assert exported['pages'][0]['elements'][4]['color'] == 'violet'
                    assert len(exported['pages'][0]['elements'][5]['strokes']) == 2
                    modified_key(ord('n'), modifier=0xFFE3)
                    accept_name('Viajes')
                    wait_for(lambda: state()['journal'][0] == 'Viajes')
                    assert len(state()['pages']) == 1 and json.loads(state()['pages'][0][2]) == []
                    second_file = Path(temporary) / 'viajes-native.suki'
                    modified_key(ord('s'), modifier=0xFFE3)
                    enter_file_path('Guardar bullet journal', second_file)
                    wait_for(lambda: file_path() == str(second_file))
                    assert json.loads(second_file.read_bytes())['journal']['title'] == 'Viajes'
                    assert first_file.read_bytes() == first_bytes
                    modified_key(ord('o'), modifier=0xFFE3)
                    enter_file_path('Abrir bullet journal', first_file)
                    wait_for(lambda: file_path() == str(first_file))
                    assert state()['pages'][0][1] == 'Mi semana'
                    assert json.loads(state()['pages'][0][2]) == exported['pages'][0]['elements']
                    print('Diálogos de archivo y journals independientes: aprobados', flush=True)
                    screenshot(native, 'stage7-native-features.png')
                    # Cierre con un cambio nuevo todavía pendiente de autoguardado.
                    click(native, geometry(native)[2] - 210, geometry(native)[3] - 36)
                    accept_name('Semana recuperada')
                    expected = None
                else:
                    assert state() == expected, "La reapertura no conservó el texto ni su geometría"
                screenshot(native, f"stage7-native-{run}.png")
                # Alt+F4 pide el cierre normal y ejercita el guardado previo a destroy.
                alt = x11.XKeysymToKeycode(display, 0xFFE9)
                xtest.XTestFakeKeyEvent(display, alt, 1, 0)
                key(0xFFC1)
                xtest.XTestFakeKeyEvent(display, alt, 0, 0)
                x11.XFlush(display)
                wait_for(lambda: process.poll() is not None)
                assert process.returncode == 0, process.returncode
                if run == 1:
                    expected = state()
                    element = json.loads(expected['pages'][0][2])[0]
                    assert element['text'] == final_text, element
                    assert (element['x'],element['y'],element['width'],element['height']) == (48,48,264,184)
                    note = json.loads(expected['pages'][0][2])[1]
                    assert note['text'] == final_note and note['color'] == 'pink', note
                    assert (note['x'],note['y'],note['width'],note['height']) == (336,48,264,264)
                    stamp = json.loads(expected['pages'][0][2])[2]
                    assert stamp['stamp'] == 'moon', stamp
                    assert (stamp['x'],stamp['y'],stamp['width'],stamp['height']) == (600,48,208,208)
                    calendar = json.loads(expected['pages'][0][2])[3]
                    assert (calendar['year'], calendar['month']) == (2100, 2), calendar
                    assert (calendar['x'],calendar['y'],calendar['width'],calendar['height']) == (48,408,384,364), calendar
                    assert expected['pages'][0][1] == 'Semana recuperada'
                    assert element['marks'] == [{'kind':'underline','start':0,'end':9}, {'kind':'highlight','start':0,'end':9,'color':'violet'}], element
                    assert calendar['dayHighlights'] == [{'year':2100,'month':2,'day':1,'color':'violet'}], calendar
                    assert json.loads(expected['pages'][0][2])[4]['type'] == 'washi'
                    assert json.loads(expected['pages'][0][2])[4]['color'] == 'violet'
                    assert json.loads(expected['pages'][0][2])[5]['type'] == 'drawing'
                    assert len(json.loads(expected['pages'][0][2])[5]['strokes']) == 2
                    assert file_path() == str(first_file)
                else:
                    assert state() == expected
                reports.append({"nativeRun": run, "checks": "passed", "pages": len(expected["pages"]),
                                "activePage": expected["journal"][1], "revision": expected["journal"][2],
                                "elements": json.loads(expected["pages"][0][2])})
            except Exception:
                if process.poll() is None and window_id:
                    screenshot(native, 'stage7-native-failure.png')
                    screenshot(Gdk.get_default_root_window(), 'stage7-native-failure-screen.png')
                raise
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
    (OUT / "stage7-native-results.json").write_text(json.dumps(reports, indent=2))
    print(json.dumps(reports, ensure_ascii=False))
