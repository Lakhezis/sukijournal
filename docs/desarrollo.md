# Desarrollo y pruebas

[Volver al README](../README.md) · [Arquitectura](arquitectura.md)

## Preparar el entorno

El entorno de desarrollo está preparado para **Debian 13**.
Necesitás las bibliotecas nativas de Tauri y las herramientas de Rust.

### 1. Instalar las bibliotecas del sistema

Abrí una terminal y ejecutá:

```sh
sudo apt-get update
sudo apt-get install --no-install-recommends build-essential pkg-config curl wget file libwebkit2gtk-4.1-dev libssl-dev libxdo-dev librsvg2-dev
```

Estas bibliotecas permiten compilar la aplicación y mostrar su interfaz en una
ventana de escritorio.

### 2. Instalar Rust y Cargo

Seguí el instalador oficial de [rustup](https://rustup.rs/).
La instalación mínima es suficiente. Después abrí una terminal nueva para que
pueda encontrar las herramientas instaladas.

**Rust** es el lenguaje de la parte nativa. **Cargo** prepara sus dependencias,
compila el proyecto y ejecuta las pruebas.

El frontend usa JavaScript vanilla con ES Modules, sin npm ni bundler.
No necesitás Node.js, npm, Vite ni la CLI de Tauri para ejecutar la aplicación
durante esta etapa. Node.js 20 se usa únicamente para las pruebas de JavaScript.

### 3. Abrir la aplicación

Desde la carpeta del proyecto:

```sh
cargo run --manifest-path src-tauri/Cargo.toml --locked
```

La primera ejecución descarga y compila las dependencias de Rust. Necesitás
Internet durante esa preparación; después, Suki Journal funciona sin conexión.

Si `cargo` no aparece en el PATH, usá `~/.cargo/bin/cargo` en su lugar.
El PATH es la lista de carpetas donde la terminal busca los comandos.

El proyecto limita la compilación a un proceso con `.cargo/config.toml` para
reducir el consumo de memoria. La primera compilación puede tardar varios minutos.

## Trabajar en la interfaz

Después de cambiar HTML, CSS o JavaScript, cerrá la aplicación y volvé a ejecutar
el comando. Podés abrir el inspector web con `Ctrl+Shift+I` en desarrollo.

Abrir `frontend/index.html` en un navegador común muestra un aviso: el guardado
requiere los comandos nativos de Tauri. Para probar el recorrido completo,
ejecutá la aplicación de escritorio.

## Compilar la versión release

Release genera una versión optimizada del ejecutable y empaqueta el frontend local:

```sh
cargo build --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --locked
```

El resultado queda en `src-tauri/target/release/sukijournal`:

```sh
./src-tauri/target/release/sukijournal
```

Esta etapa todavía no genera un instalador `.deb`.

## Pruebas

Cada grupo comprueba una parte distinta del recorrido: el estado del editor,
el almacenamiento, la interfaz y el ejecutable real.

### Almacenamiento en Rust

```sh
~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --locked
```

Verifica creación y reapertura, páginas y elementos, geometría, eliminación,
validación y conflictos entre instancias. También comprueba que una escritura
fallida se revierta y que se rechacen datos o bases incompatibles sin modificar
el contenido guardado.

### Estado del editor en JavaScript

Con **Node.js 20**, ejecutá:

```sh
node --experimental-default-type=module tests/store.test.mjs
node --experimental-default-type=module tests/editor.test.mjs
node --experimental-default-type=module tests/postit.test.mjs
node --experimental-default-type=module tests/stamps.test.mjs
node --experimental-default-type=module tests/calendar.test.mjs
```

Estas pruebas cubren cambios durante un guardado, confirmación de revisiones,
reintentos, errores de carga, operaciones sobre elementos y deshacer/rehacer.
El calendario también se revisa a lo largo de los 4.800 meses de un ciclo
gregoriano de 400 años.

### Interfaz en WebKitGTK

```sh
/usr/bin/python3 tests/webkit_check.py
```

Usa una persistencia simulada y la política de seguridad de contenido (CSP) de
producción. Revisa foco, catálogo, calendarios, arrastres reales con scroll,
escala proporcional de sellitos, cancelación y recuperación ante errores.

Requiere una sesión X11, Python 3, PyGObject con Gtk 3/WebKit2 4.1 y `libXtst`.
Se comprueba la interfaz a **1280 × 900** y **900 × 640**, incluida la grilla
del calendario en su tamaño mínimo.

### Ejecutable real y reapertura

Primero compilá la versión release con los cambios actuales. Después ejecutá:

```sh
/usr/bin/python3 tests/native_check.py
```

La prueba crea un journal temporal, agrega páginas, texto, un post-it, un sellito
y un calendario. Cambia color, dibujo y período, mueve y redimensiona con teclado,
prueba deshacer/rehacer, cierra con cambios pendientes y vuelve a abrir.
El journal personal se mantiene separado del journal de prueba.

Requiere X11, `xwininfo`, `xprop` y `libXtst`.

## Resultados de la etapa 6

Verificación completada el **7 de octubre de 2026**:

| Grupo | Resultado |
| --- | --- |
| Rust | 14 pruebas aprobadas. |
| JavaScript | 27 pruebas aprobadas. |
| Interfaz | 18 grupos aprobados, sin errores de carga ni de CSP. |
| Ejecución nativa | Dos ejecuciones aprobadas, con cierre y reapertura. |

Los calendarios se probaron junto con textos, post-it y sellitos anteriores.
Las comprobaciones gráficas se completaron en una pantalla X11 virtual aislada.

Los scripts reproducibles están en `tests/`. Las capturas y los resultados locales
quedan en `verification/`, una carpeta excluida de Git.
