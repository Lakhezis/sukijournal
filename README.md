# Suki Journal

Bullet journal de escritorio para Debian 13, con interfaz HTML, CSS y JavaScript
vanilla dentro de Tauri 2. El frontend utiliza ES Modules, sin npm ni bundler.

## Etapa actual: 1 — Base Tauri

Esta etapa incluye la ventana nativa, el diseño inicial, la hoja con puntos CSS,
la barra superior, las herramientas y la navegación visual de una primera página.
Todos los botones están deshabilitados: aún no existe edición, historial ni
guardado. El indicador muestra «Vista inicial»; no afirma que haya datos guardados.

SQLite, el estado del journal y las herramientas funcionales se incorporarán en
las etapas aprobadas posteriormente. No se crea todavía ningún `journal.sqlite`.

Verificación completada el 6 de octubre de 2026: compilación release en modo de
producción, apertura y reapertura del ejecutable, y frontend probado en WebKitGTK
a 1280 × 900 y 900 × 640 sin errores de carga. Las capturas y los resultados locales
están en `verification/`, una carpeta excluida de Git.

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

1. Abre la aplicación y comprueba que aparezcan «Mi Bullet Journal» y «Vista inicial».
2. Comprueba que la hoja esté vacía y tenga una trama de puntos.
3. Comprueba las ocho herramientas y el grupo «Próximamente».
4. Los botones de herramientas, deshacer, rehacer y crear página deben estar deshabilitados.
5. Desplázate por la hoja. La barra superior y el navegador inferior deben permanecer visibles.
6. Redimensiona la ventana: la hoja conserva su tamaño y se puede recorrer con las barras de desplazamiento.
7. Pulsa Tab: aparece «Ir a la hoja». Pulsa Enter para enfocar el área de trabajo; las flechas y Page Down permiten recorrerla.
8. Cierra y vuelve a abrir la aplicación. Debe aparecer nuevamente la vista inicial vacía.

En modo de desarrollo puedes abrir el inspector web con Ctrl+Shift+I. La consola
debe mostrar «Suki Journal: interfaz inicial lista.» sin errores de carga.

## Organización

- `frontend/index.html`: estructura semántica, botones e iconos SVG propios.
- `frontend/css/main.css`: paleta, tipografía y distribución de la ventana.
- `frontend/css/components.css`: botones, indicadores y foco accesible.
- `frontend/css/toolbar.css`: barra lateral y herramientas.
- `frontend/css/board.css`: superficie de trabajo y hoja punteada.
- `frontend/js/app.js`: punto de entrada ES Module de la interfaz inicial.
- `frontend/assets/brand/`: ilustraciones SVG originales.
- `frontend/assets/fonts/`: Nunito empaquetada localmente y su licencia OFL.
- `src-tauri/src/main.rs` y `lib.rs`: entrada nativa y arranque de Tauri.
- `src-tauri/Cargo.toml` y `Cargo.lock`: dependencias Rust y versiones resueltas.
- `src-tauri/build.rs`: integración de la compilación con Tauri.
- `src-tauri/tauri.conf.json`: ventana, frontend local y política de recursos.
- `src-tauri/capabilities/main.json`: permisos de la ventana; no concede acceso al disco desde JavaScript.
- `src-tauri/icons/icon.png`: icono nativo derivado del SVG propio.
- `.gitignore`: excluye resultados de compilación y archivos de journal.
- `.cargo/config.toml`: limita los procesos simultáneos de compilación.

## Decisiones de persistencia para la etapa 2

SQLite mediante `rusqlite` será la única persistencia principal. Las herramientas
modificarán el estado del editor y nunca ejecutarán SQL ni conocerán rutas del disco.

La ubicación automática será únicamente la elección inicial de la capa nativa.
El módulo de almacenamiento recibirá la carpeta raíz del journal y resolverá
`journal.sqlite` respecto de ella. Los comandos operarán sobre el journal abierto
en la sesión; el frontend no contendrá una ruta fija.

La futura representación portable será una carpeta con `journal.sqlite` y
`assets/`. Las referencias a assets serán relativas a esa carpeta. Esta separación
permitirá posteriormente elegir otro journal, guardar una copia o respaldarlo sin
cambiar el editor. No se implementan todavía esas funciones ni sus controles.

El identificador `com.sukijournal.desktop` se mantendrá estable. El directorio de
datos de la aplicación será la ubicación predeterminada, separada conceptualmente
de la ubicación del journal abierto.

## Referencias

- [Prerrequisitos de Tauri](https://v2.tauri.app/start/prerequisites/)
- [Configuración del frontend](https://v2.tauri.app/reference/config/)
- [API para JavaScript vanilla](https://v2.tauri.app/reference/javascript/api/)
- [CLI de Tauri](https://v2.tauri.app/reference/cli/)
- Nunito: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/nunito), licencia SIL Open Font License 1.1.
