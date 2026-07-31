# Báscula — control de pesajes de muelle

Aplicación para llevar el control de la arena que descarga cada barco: se pesa el
camión vacío, se pesa cargado, y la arena neta se calcula sola y queda registrada
a nombre del cliente que corresponda.

Funciona en móvil, tablet y ordenador. No hay que instalar nada.

## Cómo se usa

**1 · Tara** — El camión entra vacío. Se apunta la matrícula y lo que marca la
báscula. Queda en la lista de espera, el que lleva más tiempo primero.

**2 · Carga** — El camión sale cargado. Se elige de la lista, se apunta el peso y
el cliente. La arena neta se muestra en grande antes de guardar, para poder
cantarla y confirmarla.

**3 · Registro** — Todos los pesajes cerrados, con filtros por cliente, barco y
matrícula. Se puede exportar a Excel.

**4 · Resumen** — Cuánta arena lleva cada empresa y el total del barco.

## Instalarla como aplicación

No hace falta descargarla de ninguna tienda. Se abre el enlace en el móvil y se
elige **"Añadir a pantalla de inicio"** en el menú del navegador. Queda con su
icono, se abre a pantalla completa sin barra de navegador y **funciona aunque no
haya cobertura** en el muelle.

## Cerrar la jornada

Al terminar el día, el botón **Cerrar jornada** descarga el Excel con todos los
pesajes y deja el registro limpio para el día siguiente, sin borrar uno a uno.

Los pesajes no se destruyen: quedan archivados en el dispositivo por si la
descarga falló o hay que consultar algo. Los camiones que todavía estén
pendientes de cargar no se tocan.

## Detalles que evitan errores

- Un mismo camión no puede tener dos taras abiertas a la vez.
- No deja guardar si el peso cargado es menor o igual que la tara.
- Antes de borrar cualquier cosa pide confirmación diciendo exactamente qué se va
  a borrar.
- Las matrículas se guardan siempre igual (mayúsculas, un solo espacio), para que
  el buscador las encuentre.

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
| `datos.js` | Dónde se guardan los pesajes — el único archivo que cambiará al pasar a la nube |
