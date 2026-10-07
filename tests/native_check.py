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
    xtest.XTestFakeButtonEvent(display, 1, 1, 0)
    xtest.XTestFakeButtonEvent(display, 1, 0, 0)
    x11.XFlush(display)


def key(keysym):
    code = x11.XKeysymToKeycode(display, keysym)
    xtest.XTestFakeKeyEvent(display, code, 1, 0)
    xtest.XTestFakeKeyEvent(display, code, 0, 0)
    x11.XFlush(display)


def modified_key(keysym, modifier=0xFFE1):
    code = x11.XKeysymToKeycode(display, modifier)
    xtest.XTestFakeKeyEvent(display, code, 1, 0)
    key(keysym)
    xtest.XTestFakeKeyEvent(display, code, 0, 0)
    x11.XFlush(display)


def type_ascii(value):
    for character in value:
        key(0xFF0D if character == '\n' else ord(character))
        time.sleep(0.02)


def screenshot(native, name):
    _, _, width, height = geometry(native)
    pixbuf = Gdk.pixbuf_get_from_window(native, 0, 0, width, height)
    assert pixbuf is not None
    pixbuf.savev(str(OUT / name), "png", [], [])


with tempfile.TemporaryDirectory(prefix="suki-stage4-", dir=OUT) as temporary:
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

    reports = []
    for run in (1, 2):
        log_path = OUT / f"stage4-native-{run}.log"
        with log_path.open("w") as log:
            process = subprocess.Popen([str(ROOT / "src-tauri/target/release/sukijournal")],
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
                    screenshot(native, "stage4-native-initial.png")
                    click(native, 364, geometry(native)[3] - 36)
                    wait_for(lambda: len(state()["pages"]) == 2)
                    key(0xFF0D)  # Enter: el botón + conserva su foco.
                    wait_for(lambda: len(state()["pages"]) == 3)
                    click(native, 276, geometry(native)[3] - 36)  # Página 1.
                    wait_for(lambda: state()["journal"][1] == "page-1")
                    # Desde Página 1: retroceder a la hoja, al área de trabajo y a Texto.
                    for _ in range(3):
                        modified_key(0xFF09)  # Shift+Tab.
                        time.sleep(0.1)
                    key(0xFF0D)  # Activar Texto y enfocar la hoja.
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
                    click(native, 100, 228)  # Post-it en la barra lateral.
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
                    # Cerrar durante el guardado diferido de la última letra del post-it.
                    modified_key(0xFF09)
                    modified_key(0xFF09)
                    modified_key(0xFF57, modifier=0xFFE3)
                    key(ord('x'))
                    final_note = 'recordatorios\nregar plantasx'
                    expected = None
                else:
                    assert state() == expected, "La reapertura no conservó el texto ni su geometría"
                screenshot(native, f"stage4-native-{run}.png")
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
                else:
                    assert state() == expected
                reports.append({"nativeRun": run, "checks": "passed", "pages": len(expected["pages"]),
                                "activePage": expected["journal"][1], "revision": expected["journal"][2],
                                "elements": json.loads(expected["pages"][0][2])})
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
    (OUT / "stage4-native-results.json").write_text(json.dumps(reports, indent=2))
    print(json.dumps(reports, ensure_ascii=False))
