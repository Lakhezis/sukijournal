"""Comprobación de la interfaz en WebKitGTK; la persistencia es una simulación de prueba."""
import ctypes
import functools
import http.server
import json
from pathlib import Path
import threading
import time

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('GdkX11', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gdk, GdkX11, Gtk, WebKit2

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification'
OUT.mkdir(exist_ok=True)
CONFIG = json.loads((ROOT / 'src-tauri/tauri.conf.json').read_text())


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy', CONFIG['app']['security']['csp'])
        super().end_headers()

    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'frontend')))
threading.Thread(target=server.serve_forever, daemon=True).start()
MOCK = """
window.__TAURI__ = {
  core: { invoke: async (command, args) => {
    if (command === 'load_journal') {
      if (localStorage.getItem('failLoad')) throw new Error('No se pudo leer el journal de prueba');
      const stored = localStorage.getItem('testJournal');
      return stored ? JSON.parse(stored) : {schemaVersion:1, revision:0,
        title:'Mi Bullet Journal', activePageId:'first',
        pages:[{id:'first',title:'Página 1',elements:[]}]};
    }
    if (command === 'save_journal') {
      await new Promise(resolve => setTimeout(resolve, 250));
      if (window.failSave) throw new Error('Disco no disponible');
      const saved = {...args.journal, revision:args.journal.revision + 1};
      localStorage.setItem('testJournal', JSON.stringify(saved));
      return saved.revision;
    }
    throw new Error('Comando inesperado: ' + command);
  }},
  window: { getCurrentWindow: () => ({
    onCloseRequested: async callback => { window.testCloseHandler = callback; return () => {}; },
    destroy: async () => { window.testDestroyed = true; }
  }) }
};
"""
window = Gtk.Window(title='Suki Journal — comprobación')
window.set_decorated(False)
window.set_default_size(1280, 900)
manager = WebKit2.UserContentManager()
manager.register_script_message_handler('check')
errors = []
manager.connect('script-message-received::check',
                lambda _manager, result: errors.append(result.get_js_value().to_string()))
manager.add_script(WebKit2.UserScript.new(MOCK, WebKit2.UserContentInjectedFrames.TOP_FRAME, WebKit2.UserScriptInjectionTime.START, None, None))
manager.add_script(WebKit2.UserScript.new('''
window.pointerTrace=[];
for (const type of ['pointerdown','pointermove','pointerup']) {
  document.addEventListener(type,event=>window.pointerTrace.push({type,x:event.clientX,y:event.clientY,
    target:event.target.className,trusted:event.isTrusted,
    sx:document.querySelector('#workspace').scrollLeft,sy:document.querySelector('#workspace').scrollTop}),true);
}
addEventListener('error', event => window.webkit.messageHandlers.check.postMessage(
  event.message || 'Error de recurso: ' + (event.target.src || event.target.href)), true);
addEventListener('securitypolicyviolation', event => window.webkit.messageHandlers.check.postMessage('CSP: ' + event.violatedDirective));
addEventListener('unhandledrejection', event =>
  window.webkit.messageHandlers.check.postMessage(String(event.reason)));
''', WebKit2.UserContentInjectedFrames.TOP_FRAME, WebKit2.UserScriptInjectionTime.START,
    None, None))
view = WebKit2.WebView.new_with_user_content_manager(manager)
window.add(view)
window.show_all()


def wait_for(predicate, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        while Gtk.events_pending():
            Gtk.main_iteration_do(False)
        if predicate():
            return
        time.sleep(0.02)
    raise TimeoutError('Se agotó el tiempo de espera')


def js(source):
    outcome = []
    def done(widget, task, _data):
        try:
            outcome.append((True, widget.evaluate_javascript_finish(task).to_string()))
        except Exception as error:
            outcome.append((False, str(error)))
    view.evaluate_javascript(source, -1, None, None, None, done, None)
    wait_for(lambda: outcome)
    if not outcome[0][0]:
        raise RuntimeError(outcome[0][1])
    return outcome[0][1]


def snapshot(name):
    outcome = []
    def done(widget, task, _data):
        try:
            widget.get_snapshot_finish(task).write_to_png(str(OUT / name))
            outcome.append(True)
        except Exception as error:
            outcome.append(error)
    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE,
                      None, done, None)
    wait_for(lambda: outcome)
    if outcome[0] is not True:
        raise outcome[0]


