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

**Resumen** — Lo que tiene que llevarse cada empresa ese día, cuánto lleva
descargado y cuánto le falta, con su barra de avance. Debajo, los totales por
cliente, los viajes de cada camión y el total del barco.

**Usuarios** — Solo la ve el encargado. Una lista de todos los usuarios con un
interruptor para encender a los que están de turno hoy y apagar al resto, y un
campo para anotar a quién se le ha dado cada uno.

## Quién manda

Hay dos tipos de cuenta:

- **Encargado**: ve la pestaña de Usuarios y decide quién puede trabajar cada
  día.
- **Operario**: usuarios genéricos (`usuario1`, `usuario2`…) que se reparten
  entre la gente del turno.

El bloqueo está en la base de datos, no en la pantalla: un usuario apagado no
puede leer ni escribir nada aunque sepa su contraseña. Si el encargado apaga a
alguien mientras lo tiene abierto, su pantalla se bloquea sola en el momento.

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

## Varias personas a la vez

Los datos viven en una base de datos compartida, así que **lo que apunta uno
aparece al instante en la pantalla de los demás**, sin recargar y sin importar
si están en el móvil, en la tablet o en el ordenador de la oficina.

Hace falta iniciar sesión con una cuenta del muelle. Sin cuenta no se ve ni se
toca nada: la base de datos rechaza cualquier intento de leer o escribir de
quien no haya entrado.

Cada viaje queda firmado con el usuario que lo registró.

### Dar de alta a una persona

En el panel de Supabase: **Authentication → Users → Add user → Create new
user**. Se pone su correo y una contraseña, y hay que marcar **Auto Confirm
User**; si no, la cuenta se queda pendiente de confirmar por correo y no podrá
entrar.

## Limitación conocida

Registrar un viaje **necesita cobertura**. Si se va la conexión, la pantalla
sigue mostrando lo ya cargado, pero al guardar avisa de que no hay conexión.
Queda pendiente guardar los viajes en el móvil y subirlos solos al recuperar
señal.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La estructura de las pantallas |
| `estilos.css` | El aspecto visual |
| `app.js` | La lógica de la interfaz |
| `datos.js` | Habla con la base de datos en la nube |
| `config.js` | Dirección y clave pública del proyecto de Supabase |
| `lib/supabase.js` | Librería de Supabase, guardada aquí para no depender de internet |
| `supabase/esquema.sql` | Las tablas y las reglas de seguridad |
| `sw.js` | Permite abrir la aplicación sin cobertura |
