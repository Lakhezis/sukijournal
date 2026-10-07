# Cómo está armado Suki Journal

[Volver al README](../README.md) · [Preparar el entorno](desarrollo.md)

Suki Journal tiene dos partes. La interfaz muestra las hojas y responde a tus
acciones; la parte nativa guarda el journal en el disco. Entre ambas hay comandos
que permiten cargar y guardar el documento.

La interfaz usa HTML, CSS y JavaScript vanilla con ES Modules. Tauri 2 la presenta
en una ventana de escritorio y conecta sus comandos con Rust. SQLite guarda los
datos mediante `rusqlite`, con SQLite incluida en el ejecutable.

Por ejemplo, cuando movés un calendario, el editor calcula su nueva posición,
el estado registra el cambio y la capa nativa lo guarda. La herramienta Calendario
no necesita saber dónde está el archivo ni ejecutar consultas SQL.

## Archivos del proyecto

- `frontend/index.html`: estructura semántica, botones e iconos SVG propios.
- `frontend/css/main.css`: paleta, tipografía y distribución de la ventana.
- `frontend/css/components.css`: botones, indicadores y foco accesible.
- `frontend/css/toolbar.css`: barra lateral y herramientas.
- `frontend/css/board.css`: superficie de trabajo y hoja punteada.
- `frontend/js/app.js`: renderizado, navegación y cierre con guardado pendiente.
- `frontend/js/editor.js`: elementos, selección, colores, calendarios y gestos con ratón o teclado.
- `frontend/js/elements.js`: operaciones, paleta y límites de textos, post-it, sellitos y calendarios.
- `frontend/js/stamps.js`: catálogo local de dibujos.
- `frontend/js/calendar.js`: meses, días y cálculo de la grilla gregoriana.
- `frontend/js/calendar-view.js`: grilla semántica y controles del período.
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

## Cómo se guarda el journal

El journal se guarda en una base SQLite mediante `rusqlite`. Las herramientas
modifican el estado del editor y la capa nativa se encarga de escribirlo en disco.
`localStorage` no se usa para guardar el journal.

La capa nativa elige inicialmente `<directorio de datos de la aplicación>/journal/`.
En Debian, normalmente es `~/.local/share/com.sukijournal.desktop/journal/`
(respeta `XDG_DATA_HOME`). El almacenamiento recibe esa raíz y resuelve
`journal.sqlite` respecto de ella. Los comandos operan sobre el journal abierto
en la sesión; el frontend no contiene una ruta fija.

## Modelo de los datos

La base usa `PRAGMA user_version = 1`, una tabla `journal` y una tabla `pages`.
Cada página guarda su identificador, posición, título y elementos en formato JSON.
Por ejemplo, un calendario guarda mes y año; su grilla se calcula al mostrarlo.

Los textos
usan `{ type: "text", id, x, y, width, height, text }`; los post-it usan
`{ type: "postit", id, x, y, width, height, text, color }`, con `color` igual a
`yellow`, `pink`, `sage` o `lilac`. Los sellitos usan
`{ type: "stamp", id, x, y, width, height, stamp }`, con ancho y alto iguales
y `stamp` igual a `flower`, `leaf`, `star`, `heart`, `rainbow` o `moon`.
Se guarda la clave del catálogo; la ruta y el SVG pertenecen a la aplicación.
Los calendarios usan `{ type: "calendar", id, x, y, width, height, year, month }`,
con `year` entero de 1 a 9999 y `month` entero de 1 a 12. La grilla se calcula
al mostrar el elemento; no se guardan fechas generadas ni HTML.
Los identificadores de textos, notas, sellitos y calendarios son únicos
dentro de cada página. No se necesita una migración de la base creada en la etapa 2.

## Cola de guardado y revisiones

Al escribir texto, el editor espera 300 ms de pausa antes de guardar. Esto evita
iniciar una escritura por cada letra. Las demás operaciones solicitan el guardado
sin esa espera; la cola procesa también los cambios que llegan mientras guarda.
Navegar, deshacer/rehacer o cerrar confirma los cambios pendientes.

El conjunto se guarda en una sola transacción. Si falla una escritura, se revierte
para evitar que queden páginas guardadas a medias.

Cada guardado incrementa una revisión. Por ejemplo, si dos ventanas abren la misma
versión y una guarda cambios, la otra no puede sobrescribirlos con su estado
anterior. Las bases corruptas, desconocidas o de otra versión muestran un error
y no se reemplazan por un journal vacío.

## Próximos pasos del almacenamiento

La futura representación portable será una carpeta con `journal.sqlite` y
`assets/`. Las referencias a assets serán relativas a esa carpeta. Esta separación
permitirá posteriormente elegir otro journal, guardar una copia o respaldarlo sin
cambiar el editor. No se implementan todavía esas funciones ni sus controles.

El identificador `com.sukijournal.desktop` se mantiene estable. El directorio de
datos de la aplicación es la ubicación predeterminada. La capa de almacenamiento
recibe la raíz del journal abierto; así podrá usar otra ubicación cuando se
implemente la selección de journals.

## Referencias y recursos

- [Prerrequisitos de Tauri](https://v2.tauri.app/start/prerequisites/)
- [Configuración del frontend](https://v2.tauri.app/reference/config/)
- [API para JavaScript vanilla](https://v2.tauri.app/reference/javascript/api/)
- [Comandos Rust desde el frontend](https://v2.tauri.app/develop/calling-rust/)
- [Transacciones de rusqlite](https://docs.rs/rusqlite/latest/rusqlite/struct.Connection.html#method.transaction_with_behavior)
- [CLI de Tauri](https://v2.tauri.app/reference/cli/)
- Nunito: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/nunito), licencia SIL Open Font License 1.1.
