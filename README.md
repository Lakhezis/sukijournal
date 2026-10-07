# Suki Journal

Bullet journal de escritorio para Debian 13, con interfaz HTML, CSS y JavaScript
vanilla dentro de Tauri 2. El frontend utiliza ES Modules, sin npm ni bundler.

## Etapa actual: 5 — Sellitos

La herramienta Sellitos abre un catálogo con seis dibujos SVG propios: Flor,
Brote, Estrella, Corazón, Arcoíris y Luna. Elegí un dibujo y hacé clic en la hoja
para colocarlo. Con teclado, podés elegirlo con Tab y Enter y después pulsar Enter
en la hoja. `Escape` cancela tanto desde el catálogo como desde la hoja.

Cada sellito se puede seleccionar, mover, cambiar de tamaño y eliminar. El tamaño
conserva sus proporciones y respeta los límites de la hoja. El dibujo y su geometría
se guardan automáticamente y participan de deshacer/rehacer. Los dibujos se
incluyen en la aplicación; funcionan sin Internet y conviven con textos y post-it.
El catálogo conserva la última elección durante la sesión. Los sellitos colocados
conservan su dibujo al cambiar de página y al reabrir el journal.

La herramienta Post-it permite pegar notas de texto plano en la hoja y elegir
amarillo, rosa, verde o lila desde el selector al pie de cada nota. El selector
se muestra al editar o seleccionar la nota y se oculta al salir de ella.
Se pueden escribir, mover, redimensionar y eliminar igual que los bloques de texto.
Contenido, color, posición y tamaño se guardan automáticamente y se recuperan
al reabrir. Todas estas acciones participan del historial de deshacer/rehacer.
Texto, Post-it y Sellitos se pueden combinar en una misma página; cada herramienta se
activa hasta colocar un elemento o cancelar con `Escape`.

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

Calendario y las cuatro herramientas del grupo Próximamente
quedan para etapas posteriores. Los tipos de elementos todavía desconocidos se
conservan al guardar y la interfaz avisa si una página contiene alguno.

Las capturas y los resultados de las comprobaciones locales están en `verification/`,
una carpeta excluida de Git. Los scripts y pruebas reproducibles están en `tests/`.
Las pruebas de esta etapa agregan sellitos junto a textos y notas anteriores,
validación del catálogo, escala proporcional, errores de guardado e historial.
La comprobación de interfaz cubre
WebKitGTK a 1280 × 900 y 900 × 640 con arrastres reales; la comprobación nativa
usa un journal temporal para verificar escritura, color, sellitos, geometría y reapertura.
Verificación completada el 7 de octubre de 2026: doce pruebas Rust y veintiuna
JavaScript aprobadas, quince grupos de comprobaciones de interfaz sin errores
de carga o CSP, y dos ejecuciones nativas que conservan textos, notas y sellitos.
Las comprobaciones gráficas se completaron en una pantalla X11 virtual aislada.

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
6. Elegí Post-it y hacé clic en una zona libre. Escribí una nota y elegí su color al pie.
7. Mové y redimensioná la nota; probá deshacer el color y la eliminación.
8. Elegí Sellitos, seleccioná un dibujo y hacé clic en una zona libre. Movelo y probá cambiar su tamaño: mantiene sus proporciones.
9. Eliminá el sellito con `×` o `Delete` desde uno de sus botones y recuperalo con deshacer.
10. Creá una página con `+`, agregá elementos y volvé a la anterior: cada una conserva su contenido.
11. Cerrá y volvé a abrir: deben aparecer las mismas páginas, textos, notas, sellitos y última página seleccionada.
12. Creá muchas páginas: las pestañas se recorren horizontalmente sin ocultar `+` ni el contador.
13. Desplazate por la hoja y redimensioná la ventana: las barras permanecen visibles.
14. Probá con teclado: Texto o Post-it + Enter crea un elemento; Tab permite llegar a Mover, Color y al control de tamaño. En Sellitos, Tab recorre el catálogo y Enter elige el dibujo.

Los controles Mover y Cambiar tamaño aceptan flechas de 1 píxel, o `Shift` + flechas
para avanzar 24 píxeles (la separación de los puntos). `Delete` elimina el bloque
seleccionado cuando el foco está en uno de sus botones; dentro del campo edita
el texto. `Escape` cancela la colocación o un arrastre y permite salir del campo.
Al cambiar el tamaño de un sellito, las flechas derecha/abajo lo agrandan y las
flechas izquierda/arriba lo reducen, manteniendo ancho y alto iguales.

