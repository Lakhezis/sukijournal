# Guía de uso

[Volver al README](../README.md) · [Controles de teclado](../README.md#controles)

## Tu primera página

Cuando abrís Suki Journal por primera vez, aparece una hoja punteada vacía.
Vamos a armar una página sencilla con una lista y un recordatorio:

1. Esperá a que el indicador muestre **Guardado**.
2. Elegí **Texto** y hacé clic en la hoja. El campo queda listo para escribir.
3. Escribí una lista, por ejemplo: «Organizar la semana» y «Regar las plantas», en líneas distintas.
4. Elegí **Post-it** y hacé clic en otra zona libre. Agregá un recordatorio y elegí su color al pie de la nota.
5. Arrastrá **Mover** para acomodar cada elemento. La esquina inferior derecha permite cambiar su tamaño.
6. Esperá a que vuelva a aparecer **Guardado**. Cerrá y abrí la aplicación: tu página debería conservar lo que agregaste.

Para crear otra página, pulsá `+`. Las pestañas del pie te permiten volver a
las anteriores. Si hay muchas, podés recorrerlas horizontalmente.

## Texto

Elegí **Texto** y hacé clic en la hoja. Podés escribir texto plano en varias
líneas, mover el bloque, cambiar su tamaño y eliminarlo con `×`.

Si el contenido ocupa más espacio, recorré el campo o agrandá el bloque.
La tipografía es fija; el formato enriquecido queda para más adelante.

## Post-it

Elegí **Post-it**, hacé clic en la hoja y escribí tu nota. El selector al pie
permite elegir **amarillo, rosa, verde o lila**. Aparece cuando editás o
seleccionás la nota, y se oculta al salir de ella.

Contenido, color, posición y tamaño se guardan. Por ejemplo, si cambiás una nota
a rosa y después usás `Ctrl+Z`, vuelve al color anterior.

## Sellitos

Elegí **Sellitos** para abrir el catálogo. Hay seis dibujos propios:
Flor, Brote, Estrella, Corazón, Arcoíris y Luna.

Seleccioná uno y hacé clic en la hoja para colocarlo. El catálogo recuerda la
última elección durante la sesión. Los dibujos están incluidos en la aplicación,
así que funcionan sin Internet.

Al cambiar el tamaño, el sellito conserva sus proporciones. Su dibujo también
se conserva al cambiar de página o reabrir el journal.

Con teclado, recorré el catálogo con `Tab`, elegí con `Enter` y después pulsá
`Enter` en la hoja. `Escape` cancela desde el catálogo o desde la hoja.

## Calendario

Elegí **Calendario**. El selector empieza en el mes actual y conserva tu última
elección durante la sesión.

1. Elegí el mes y escribí el año.
2. Pulsá **Colocar calendario**.
3. Hacé clic en la hoja, o pulsá `Enter` en ella si usás el teclado.

El calendario muestra semanas de lunes a domingo. Según el mes, la grilla ocupa
cuatro, cinco o seis filas. Calcula los años bisiestos con el calendario gregoriano
y admite años de **1 a 9999**.

Probá con **Febrero de 2024**: aparecen 29 días y el día 1 está bajo Jueves.
Si cambiás el año a **2100** desde su cabecera, aparecen 28 días. Si elegís
**Marzo de 2026**, vas a ver una grilla de seis filas.

Mes y año se pueden cambiar en la cabecera del elemento. Un año vacío o fuera
de rango no modifica el journal; al salir del campo se recupera el año guardado.
El mes colocado queda fijo aunque avance la fecha del equipo.

También podés mover, cambiar de tamaño y eliminar el calendario.
La grilla de esta etapa no incluye eventos, feriados ni anotaciones en las celdas.
`Escape` cancela tanto desde el selector como desde la hoja.

## Deshacer y rehacer

Usá los botones de la barra superior o los atajos `Ctrl+Z`, `Ctrl+Shift+Z` y
`Ctrl+Y`. Podés recuperar un elemento eliminado, volver a un tamaño anterior
o deshacer un cambio de mes.

La escritura consecutiva se agrupa y cada arrastre produce un solo cambio.
El historial conserva hasta **100 acciones durante la sesión** y se reinicia
al cargar el journal. Navegar entre páginas no agrega acciones al historial.

Al deshacer una edición, la aplicación vuelve a la página donde la hiciste.
También podés deshacer páginas recién creadas.

## Guardado y recuperación

Cada cambio se guarda automáticamente en SQLite. El indicador te muestra qué
está pasando:

| Estado | Qué significa |
| --- | --- |
| Cargando… | La aplicación está leyendo el journal. |
| Guardando… | Hay cambios esperando confirmación del disco. |
| Guardado | Los cambios ya están guardados. |
| Sin guardar | Hubo un error de carga o de guardado; revisá el mensaje de la ventana. |

Si falla una escritura, los cambios siguen en memoria y se bloquean nuevas
modificaciones. **Reintentar** vuelve a intentar el guardado.
El cierre normal espera a que termine; si falla, la ventana permanece abierta.

**Recargar desde disco** permite recuperar la versión guardada. Primero pide
confirmación, porque descarta los cambios pendientes de la ventana. Puede servir,
por ejemplo, si otra ventana guardó una versión más reciente del journal.

Al terminar el proceso por la fuerza o apagar el equipo, pueden perderse los
cambios que todavía no recibieron confirmación de guardado.

Si una página contiene un tipo de elemento que la aplicación todavía no conoce,
aparece un aviso. Esos datos se conservan al guardar.

## Tamaños y límites

Los elementos quedan dentro del área interior de la hoja, de **852 × 1078 píxeles**.
Su tamaño máximo depende del espacio hasta los bordes derecho e inferior.

| Elemento | Tamaño inicial | Tamaño mínimo |
| --- | --- | --- |
| Texto | 240 × 160 | 120 × 88 |
| Post-it | 240 × 240 | 160 × 144 |
| Sellito | 160 × 160 | 96 × 96 |
| Calendario | 360 × 340 | 280 × 280 |

Las medidas están en píxeles. En Calendario, ancho y alto cambian
independientemente; los sellitos mantienen ancho y alto iguales.
Los tamaños mínimos dejan espacio para usar los controles y leer el contenido.

Cada texto o nota admite hasta **10.000 unidades UTF-16**. Algunos símbolos,
como ciertos emojis, ocupan dos unidades. Los post-it admiten los cuatro colores
indicados, sin rotación. Los sellitos usan la paleta fija del catálogo y no
permiten importar imágenes externas.

## Recorrido para comprobar la aplicación

Después de probar las herramientas, revisá también estas acciones:

1. Mové y redimensioná elementos con ratón y teclado; deshacé y rehacé los cambios.
2. Eliminá un elemento con `×` o `Delete` desde uno de sus botones y recuperalo con Deshacer.
3. Creá otra página, agregá elementos y volvé a la anterior: cada una debe conservar su contenido.
4. Cerrá y volvé a abrir: deben conservarse las páginas, sus elementos y la última página seleccionada.
5. Creá muchas páginas y recorré las pestañas: `+` y el contador deben seguir visibles.
6. Desplazate por la hoja y cambiá el tamaño de la ventana: las barras deben permanecer visibles.
7. Usá `Tab` para recorrer los controles y `Escape` para cancelar la colocación o un arrastre.
