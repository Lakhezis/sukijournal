<div align="center">
  <img src="frontend/assets/brand/icon.svg" width="96" height="96" alt="" />
  <h1>Suki Journal</h1>
  <p>Un bullet journal de escritorio para organizar tus ideas y crear a tu ritmo.</p>
</div>

Suki Journal te da una hoja punteada donde podés combinar textos, post-it,
sellitos y calendarios. Tus páginas se guardan en tu equipo y la aplicación
funciona sin Internet.

Está en desarrollo para **Debian 13**. La etapa actual es **6 — Calendario**.
La interfaz usa HTML, CSS y JavaScript dentro de Tauri 2, con guardado en SQLite.

## Contenido

- [Qué podés hacer](#qué-podés-hacer)
- [Documentación](#documentación)
- [Controles](#controles)
- [Ejecutar desde el código](#ejecutar-desde-el-código)
- [Compilar el ejecutable](#compilar-el-ejecutable)
- [Dónde se guardan tus páginas](#dónde-se-guardan-tus-páginas)
- [Estado del proyecto](#estado-del-proyecto)

## Qué podés hacer

| Herramienta | Para qué sirve |
| --- | --- |
| Texto | Escribir ideas y listas en bloques de texto de varias líneas. |
| Post-it | Agregar notas amarillas, rosas, verdes o lilas. |
| Sellitos | Decorar con Flor, Brote, Estrella, Corazón, Arcoíris y Luna. |
| Calendario | Colocar un mes y año, con semanas de lunes a domingo. |

Podés mover, cambiar de tamaño y eliminar los elementos de la hoja. También
agregar páginas con `+`, volver a las anteriores y deshacer o rehacer cambios.
El guardado es automático: el indicador **Guardado** confirma que tus cambios
ya están en el disco.

## Documentación

- [Guía de uso](docs/uso.md): armá tu primera página y conocé cada herramienta.
- [Desarrollo y pruebas](docs/desarrollo.md): prepará el entorno y comprobá los cambios.
- [Arquitectura y almacenamiento](docs/arquitectura.md): ubicá los archivos y seguí el recorrido de los datos.

## Controles

| Control | Acción |
| --- | --- |
| Clic en la hoja | Colocar el elemento de la herramienta activa. |
| `Enter` en la hoja | Colocar con teclado; en Calendario, elegí y confirmá antes el período. |
| `Tab` / `Shift+Tab` | Recorrer los controles hacia adelante o hacia atrás. |
| Arrastrar Mover | Cambiar la posición de un elemento. |
| Arrastrar la esquina inferior derecha | Cambiar su tamaño. |
| Flechas en Mover o Cambiar tamaño | Ajustar de a 1 píxel. |
| `Shift` + flechas en esos controles | Ajustar de a 24 píxeles, la separación entre los puntos. |
| `×` | Eliminar un elemento. |
| `Delete` desde un botón del elemento | Eliminar el elemento seleccionado. |
| `Escape` | Cancelar la colocación o el arrastre, o salir del campo de edición. |
| `Ctrl+Z` | Deshacer. |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Rehacer. |

Dentro de un campo de texto, `Delete` borra texto. En los sellitos, las flechas
derecha/abajo agrandan el dibujo y las flechas izquierda/arriba lo achican,
conservando sus proporciones.

## Ejecutar desde el código

Primero seguí la [preparación del entorno](docs/desarrollo.md#preparar-el-entorno).
Después, abrí una terminal en la carpeta del proyecto y ejecutá:

```sh
cargo run --manifest-path src-tauri/Cargo.toml --locked
```

Este comando compila el proyecto y abre la ventana de Suki Journal. La primera
vez puede tardar varios minutos: Cargo tiene que descargar y preparar las
bibliotecas que usa la aplicación. Para ese primer paso necesitás Internet.

Si la terminal no encuentra `cargo`, probá con su ubicación habitual:

```sh
~/.cargo/bin/cargo run --manifest-path src-tauri/Cargo.toml --locked
```

## Compilar el ejecutable

Para generar la versión release, ejecutá desde la carpeta del proyecto:

```sh
cargo build --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --locked
```

El ejecutable queda en `src-tauri/target/release/sukijournal`. Podés abrirlo así:

```sh
./src-tauri/target/release/sukijournal
```

Todavía no se genera un instalador `.deb`. Rust y Cargo se usan para desarrollar
y compilar; no hacen falta para utilizar el ejecutable ya compilado.

## Dónde se guardan tus páginas

En Debian, la ubicación predeterminada de la base de datos es:

```text
~/.local/share/com.sukijournal.desktop/journal/journal.sqlite
```

Si configuraste `XDG_DATA_HOME`, la aplicación usa ese directorio como base.
El orden de las páginas, su contenido y la última página seleccionada se
recuperan cuando volvés a abrir Suki Journal.

Si aparece **Sin guardar**, tus cambios siguen en la ventana. Usá **Reintentar**
para intentar guardarlos otra vez. La [guía de uso](docs/uso.md#guardado-y-recuperación)
explica cómo recuperar el guardado o recargar la versión del disco.

## Estado del proyecto

Las etapas de estado y persistencia, editor de texto e historial, Post-it,
Sellitos y Calendario están implementadas. Washi tape, Dibujo, Subrayado y
Remarcado siguen en el grupo **Próximamente**.

El Calendario muestra la grilla mensual y permite cambiar su período. Los eventos,
feriados y las anotaciones dentro de las celdas quedan fuera de esta etapa.
También quedan pendientes elegir otro journal, guardar una copia y respaldarlo
desde la aplicación.

La etapa 6 se verificó con 14 pruebas Rust, 27 JavaScript, 18 grupos de
comprobaciones de interfaz y dos ejecuciones nativas de cierre y reapertura.
Encontrás los comandos y el alcance en [Desarrollo y pruebas](docs/desarrollo.md#pruebas).