Cada texto o nota admite hasta 10.000 unidades UTF-16 de texto. Los elementos quedan dentro del área
interior de la hoja, de 852 × 1078 píxeles. El bloque de texto comienza con 240 × 160
y tiene un mínimo de 120 × 88; el post-it comienza con 240 × 240 y tiene un mínimo
de 160 × 144 para mantener sus controles accesibles. Si el contenido ocupa más
espacio, se puede recorrer el campo o aumentar el elemento. La tipografía es fija
y el contenido es texto plano. Los post-it admiten los cuatro colores indicados;
no se implementan todavía rotación ni formato enriquecido.
El sellito comienza con 160 × 160 y tiene un mínimo de 96 × 96; su tamaño máximo
depende del espacio hasta los bordes derecho e inferior de la hoja. Esta etapa
utiliza los dibujos del catálogo con su paleta fija, sin importar imágenes externas.

En modo de desarrollo puedes abrir el inspector web con Ctrl+Shift+I.
Abrir `frontend/index.html` en un navegador común muestra un aviso: el guardado
requiere ejecutar la aplicación Tauri.

## Pruebas automatizadas

Almacenamiento real: creación, reapertura, contenido de páginas, validación,
rollback ante una escritura fallida, conflictos entre instancias y rechazo de bases
incompatibles sin modificar su contenido. Incluye texto, geometría, eliminación
y rechazo de textos, notas, colores, sellitos y geometría inválidos sin modificar los datos guardados:

```sh
~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --locked
```

Estado del editor: cambios durante un guardado, confirmación de revisiones,
reintentos, errores de carga, operaciones sobre elementos e historial mientras una
escritura está pendiente. Node.js 20 se utiliza solo para ejecutar estas pruebas;
no es una dependencia de la aplicación:

```sh
node --experimental-default-type=module tests/store.test.mjs
node --experimental-default-type=module tests/editor.test.mjs
node --experimental-default-type=module tests/postit.test.mjs
node --experimental-default-type=module tests/stamps.test.mjs
```

Interfaz en WebKitGTK con una persistencia simulada y la CSP de producción.
Incluye catálogo completo, foco, arrastres reales con scroll, escala proporcional,
cancelación y recuperación ante errores de guardado. Requiere una sesión X11,
Python 3, PyGObject con Gtk 3/WebKit2 4.1 y `libXtst`:

```sh
/usr/bin/python3 tests/webkit_check.py
```

Después de compilar el ejecutable release, la comprobación nativa crea un journal
temporal, agrega páginas, texto, un post-it y un sellito. Elige un color y un dibujo,
mueve y redimensiona con teclado, prueba deshacer/rehacer, cierra con cambios
pendientes y verifica la reapertura.
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
- `frontend/js/editor.js`: elementos, selección, colores y gestos con ratón o teclado.
- `frontend/js/elements.js`: operaciones, paleta y límites de textos, post-it y sellitos.
- `frontend/js/stamps.js`: catálogo local de dibujos.
- `frontend/js/journal.js`: modelo y operaciones sobre las páginas.
- `frontend/js/store.js`: estado del editor, historial y cola de guardado con reintentos.
- `frontend/js/storage.js`: adaptador de los comandos nativos.
- `frontend/assets/brand/`: ilustraciones SVG originales.
- `frontend/assets/stamps/`: los seis dibujos SVG propios del catálogo de sellitos.
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
usan `{ type: "text", id, x, y, width, height, text }`; los post-it usan
`{ type: "postit", id, x, y, width, height, text, color }`, con `color` igual a
`yellow`, `pink`, `sage` o `lilac`. Los sellitos usan
`{ type: "stamp", id, x, y, width, height, stamp }`, con ancho y alto iguales
y `stamp` igual a `flower`, `leaf`, `star`, `heart`, `rainbow` o `moon`.
Se guarda la clave del catálogo; la ruta y el SVG pertenecen a la aplicación.
Los identificadores de textos, notas y sellitos son únicos
dentro de cada página. No se necesita una migración de la base creada en la etapa 2.
La escritura espera 300 ms de pausa antes de guardar;
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
