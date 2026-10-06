# Suki Journal

Bullet journal de escritorio para Debian 13, con interfaz HTML, CSS y JavaScript
vanilla dentro de Tauri 2. El frontend utiliza ES Modules, sin npm ni bundler.

## Etapa actual: 2 — Estado y persistencia SQLite

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

Las ocho herramientas y deshacer/rehacer siguen en preparación. Esta etapa guarda
el estado de las páginas; todavía no permite escribir o colocar objetos en la hoja.
El modelo reserva `elements` por página y conserva su contenido al guardar.

Las capturas y los resultados de las comprobaciones locales están en `verification/`,
una carpeta excluida de Git. Los scripts y pruebas reproducibles están en `tests/`.
Verificación completada el 6 de octubre de 2026: seis pruebas Rust y seis JavaScript
aprobadas, interfaz comprobada en WebKitGTK a 1280 × 900 y 900 × 640 sin errores,
y ejecutable release comprobado con creación, navegación, cierre normal y reapertura
de un journal temporal.

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
2. Comprueba que la hoja tenga puntos y las ocho herramientas sigan deshabilitadas.
3. Pulsa `+` varias veces: cada página nueva aparece y pasa a ser la activa.
4. Cambia a una página anterior y espera «Guardado».
5. Cierra y vuelve a abrir: deben aparecer las mismas páginas y la última seleccionada.
6. Crea muchas páginas: las pestañas se recorren horizontalmente sin ocultar `+` ni el contador.
7. Desplázate por la hoja y redimensiona la ventana: las barras permanecen visibles.
8. Pulsa Tab para llegar a «Ir a la hoja»; Enter enfoca el área de trabajo.

En modo de desarrollo puedes abrir el inspector web con Ctrl+Shift+I.
Abrir `frontend/index.html` en un navegador común muestra un aviso: el guardado
requiere ejecutar la aplicación Tauri.

## Pruebas automatizadas

Almacenamiento real: creación, reapertura, contenido de páginas, validación,
rollback ante una escritura fallida, conflictos entre instancias y rechazo de bases
incompatibles sin modificar su contenido:

```sh
~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --locked
```

Estado del editor: cambios durante un guardado, confirmación de revisiones,
reintentos y errores de carga. Node.js 20 se utiliza solo para ejecutar estas pruebas;
no es una dependencia de la aplicación:

```sh
node --experimental-default-type=module tests/store.test.mjs
```

Interfaz en WebKitGTK con una persistencia simulada y la CSP de producción.
Requiere una sesión gráfica, Python 3 y PyGObject con Gtk 3/WebKit2 4.1:

```sh
/usr/bin/python3 tests/webkit_check.py
```

Después de compilar el ejecutable release, la comprobación nativa crea un journal
temporal, agrega páginas, navega, cierra normalmente y verifica la reapertura.
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
- `frontend/js/journal.js`: modelo y operaciones sobre las páginas.
- `frontend/js/store.js`: estado del editor y cola de guardado con reintentos.
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
persistencia principal. Las futuras herramientas modificarán el estado del editor
sin ejecutar SQL ni conocer rutas del disco. No se usa `localStorage` para el journal.

La capa nativa elige inicialmente `<directorio de datos de la aplicación>/journal/`.
En Debian, normalmente es `~/.local/share/com.sukijournal.desktop/journal/`
(respeta `XDG_DATA_HOME`). El almacenamiento recibe esa raíz y resuelve
`journal.sqlite` respecto de ella. Los comandos operan sobre el journal abierto
en la sesión; el frontend no contiene una ruta fija.

La base usa `PRAGMA user_version = 1`, una tabla `journal` y una tabla `pages`.
Las páginas almacenan identificador, posición, título y elementos JSON. Guardar
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