def measure():
    return json.loads(js('''JSON.stringify((() => {
      const workspace = document.querySelector('#workspace');
      const page = document.querySelector('#journal-page');
      const rect = el => { const r = el.getBoundingClientRect();
        return {x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom}; };
      return {
        status: document.querySelector('#app-status').textContent,
        title: document.querySelector('h1').textContent,
        buttons: [...document.querySelectorAll('button')].map(b => b.disabled),
        tools: document.querySelectorAll('.tool-button').length,
        pageChildren: page.children.length,
        paper: rect(page),
        topbar: rect(document.querySelector('.topbar')),
        pagebar: rect(document.querySelector('.pagebar')),
        viewport: {width:innerWidth, height:innerHeight},
        scroll: {width:workspace.scrollWidth, height:workspace.scrollHeight,
          clientWidth:workspace.clientWidth, clientHeight:workspace.clientHeight,
          top:workspace.scrollTop, left:workspace.scrollLeft},
        dots: getComputedStyle(page).backgroundImage,
        font: document.fonts.check('16px Nunito'),
        images: [...document.images].every(i => i.complete && i.naturalWidth > 0),
        styles: document.styleSheets.length
      };
    })())'''))



# Eventos de ratón reales: ejercitan la captura de puntero de WebKit.
x11 = ctypes.CDLL('libX11.so.6')
xtest = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
xtest.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
xtest.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xdisplay = x11.XOpenDisplay(None)
assert xdisplay


def pause(seconds=0.1):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        while Gtk.events_pending():
            Gtk.main_iteration_do(False)
        time.sleep(0.01)


def drag(selector, dx, dy, cancel=False, scroll=None):
    x11.XRaiseWindow(xdisplay, window.get_window().get_xid())
    x11.XSetInputFocus(xdisplay, window.get_window().get_xid(), 1, 0)
    x11.XFlush(xdisplay)
    pause()
    # El gestor de ventanas puede limitar la altura inicial a la de la pantalla.
    # Llevar el control a la zona visible evita enviar el arrastre sobre el pie.
    js("document.querySelector(" + json.dumps(selector) + ").scrollIntoView({block:'center',inline:'nearest'}); 'ok'")
    pause()
    point = json.loads(js("JSON.stringify((() => { const r = document.querySelector(" + json.dumps(selector) + ").getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })())"))
    root_x, root_y = window.get_window().get_origin()[-2:]
    offset_x, offset_y = view.translate_coordinates(window, 0, 0)[-2:]
    root_x += offset_x
    root_y += offset_y
    x, y = round(root_x + point[0]), round(root_y + point[1])
    xtest.XTestFakeMotionEvent(xdisplay, -1, x, y, 0)
    x11.XFlush(xdisplay)
    pause()
    xtest.XTestFakeButtonEvent(xdisplay, 1, 1, 0)
    x11.XFlush(xdisplay)
    pause()
    if scroll:
        js("document.querySelector('#workspace').scrollBy(" + str(scroll[0]) + "," + str(scroll[1]) + "); 'ok'")
        pause()
    xtest.XTestFakeMotionEvent(xdisplay, -1, x + dx, y + dy, 0)
    x11.XFlush(xdisplay)
    pause()
    if cancel:
        js("document.querySelector('#journal-page').dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true})); 'ok'")
    # Fijar el destino junto a pointerup evita movimientos ajenos entre ambos eventos.
    xtest.XTestFakeMotionEvent(xdisplay, -1, x + dx, y + dy, 0)
    xtest.XTestFakeButtonEvent(xdisplay, 1, 0, 0)
    x11.XFlush(xdisplay)
    pause()


