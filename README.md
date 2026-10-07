# Suki Journal

Bullet journal de escritorio para Debian 13, con interfaz HTML, CSS y JavaScript
vanilla dentro de Tauri 2. El frontend utiliza ES Modules, sin npm ni bundler.

## Etapa actual: 3 — Editor de texto e historial

La herramienta Texto permite colocar bloques en la hoja, escribir texto plano
multilínea, moverlos, cambiar su tamaño y eliminarlos. Los bloques conservan
contenido, posición y tamaño al cambiar de página y al reabrir el journal.

Deshacer y rehacer funcionan desde los botones o con `Ctrl+Z`, `Ctrl+Shift+Z` y
`Ctrl+Y`. La escritura consecutiva se agrupa y cada arrastre produce un solo cambio.
El historial conserva hasta 100 acciones durante la sesión; se reinicia al cargar
el journal. La navegación entre páginas no agrega acciones al historial. Deshacer
una edición vuelve a la página donde se hizo; también se pueden deshacer páginas
recién creadas.

La aplicación abre un journal local, crea una primera página cuando la base es
nueva y permite agregar páginas con `+` y navegar entre ellas. Conserva el orden,
los identificadores y la página activa al cerrar y volver a abrir.

Cada cambio se guarda automáticamente en SQLite. El indicador muestra «Cargando…»,
«Guardando…», «Guardado» o «Sin guardar» según el resultado real. Si falla una
escritura, mantiene los cambios en memoria, bloquea nuevas modificaciones y ofrece
«Reintentar». El cierre normal espera el guardado; si falla, la ventana permanece
abierta. «Recargar desde disco» permite descartar los cambios pendientes mediante
una confirmación y recuperar la versión guardada, por ejemplo ante un conflicto
entre ventanas. Terminar el proceso por la fuerza o apagar el equipo puede perder cambios
que todavía no hayan recibido confirmación de guardado.

Post-it, Sellitos, Calendario y las cuatro herramientas del grupo Próximamente
quedan para etapas posteriores. Los tipos de elementos todavía desconocidos se
conservan al guardar y la interfaz avisa si una página contiene alguno.

Las capturas y los resultados de las comprobaciones locales están en `verification/`,
una carpeta excluida de Git. Los scripts y pruebas reproducibles están en `tests/`.
Verificación completada el 6 de octubre de 2026: ocho pruebas Rust y trece
JavaScript aprobadas, interfaz comprobada en WebKitGTK a 1280 × 900 y 900 × 640
con arrastres reales y sin errores, y ejecutable release probado con texto,
movimiento, tamaño, cierre con escritura pendiente y reapertura de un journal temporal.

## Dependencias de desarrollo

Instala las bibliotecas nativas de Tauri en Debian 13:

```sh
sudo apt-get update
sudo apt-get install --no-install-recommends build-essential pkg-config curl wget file libwebkit2gtk-4.1-dev libssl-dev libxdo-dev librsvg2-dev
```

