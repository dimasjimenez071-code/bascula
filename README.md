# Báscula — control de pesajes de muelle

Aplicación para llevar el control de la arena que descarga cada barco. Cada
camión se pesa vacío una sola vez y su tara queda guardada; después hace todos
los viajes que haga falta y en cada uno solo hay que apuntar el peso cargado y
el cliente. La arena neta se calcula sola.

Funciona en móvil, tablet y ordenador. No hay que instalar nada.

## Cómo se usa

**Camiones** — Se pesa el camión vacío y se guarda su matrícula con la tara. Se
hace una vez. Si algún día se vuelve a tarar, se escribe otra vez la misma
matrícula con el peso nuevo y se actualiza; **los viajes ya registrados
conservan la tara que tenían**, así que las cuentas de días anteriores no
cambian.

**Pesar** — Se elige el camión, se pone el peso con la arena dentro y el
cliente. La arena neta se muestra en grande antes de guardar, para poder
cantarla y confirmarla. Se repite tantas veces como viajes haga el camión.

**Registro** — Todos los viajes del día, con filtros por cliente, barco y
matrícula. Se puede exportar a Excel.

**Resumen** — Cuánta arena lleva cada empresa, cuántos viajes ha hecho cada
camión y el total del barco.

## Instalarla como aplicación

No hace falta descargarla de ninguna tienda. Se abre el enlace en el móvil y se
elige **"Añadir a pantalla de inicio"** en el menú del navegador. Queda con su
icono, se abre a pantalla completa sin barra de navegador y **funciona aunque no
haya cobertura** en el muelle.

## Cerrar la jornada

Al terminar el día, el botón **Cerrar jornada** descarga el Excel con todos los
viajes y deja el registro limpio para el día siguiente.

Los viajes no se destruyen: quedan archivados en el dispositivo por si la
descarga falló o hay que consultar algo. Los camiones y sus taras se quedan
dados de alta para mañana.

## Detalles que evitan errores

- No deja guardar un viaje si el peso cargado no supera la tara del camión.
- Cada viaje guarda su propia copia de la tara usada, no una referencia.
- Tras registrar un viaje hay que volver a elegir el camión a propósito, para
  no colgarle un peso al camión equivocado.
- Antes de borrar cualquier cosa pide confirmación diciendo exactamente qué se
  va a borrar.
- Las matrículas se guardan siempre igual (mayúsculas, un solo espacio).

## Estado actual

Los datos se guardan **en el dispositivo donde se apuntan**. Todavía no se
comparten entre móviles ni ordenadores: es lo siguiente que se va a hacer,
conectando una base de datos en la nube.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La estructura de las cuatro pantallas |
| `estilos.css` | El aspecto visual |
| `app.js` | La lógica de la interfaz |
| `datos.js` | Dónde se guardan los datos — el único archivo que cambiará al pasar a la nube |
| `sw.js` | Permite que funcione sin cobertura |