def saved():
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')


def text_value():
    return js("document.querySelector('.text-input').value")


def text_geometry():
    return json.loads(js("JSON.stringify(JSON.parse(localStorage.getItem('testJournal')).pages.find(p=>p.id===document.querySelector('[aria-current=page]').dataset.pageId).elements.find(e=>e.type==='text'))"))


def type_text(value, selector=".text-input"):
    js("(() => { const field = document.querySelector(" + json.dumps(selector) + "); field.focus(); field.value = " + json.dumps(value) + "; field.setSelectionRange(3,3); field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'})); })(); 'ok'")


def postit_geometry():
    return json.loads(js("JSON.stringify(JSON.parse(localStorage.getItem('testJournal')).pages.find(p=>p.id===document.querySelector('[aria-current=page]').dataset.pageId).elements.find(e=>e.type==='postit'))"))


def set_color(color):
    js("(() => {const select=document.querySelector('.postit-color'); select.focus(); select.value=" + json.dumps(color) + "; select.dispatchEvent(new Event('change',{bubbles:true}));})(); 'ok'")


def stamp_geometry():
    return json.loads(js("JSON.stringify(JSON.parse(localStorage.getItem('testJournal')).pages.find(p=>p.id===document.querySelector('[aria-current=page]').dataset.pageId).elements.find(e=>e.type==='stamp'))"))


def place_stamp(stamp, x, y):
    js("document.querySelector('#tool-stamp').click(); document.querySelector('[data-stamp=" + stamp + "]').click(); (()=>{const p=document.querySelector('#journal-page'),r=p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+" + str(x + 1) + ",clientY:r.top+" + str(y + 1) + "}));})(); 'ok'")