Instala Rust y Cargo mediante el instalador oficial de [rustup](https://rustup.rs/).
La instalación mínima es suficiente.

No se necesitan Node.js, npm ni Vite. Rust y Cargo son herramientas para
desarrollar; no serán necesarias para utilizar la aplicación empaquetada.

## Ejecutar

Desde la raíz del proyecto, en una terminal nueva:

```sh
cargo run --manifest-path src-tauri/Cargo.toml --locked
```

Si Cargo no está en el PATH, puedes ejecutar:

```sh
~/.cargo/bin/cargo run --manifest-path src-tauri/Cargo.toml --locked
```

La primera ejecución descarga y compila las dependencias Rust. Se necesita
Internet durante esa preparación; la aplicación no necesita Internet para funcionar.
Cargo abre una ventana Tauri con el frontend local empaquetado. Después de cambiar
HTML, CSS o JavaScript, cierra la aplicación y vuelve a ejecutar el comando.
No hace falta instalar la CLI de Tauri para esta etapa.

El proyecto limita la compilación a un proceso mediante `.cargo/config.toml` para
reducir el consumo de memoria. La primera compilación puede tardar varios minutos.

## Compilar el ejecutable

```sh
cargo build --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --locked
```

El ejecutable queda en `src-tauri/target/release/sukijournal`. Para abrirlo:

```sh
./src-tauri/target/release/sukijournal
```

Esta etapa no genera todavía un instalador `.deb`.

## Comprobaciones manuales

1. Abre la aplicación y espera el indicador «Guardado».
2. Elegí Texto y hacé clic en la hoja: aparece un bloque con el campo de escritura enfocado.
3. Escribí varias líneas. El estado pasa por «Guardando…» y llega a «Guardado» después de una pausa.
4. Arrastrá el control Mover y la esquina inferior derecha para cambiar posición y tamaño.
5. Probá deshacer y rehacer con los botones y los atajos. Eliminá un texto con `×` y recuperalo con deshacer.
6. Creá una página con `+`, agregá texto y volvé a la anterior: cada una conserva su contenido.
7. Cerrá y volvé a abrir: deben aparecer las mismas páginas, textos y última selección.
8. Creá muchas páginas: las pestañas se recorren horizontalmente sin ocultar `+` ni el contador.
9. Desplazate por la hoja y redimensioná la ventana: las barras permanecen visibles.
10. Probá con teclado: Texto + Enter crea un bloque; Tab permite llegar a Mover y al control de tamaño.

Los controles Mover y Cambiar tamaño aceptan flechas de 1 píxel, o `Shift` + flechas
para avanzar 24 píxeles (la separación de los puntos). `Delete` elimina el bloque
seleccionado cuando el foco está en uno de sus controles; dentro del campo edita
el texto. `Escape` cancela la colocación o un arrastre y permite salir del campo.

Cada bloque admite hasta 10.000 unidades UTF-16 de texto y queda dentro del área
interior de la hoja, de 852 × 1078 píxeles. Comienza con 240 × 160 y tiene un tamaño
mínimo de 120 × 88; si el contenido ocupa más espacio, se puede recorrer el campo
o aumentar el bloque. Esta etapa utiliza una tipografía y color fijos, sin formato
enriquecido.

En modo de desarrollo puedes abrir el inspector web con Ctrl+Shift+I.
Abrir `frontend/index.html` en un navegador común muestra un aviso: el guardado
requiere ejecutar la aplicación Tauri.

## Pruebas automatizadas

Almacenamiento real: creación, reapertura, contenido de páginas, validación,
rollback ante una escritura fallida, conflictos entre instancias y rechazo de bases
incompatibles sin modificar su contenido. Incluye texto, geometría, eliminación
y rechazo de bloques inválidos:

```sh
~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --locked
```

Estado del editor: cambios durante un guardado, confirmación de revisiones,
reintentos, errores de carga, operaciones sobre textos e historial mientras una
escritura está pendiente. Node.js 20 se utiliza solo para ejecutar estas pruebas;
no es una dependencia de la aplicación:

```sh
node --experimental-default-type=module tests/store.test.mjs
node --experimental-default-type=module tests/editor.test.mjs
```

Interfaz en WebKitGTK con una persistencia simulada y la CSP de producción.
Incluye eventos reales de ratón para los arrastres. Requiere una sesión X11,
Python 3, PyGObject con Gtk 3/WebKit2 4.1 y `libXtst`:

```sh
/usr/bin/python3 tests/webkit_check.py
```

Después de compilar el ejecutable release, la comprobación nativa crea un journal
temporal, agrega páginas y texto, mueve y redimensiona con teclado, cierra durante
una escritura pendiente y verifica la reapertura.
Requiere X11, `xwininfo`, `xprop` y `libXtst`; no modifica el journal personal:

```sh
/usr/bin/python3 tests/native_check.py
```

## Organización

- `frontend/index.html`: estructura semántica, botones e iconos SVG propios.
- `frontend/css/main.css`: paleta, tipografía y distribución de la ventana.
- `frontend/css/components.css`: botones, indicadores y foco accesible.
- `frontend/css/toolbar.css`: barra lateral y herramientas.
- `frontend/css/board.css`: superficie de trabajo y hoja punteada.
- `frontend/js/app.js`: renderizado, navegación y cierre con guardado pendiente.
- `frontend/js/editor.js`: campos de texto, selección y gestos con ratón o teclado.
- `frontend/js/elements.js`: operaciones y límites de los bloques de texto.
- `frontend/js/journal.js`: modelo y operaciones sobre las páginas.
- `frontend/js/store.js`: estado del editor, historial y cola de guardado con reintentos.
- `frontend/js/storage.js`: adaptador de los comandos nativos.
- `frontend/assets/brand/`: ilustraciones SVG originales.
- `frontend/assets/fonts/`: Nunito empaquetada localmente y su licencia OFL.
- `src-tauri/src/main.rs` y `lib.rs`: entrada nativa y sesión del journal abierto.
- `src-tauri/src/journal.rs`: modelo serializable y validación del estado.
- `src-tauri/src/storage.rs`: esquema SQLite, carga y guardado transaccional.
- `src-tauri/src/commands.rs`: puente de carga/guardado con la sesión nativa.
- `src-tauri/Cargo.toml` y `Cargo.lock`: dependencias Rust y versiones resueltas.
- `src-tauri/build.rs`: integración de la compilación con Tauri.
- `src-tauri/tauri.conf.json`: ventana, frontend local y política de recursos.
- `src-tauri/capabilities/main.json`: permisos de la ventana; no concede acceso al disco desde JavaScript.
- `src-tauri/icons/icon.png`: icono nativo derivado del SVG propio.
- `.gitignore`: excluye resultados de compilación y archivos de journal.
- `.cargo/config.toml`: limita los procesos simultáneos de compilación.

## Persistencia

SQLite mediante `rusqlite`, con SQLite incluida en el ejecutable, es la única
persistencia principal. Las herramientas modifican el estado del editor
sin ejecutar SQL ni conocer rutas del disco. No se usa `localStorage` para el journal.

La capa nativa elige inicialmente `<directorio de datos de la aplicación>/journal/`.
En Debian, normalmente es `~/.local/share/com.sukijournal.desktop/journal/`
(respeta `XDG_DATA_HOME`). El almacenamiento recibe esa raíz y resuelve
`journal.sqlite` respecto de ella. Los comandos operan sobre el journal abierto
en la sesión; el frontend no contiene una ruta fija.

La base usa `PRAGMA user_version = 1`, una tabla `journal` y una tabla `pages`.
Las páginas almacenan identificador, posición, título y elementos JSON. Los textos
usan `{ type: "text", id, x, y, width, height, text }`; no se necesita una migración
de la base creada en la etapa 2. La escritura espera 300 ms de pausa antes de guardar;
navegar, deshacer/rehacer o cerrar confirma los cambios pendientes. Guardar
actualiza el conjunto en una sola transacción, sin dejar páginas a medio escribir.
Cada guardado incrementa una revisión: una ventana con estado anterior no puede
sobrescribir cambios confirmados por otra. Las bases corruptas, desconocidas o de
otra versión muestran un error y no se reemplazan por un journal vacío.

La futura representación portable será una carpeta con `journal.sqlite` y
`assets/`. Las referencias a assets serán relativas a esa carpeta. Esta separación
permitirá posteriormente elegir otro journal, guardar una copia o respaldarlo sin
cambiar el editor. No se implementan todavía esas funciones ni sus controles.

El identificador `com.sukijournal.desktop` se mantiene estable. El directorio de
datos de la aplicación será la ubicación predeterminada, separada conceptualmente
de la ubicación del journal abierto.

## Referencias

- [Prerrequisitos de Tauri](https://v2.tauri.app/start/prerequisites/)
- [Configuración del frontend](https://v2.tauri.app/reference/config/)
- [API para JavaScript vanilla](https://v2.tauri.app/reference/javascript/api/)
- [Comandos Rust desde el frontend](https://v2.tauri.app/develop/calling-rust/)
- [Transacciones de rusqlite](https://docs.rs/rusqlite/latest/rusqlite/struct.Connection.html#method.transaction_with_behavior)
- [CLI de Tauri](https://v2.tauri.app/reference/cli/)
- Nunito: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/nunito), licencia SIL Open Font License 1.1.