reports = []
try:
    loaded = []
    view.connect('load-changed', lambda _view, event:
        loaded.append(True) if event == WebKit2.LoadEvent.FINISHED else None)
    view.load_uri('http://127.0.0.1:%s/' % server.server_port)
    wait_for(lambda: loaded)
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')
    js("localStorage.clear(); 'ok'")
    assert js("String(document.querySelectorAll('.tool-button:disabled').length)") == '5'
    assert js("String(document.querySelector('#add-page').disabled)") == 'false'
    assert js("String(document.querySelector('#journal-page').hidden)") == 'false'
    assert js("String(document.querySelectorAll('#page-tabs button').length)") == '1'
    js("document.querySelector('#add-page').click(); 'ok'")
    assert js("document.querySelector('#app-status').textContent") == 'Guardando…'
    js("document.querySelector('#add-page').click(); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')
    assert js("document.querySelector('#page-count').textContent") == '3 páginas'
    assert js("document.querySelector('#current-page-title').textContent") == 'Página 3'
    js("document.querySelector('#page-tabs button').focus(); document.activeElement.click(); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')
    assert js("document.activeElement.textContent") == 'Página 1'
    active = js("document.querySelector('[aria-current=page]').dataset.pageId")
    loaded.clear()
    view.reload()
    wait_for(lambda: loaded)
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')
    assert js("document.querySelector('#page-count').textContent") == '3 páginas'
    assert js("document.querySelector('[aria-current=page]').dataset.pageId") == active
    reports.append({'check':'create, navigate, persist and reload', 'result':'passed'})

    # Crear con coordenadas de la hoja; editar sin perder el foco ni la selección.
    js("document.querySelector('#tool-text').click(); (()=>{const p=document.querySelector('#journal-page'), r=p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+101,clientY:r.top+81}));})(); 'ok'")
    assert js("String(document.activeElement.classList.contains('text-input'))") == 'true'
    assert js("String(document.querySelectorAll('.text-element').length)") == '1'
    literal = '<img src=x onerror=alert(1)>\nIdeas 🌱'
    type_text(literal)
    assert js("String(document.querySelector('.text-input').selectionStart)") == '3'
    saved()
    assert text_value() == literal
    assert js("String(document.querySelector('#journal-page img') === null)") == 'true'
    assert js("String(document.querySelector('.text-input').selectionStart)") == '3'
    assert (text_geometry()['x'], text_geometry()['y']) == (100,80)

    # Agrupación de escritura y revisiones correctas al deshacer/rehacer.
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert text_value() == ''
    js("document.querySelector('#redo').click(); 'ok'")
    saved()
    assert text_value() == literal
    js("document.querySelector('.text-move').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true})); 'ok'")
    saved()
    assert text_geometry()['x'] == 124
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert text_geometry()['x'] == 100
    js("document.querySelector('#redo').click(); 'ok'")
    saved()
    assert text_geometry()['x'] == 124

    # Arrastre real, redimensionado y cancelación con Escape.
    js("window.pointerTrace=[]; 'ok'")
    drag('.text-move', 60, 40)
    assert js('String(window.pointerTrace.every(event=>event.trusted))') == 'true'
    saved()
    assert (text_geometry()['x'],text_geometry()['y']) == (184,120), (text_geometry(),js('JSON.stringify(window.pointerTrace)'))
    drag('.text-resize', 40, 20)
    saved()
    assert (text_geometry()['width'],text_geometry()['height']) == (280,180), text_geometry()
    original_geometry = text_geometry()
    drag('.text-move', 40, 20, cancel=True)
    assert text_geometry() == original_geometry
    assert js("document.querySelector('.text-element').style.left") == '184px'
    js("document.querySelector('.text-resize').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true})); 'ok'")
    saved()
    assert text_geometry()['height'] == 204

    # Cada página conserva su contenido; eliminar se puede deshacer.
    js("document.querySelectorAll('#page-tabs button')[1].click(); 'ok'")
    saved()
    assert js("String(document.querySelectorAll('.text-element').length)") == '0'
    js("document.querySelector('#page-tabs button').click(); 'ok'")
    saved()
    assert text_value() == literal
    js("document.querySelector('.text-input').focus(); document.querySelector('.text-remove').click(); 'ok'")
    saved()
    assert js("String(document.querySelectorAll('.text-element').length)") == '0'
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert text_value() == literal
    js("document.querySelector('#redo').click(); 'ok'")
    saved()
    assert js("String(document.querySelectorAll('.text-element').length)") == '0'
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    loaded.clear()
    view.reload()
    wait_for(lambda: loaded)
    saved()
    assert text_value() == literal
    assert js("String(document.querySelector('#undo').disabled)") == 'true'
    reports.append({'check':'text edit, keyboard, real drag, resize, cancel, delete, history and reload', 'result':'passed'})

    # No perder el texto pendiente ante un error de guardado.
    js("window.failSave = true; 'ok'")
    type_text('Ideas pendientes')
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Sin guardar')
    assert text_value() == 'Ideas pendientes'
    assert js("String(document.querySelector('.text-input').readOnly)") == 'true'
    assert js("String(document.querySelector('#undo').disabled)") == 'true'
    js("window.failSave = false; document.querySelector('#retry-storage').click(); 'ok'")
    saved()
    assert text_geometry()['text'] == 'Ideas pendientes'
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert text_value() == literal
    reports.append({'check':'text error retains pending content and undo history', 'result':'passed'})

    # Herramientas excluyentes y cancelación sin crear una nota accidental.
    js("document.querySelector('#tool-text').click(); document.querySelector('#tool-postit').click(); 'ok'")
    assert js("document.querySelector('#tool-text').getAttribute('aria-pressed')") == 'false'
    assert js("document.querySelector('#tool-postit').getAttribute('aria-pressed')") == 'true'
    js("document.querySelector('#journal-page').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 'ok'")
    assert js("document.querySelector('#tool-postit').getAttribute('aria-pressed')") == 'false'
    assert js("String(document.querySelectorAll('.postit-element').length)") == '0'

    # Nota junto al texto: contenido literal, cuatro colores, foco e historial.
    js("document.querySelector('#tool-postit').click(); (()=>{const p=document.querySelector('#journal-page'),r=p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+451,clientY:r.top+81}));})(); 'ok'")
    assert js("String(document.activeElement.closest('.postit-element') !== null)") == 'true'
    note_text = 'Recordar 🌱\n<script>literal</script>'
    type_text(note_text, '.postit-element .text-input')
    saved()
    assert postit_geometry()['text'] == note_text
    assert (postit_geometry()['x'],postit_geometry()['y']) == (450,80)
    assert text_value() == literal
    assert js("String(document.querySelector('#unknown-elements').hidden)") == 'true'
    backgrounds = set()
    for color in ['yellow','pink','sage','lilac']:
        set_color(color)
        saved()
        assert postit_geometry()['color'] == color
        assert js("String(document.activeElement.classList.contains('postit-color'))") == 'true'
        backgrounds.add(js("getComputedStyle(document.querySelector('.postit-element')).backgroundColor"))
    assert len(backgrounds) == 4
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert postit_geometry()['color'] == 'sage'
    js("document.querySelector('#redo').click(); 'ok'")
    saved()
    assert postit_geometry()['color'] == 'lilac'
    # Confirmar un borrador antes del color no debe reemplazar el color elegido.
    js("document.querySelector('.postit-element .text-input').value += '!'; 'ok'")
    set_color('pink')
    saved()
    assert postit_geometry()['text'] == note_text + '!'
    assert postit_geometry()['color'] == 'pink'
    js("document.querySelector('.postit-color').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true})); 'ok'")
    assert js("String(document.querySelectorAll('.postit-element').length)") == '1'
    reports.append({'check':'post-it placement, literal text, four colors, focus and color history', 'result':'passed'})

    drag('.postit-element .text-move', -40, 40)
    saved()
    assert (postit_geometry()['x'],postit_geometry()['y']) == (410,120), (postit_geometry(), js('JSON.stringify(window.pointerTrace)'))
    drag('.postit-element .text-resize', 24, 24)
    saved()
    assert (postit_geometry()['width'],postit_geometry()['height']) == (264,264)
    original_note = postit_geometry()
    drag('.postit-element .text-move', 40, 20, cancel=True)
    assert postit_geometry() == original_note
    js("document.querySelector('.postit-element .text-move').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true})); 'ok'")
    saved()
    assert postit_geometry()['x'] == 434
    js("document.querySelector('.postit-element .text-resize').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true})); 'ok'")
    saved()
    assert postit_geometry()['height'] == 288
    original_note = postit_geometry()
    js("document.querySelector('.postit-element .text-move').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true})); 'ok'")
    saved()
    assert js("String(document.querySelectorAll('.postit-element').length)") == '0'
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert postit_geometry() == original_note
    assert text_value() == literal
    js("document.querySelectorAll('#page-tabs button')[1].click(); 'ok'")
    saved()
    assert js("String(document.querySelectorAll('.postit-element').length)") == '0'
    js("document.querySelector('#page-tabs button').click(); 'ok'")
    saved()
    assert postit_geometry() == original_note
    # Los tipos futuros siguen conservándose y se avisa al mostrarlos.
    js("(()=>{const journal=JSON.parse(localStorage.getItem('testJournal'));journal.pages[0].elements.push({type:'future',id:'future-1',data:{keep:true}});localStorage.setItem('testJournal',JSON.stringify(journal));})(); 'ok'")
    loaded.clear()
    view.reload()
    wait_for(lambda: loaded)
    saved()
    assert postit_geometry() == original_note
    assert text_value() == literal
    assert js("String(document.querySelector('#unknown-elements').hidden)") == 'false'
    reports.append({'check':'post-it real drag, resize, keyboard, cancel, deletion, navigation and reload', 'result':'passed'})

    js("window.failSave = true; 'ok'")
    set_color('sage')
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Sin guardar')
    assert js("document.querySelector('.postit-element').dataset.color") == 'sage'
    assert js("String(document.querySelector('.postit-color').disabled)") == 'true'
    assert js("String(document.querySelector('#tool-postit').disabled)") == 'true'
    js("window.failSave=false; document.querySelector('#retry-storage').click(); 'ok'")
    saved()
    assert postit_geometry()['color'] == 'sage'
    assert js("String(JSON.parse(localStorage.getItem('testJournal')).pages[0].elements.find(e=>e.type==='future').data.keep)") == 'true'
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert postit_geometry() == original_note
    reports.append({'check':'failed post-it save retains color, retries and preserves unknown types', 'result':'passed'})

    # Catálogo local completo y cancelación con teclado desde el selector.
    js("document.querySelector('#tool-stamp').click(); 'ok'")
    assert js("String(document.querySelector('#stamp-picker').hidden)") == 'false'
    assert js("document.querySelector('#tool-stamp').getAttribute('aria-expanded')") == 'true'
    assert js("String(document.querySelectorAll('.stamp-choice').length)") == '6'
    assert js("String([...document.querySelectorAll('.stamp-choice img')].every(image=>image.complete && image.naturalWidth>0))") == 'true'
    js("document.querySelector('.stamp-choice').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 'ok'")
    assert js("String(document.querySelector('#stamp-picker').hidden)") == 'true'
    assert js("document.activeElement.id") == 'tool-stamp'
    assert js("String(document.querySelectorAll('.stamp-element').length)") == '0'
    for stamp in ['flower','leaf','star','heart','rainbow','moon']:
        place_stamp(stamp, 450, 440)
        saved()
        wait_for(lambda: js("String(document.querySelector('.stamp-artwork').complete)") == 'true')
        assert stamp_geometry()['stamp'] == stamp
        assert js("String(document.querySelector('.stamp-artwork').naturalWidth > 0)") == 'true'
        assert js("document.querySelector('.stamp-artwork').getAttribute('src')") == f'assets/stamps/{stamp}.svg'
        assert js("String(document.querySelector('.stamp-element textarea') === null)") == 'true'
        assert js("String(document.activeElement.closest('.stamp-element') !== null)") == 'true'
        assert js("String(document.querySelector('#stamp-picker').hidden)") == 'true'
        assert text_value() == literal and postit_geometry() == original_note
        if stamp != 'moon':
            js("document.querySelector('.stamp-element .text-remove').click(); 'ok'")
            saved()
    assert js("document.querySelector('#page-subtitle').textContent") == '1 texto · 1 post-it · 1 sellito'
    assert js("getComputedStyle(document.querySelector('.postit-color')).visibility") == 'hidden'
    reports.append({'check':'six local stamp drawings, picker keyboard cancellation and coexistence', 'result':'passed'})

    js("document.querySelector('.stamp-element .text-move').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,bubbles:true})); 'ok'")
    saved()
    assert stamp_geometry()['x'] == 426
    drag('.stamp-element .text-move', 24, -48)
    saved()
    assert (stamp_geometry()['x'],stamp_geometry()['y']) == (450,392), (stamp_geometry(), js('JSON.stringify(window.pointerTrace.slice(-12))'))
    drag('.stamp-element .text-resize', 48, 24)
    saved()
    assert (stamp_geometry()['width'],stamp_geometry()['height']) == (208,208), (stamp_geometry(), js('JSON.stringify(window.pointerTrace.slice(-12))'))
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert stamp_geometry()['width'] == stamp_geometry()['height'] == 160
    js("document.querySelector('#redo').click(); 'ok'")
    saved()
    assert stamp_geometry()['width'] == stamp_geometry()['height'] == 208
    original_stamp = stamp_geometry()
    drag('.stamp-element .text-move', 24, 24, cancel=True)
    assert stamp_geometry() == original_stamp
    drag('.stamp-element .text-move', 0, 0, scroll=(0,48))
    saved()
    assert stamp_geometry()['y'] == 440
    js("document.querySelector('#workspace').scrollTo(0,0); 'ok'")
    pause()
    original_stamp = stamp_geometry()
    js("document.querySelector('.stamp-element .text-remove').click(); 'ok'")
    saved()
    assert js("String(document.querySelectorAll('.stamp-element').length)") == '0'
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert stamp_geometry() == original_stamp
    js("document.querySelectorAll('#page-tabs button')[1].click(); 'ok'")
    saved()
    assert js("String(document.querySelectorAll('.stamp-element').length)") == '0'
    js("document.querySelector('#page-tabs button').click(); 'ok'")
    saved()
    assert stamp_geometry() == original_stamp
    loaded.clear()
    view.reload()
    wait_for(lambda: loaded)
    saved()
    assert stamp_geometry() == original_stamp
    assert text_value() == literal and postit_geometry() == original_note
    assert js("getComputedStyle(document.querySelector('.postit-color')).visibility") == 'hidden'
    reports.append({'check':'stamp keyboard, drag with scroll, proportional resize, cancel, deletion, history and reload', 'result':'passed'})

    js("window.failSave=true; document.querySelector('.stamp-element .text-move').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true})); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Sin guardar')
    assert js("document.querySelector('.stamp-element').style.left") == '474px'
    assert js("String(document.querySelector('.stamp-element .text-move').disabled)") == 'true'
    assert js("String(document.querySelector('#tool-stamp').disabled)") == 'true'
    js("window.failSave=false; document.querySelector('#retry-storage').click(); 'ok'")
    saved()
    assert stamp_geometry()['x'] == 474
    js("document.querySelector('#undo').click(); 'ok'")
    saved()
    assert stamp_geometry() == original_stamp
    reports.append({'check':'stamp save failure retains geometry and retries before undo', 'result':'passed'})

    js("window.failSave = true; document.querySelector('#add-page').click(); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Sin guardar')
    assert js("String(document.querySelector('#storage-notice').hidden)") == 'false'
    assert js("String(document.querySelector('#add-page').disabled)") == 'true'
    assert js("document.querySelector('#page-count').textContent") == '4 páginas'
    js("window.testCloseHandler({preventDefault(){window.closePrevented=true}}); 'ok'")
    wait_for(lambda: js("String(document.querySelector('#retry-storage').disabled)") == 'false')
    assert js("String(Boolean(window.testDestroyed))") == 'false'
    js("window.failSave = false; document.querySelector('#retry-storage').click(); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')
    assert js("JSON.parse(localStorage.getItem('testJournal')).pages.length.toString()") == '4'
    reports.append({'check':'save error, failed close and retry', 'result':'passed'})

    js("window.failSave = true; document.querySelector('#add-page').click(); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Sin guardar')
    js("document.querySelector('#reload-journal').click(); 'ok'")
    assert js("String(document.querySelector('#reload-dialog').open)") == 'true'
    js("document.querySelector('#reload-dialog button[value=cancel]').click(); 'ok'")
    wait_for(lambda: js("String(document.querySelector('#reload-dialog').open)") == 'false')
    assert js("document.querySelector('#page-count').textContent") == '5 páginas'
    js("document.querySelector('#reload-journal').click(); document.querySelector('#reload-dialog button[value=reload]').click(); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')
    assert js("document.querySelector('#page-count').textContent") == '4 páginas'
    reports.append({'check':'confirmed discard and reload', 'result':'passed'})

    js("localStorage.setItem('failLoad','yes'); 'ok'")
    loaded.clear()
    view.reload()
    wait_for(lambda: loaded)
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Sin guardar')
    assert js("String(document.querySelector('#journal-page').hidden)") == 'true'
    js("localStorage.removeItem('failLoad'); document.querySelector('#retry-storage').click(); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')
    assert js("document.querySelector('#page-count').textContent") == '4 páginas'
    reports.append({'check':'load error without replacing saved journal', 'result':'passed'})

    # Forzar muchas pestañas para comprobar que el pie no desborde.
    for index in range(14):
        js("document.querySelector('#add-page').click(); 'ok'")
    wait_for(lambda: js("document.querySelector('#app-status').textContent") == 'Guardado')
    # Agregar con teclado y tomar capturas de una hoja con texto.
    js("document.querySelector('#tool-text').click(); document.querySelector('#journal-page').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); 'ok'")
    type_text('Mis ideas de hoy\n• Organizar la semana\n• Hacer espacio para crear')
    saved()
    js("document.querySelector('#tool-postit').click(); (()=>{const p=document.querySelector('#journal-page'),r=p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+337,clientY:r.top+25}));})(); 'ok'")
    type_text('Recordatorios\nRegar las plantas\nSalir a caminar 🌱', '.postit-element .text-input')
    set_color('sage')
    saved()
    place_stamp('star', 336, 312)
    saved()
    for width, height in [(1280,900), (900,640)]:
        view.set_size_request(width,height)
        geometry = Gdk.Geometry()
        geometry.min_width = geometry.max_width = width
        geometry.min_height = geometry.max_height = height
        window.set_geometry_hints(None, geometry, Gdk.WindowHints.MIN_SIZE | Gdk.WindowHints.MAX_SIZE)
        window.resize(width,height)
        wait_for(lambda: js('`${innerWidth},${innerHeight}`') == f'{width},{height}')
        assert js("String(document.querySelector('[aria-current=page]').getBoundingClientRect().right <= document.querySelector('#page-tabs').getBoundingClientRect().right + 1)") == 'true'
        data = measure()
        assert (data['paper']['width'], data['paper']['height']) == (854,1080), data
        assert data['images'] and data['styles'] == 4
        assert js("String(document.querySelector('#add-page').getBoundingClientRect().right <= innerWidth)") == 'true'
        assert js("String(document.querySelector('#page-count').getBoundingClientRect().right <= innerWidth)") == 'true'
        assert js("String(document.querySelector('#page-tabs').scrollWidth > document.querySelector('#page-tabs').clientWidth)") == 'true'
        js("document.querySelector('#workspace').scrollTo(10000,10000); 'ok'")
        scrolled = measure()
        assert data['topbar'] == scrolled['topbar'] and data['pagebar'] == scrolled['pagebar']
        js("document.querySelector('#workspace').scrollTo(0,0); document.querySelector('.skip-link').focus(); 'ok'")
        assert float(js("String(document.activeElement.getBoundingClientRect().y)")) >= 0
        js("document.activeElement.click(); 'ok'")
        assert js("document.activeElement.id") == 'workspace'
        snapshot(f'stage5-webkit-{width}x{height}.png')
        reports.append({'viewport':[width,height], 'result':'passed'})

    type_text('Texto confirmado antes de cerrar')
    type_text('Nota confirmada antes de cerrar', '.postit-element .text-input')
    js("document.querySelector('.stamp-element .text-move').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true})); 'ok'")
    js("document.querySelector('#add-page').click(); window.testCloseHandler({preventDefault(){window.closePrevented=true}}); 'ok'")
    assert js("String(Boolean(window.testDestroyed))") == 'false'
    wait_for(lambda: js("String(Boolean(window.testDestroyed))") == 'true')
    assert js("JSON.parse(localStorage.getItem('testJournal')).pages.length.toString()") == '19'
    assert js("JSON.parse(localStorage.getItem('testJournal')).pages[17].elements[0].text") == 'Texto confirmado antes de cerrar'
    assert js("JSON.parse(localStorage.getItem('testJournal')).pages[17].elements[1].text") == 'Nota confirmada antes de cerrar'
    assert js("JSON.parse(localStorage.getItem('testJournal')).pages[17].elements[2].x.toString()") == '360'
    reports.append({'check':'close waits for pending text, post-it, stamp and page save', 'result':'passed'})
    assert not errors, errors
finally:
    window.destroy()
    server.shutdown()
(OUT / 'stage5-frontend-results.json').write_text(json.dumps({'checks':reports,'errors':errors},indent=2))
print(json.dumps({'checks':reports,'errors':errors},ensure_ascii=False))
