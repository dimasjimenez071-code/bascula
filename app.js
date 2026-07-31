/* =========================================================
   BÁSCULA — lógica de la interfaz
   Habla solo con el objeto Datos (datos.js). No sabe ni le
   importa dónde se guardan las cosas.
   ========================================================= */

(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  let camionElegido = null;

  /* ---------------------------------------------------------
     Formato
     --------------------------------------------------------- */

  const kg = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return new Intl.NumberFormat('es-ES').format(Math.round(n)) + ' kg';
  };

  const hora = function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const fechaCorta = function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  };

  const fechaHora = function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const normalizarPlaca = function (t) {
    return t.trim().toUpperCase().replace(/\s+/g, ' ');
  };

  /* ---------------------------------------------------------
     Mensajes emergentes
     --------------------------------------------------------- */

  let temporizadorMensaje;
  function avisar(texto, tipo) {
    const caja = $('mensaje');
    caja.textContent = texto;
    caja.className = 'mensaje visible ' + (tipo || '');
    clearTimeout(temporizadorMensaje);
    temporizadorMensaje = setTimeout(function () {
      caja.className = 'mensaje';
    }, tipo === 'error' ? 5000 : 3000);
  }

  /* ---------------------------------------------------------
     Confirmación propia
     ---------------------------------------------------------
     No usamos el confirm() del navegador: muchos navegadores lo
     bloquean en silencio y responden "no" sin preguntar nada.
     --------------------------------------------------------- */

  function confirmar(texto, opciones) {
    opciones = opciones || {};
    const modal = $('modal');
    const aceptar = $('modalConfirmar');
    const cancelar = $('modalCancelar');

    $('modalTitulo').textContent = opciones.titulo || '¿Seguro?';
    $('modalTexto').textContent = texto;
    aceptar.textContent = opciones.aceptar || 'Borrar';
    modal.hidden = false;
    aceptar.focus();

    return new Promise(function (resolver) {
      function cerrar(respuesta) {
        modal.hidden = true;
        aceptar.removeEventListener('click', siAcepta);
        cancelar.removeEventListener('click', siCancela);
        modal.removeEventListener('click', siClicFuera);
        document.removeEventListener('keydown', siTecla);
        resolver(respuesta);
      }
      function siAcepta() { cerrar(true); }
      function siCancela() { cerrar(false); }
      function siClicFuera(e) { if (e.target === modal) cerrar(false); }
      function siTecla(e) { if (e.key === 'Escape') cerrar(false); }

      aceptar.addEventListener('click', siAcepta);
      cancelar.addEventListener('click', siCancela);
      modal.addEventListener('click', siClicFuera);
      document.addEventListener('keydown', siTecla);
    });
  }

  /* ---------------------------------------------------------
     Pestañas
     --------------------------------------------------------- */

  function irA(vista) {
    document.querySelectorAll('.pestana').forEach(function (b) {
      b.classList.toggle('activa', b.dataset.vista === vista);
    });
    document.querySelectorAll('.vista').forEach(function (s) {
      s.classList.toggle('activa', s.id === 'vista-' + vista);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.pestana').forEach(function (boton) {
    boton.addEventListener('click', function () { irA(boton.dataset.vista); });
  });

  /* ---------------------------------------------------------
     CAMIONES
     --------------------------------------------------------- */

  $('camionMatricula').addEventListener('blur', function () {
    this.value = normalizarPlaca(this.value);
  });

  $('formCamion').addEventListener('submit', async function (e) {
    e.preventDefault();
    const matricula = normalizarPlaca($('camionMatricula').value);
    const tara = parseInt($('camionTara').value, 10);

    if (!matricula) return avisar('Falta la matrícula.', 'error');
    if (!tara || tara <= 0) return avisar('El peso de la tara no es válido.', 'error');

    const res = await Datos.guardarCamion({ matricula: matricula, tara: tara });
    this.reset();
    $('camionMatricula').focus();

    if (res.actualizado) {
      avisar('Tara de ' + matricula + ' actualizada: ' + kg(res.taraAnterior) + ' → ' + kg(tara), 'exito');
    } else {
      avisar('Camión ' + matricula + ' dado de alta con ' + kg(tara), 'exito');
    }
    await pintarTodo();
  });

  async function pintarCamiones() {
    const camiones = await Datos.camiones();
    const viajes = await Datos.viajesDeHoy();
    const caja = $('listaCamiones');

    $('contadorCamiones').textContent = camiones.length;
    const chincheta = $('chinchetaCamiones');
    chincheta.textContent = camiones.length;
    chincheta.hidden = camiones.length === 0;

    if (!camiones.length) {
      caja.innerHTML = '<p class="vacio">Ningún camión dado de alta todavía.</p>';
      return;
    }

    caja.innerHTML = '';
    camiones.forEach(function (c) {
      const n = viajes[c.id] || 0;
      const fila = document.createElement('div');
      fila.className = 'pendiente';
      fila.innerHTML =
        '<div>' +
          '<div class="pendiente__placa"></div>' +
          '<div class="pendiente__datos"></div>' +
        '</div>' +
        '<div class="pendiente__acciones">' +
          '<button class="boton boton--secundario boton--pequeno">Pesar</button>' +
          '<button class="boton boton--fantasma">Borrar</button>' +
        '</div>';

      fila.querySelector('.pendiente__placa').textContent = c.matricula;
      fila.querySelector('.pendiente__datos').textContent =
        'Tara ' + kg(c.tara) + ' · desde el ' + fechaCorta(c.fechaTara) +
        ' · ' + (n === 1 ? '1 viaje hoy' : n + ' viajes hoy');

      const botones = fila.querySelectorAll('button');
      botones[0].addEventListener('click', function () {
        camionElegido = c.id;
        irA('pesar');
        pintarPesar().then(function () { $('pesajeBruto').focus(); });
      });
      botones[1].addEventListener('click', async function () {
        const ok = await confirmar(
          'Se dará de baja el camión ' + c.matricula + ' (tara ' + kg(c.tara) + '). ' +
          'Los viajes que ya haya hecho se quedan en el registro.',
          { titulo: 'Dar de baja', aceptar: 'Dar de baja' }
        );
        if (!ok) return;
        await Datos.eliminarCamion(c.id);
        avisar('Camión dado de baja.');
        await pintarTodo();
      });

      caja.appendChild(fila);
    });
  }

  /* ---------------------------------------------------------
     PESAR UNA CARGA
     --------------------------------------------------------- */

  async function pintarPesar() {
    const camiones = await Datos.camiones();
    const viajes = await Datos.viajesDeHoy();
    const hay = camiones.length > 0;

    $('sinCamiones').hidden = hay;
    $('formPesaje').hidden = !hay;
    if (!hay) { $('tarjetaUltimos').hidden = true; return; }

    if (!camiones.some(function (c) { return c.id === camionElegido; })) camionElegido = null;

    const selector = $('selectorCamiones');
    selector.innerHTML = '';
    camiones.forEach(function (c) {
      const n = viajes[c.id] || 0;
      const opcion = document.createElement('button');
      opcion.type = 'button';
      opcion.className = 'selector__opcion' + (c.id === camionElegido ? ' elegida' : '');
      opcion.innerHTML = '<span class="selector__placa"></span><span class="selector__meta"></span>';
      opcion.querySelector('.selector__placa').textContent = c.matricula;
      opcion.querySelector('.selector__meta').textContent =
        'Tara ' + kg(c.tara) + (n ? ' · ' + n + (n === 1 ? ' viaje' : ' viajes') : '');
      opcion.addEventListener('click', function () {
        camionElegido = c.id;
        pintarPesar().then(function () { $('pesajeBruto').focus(); });
      });
      selector.appendChild(opcion);
    });

    const elegido = camiones.find(function (c) { return c.id === camionElegido; });
    $('resumenCamion').hidden = !elegido;
    if (elegido) {
      const n = viajes[elegido.id] || 0;
      $('resumenTaraValor').textContent = kg(elegido.tara);
      $('resumenViajes').textContent = n === 1 ? '1 viaje' : n + ' viajes';
    }

    await calcularNeto();
    await pintarUltimos();
  }

  async function calcularNeto() {
    const caja = $('cajaNeto');
    const valor = $('netoValor');
    const bruto = parseInt($('pesajeBruto').value, 10);
    const camion = camionElegido ? await Datos.buscarCamion(camionElegido) : null;

    if (!camion || !bruto) {
      valor.textContent = '—';
      caja.classList.remove('neto--error');
      return;
    }
    const neto = bruto - camion.tara;
    if (neto <= 0) {
      valor.textContent = 'Revisar pesos';
      caja.classList.add('neto--error');
    } else {
      valor.textContent = kg(neto);
      caja.classList.remove('neto--error');
    }
  }

  $('pesajeBruto').addEventListener('input', calcularNeto);

  async function pintarUltimos() {
    const pesajes = await Datos.pesajes();
    const caja = $('ultimosViajes');
    $('tarjetaUltimos').hidden = pesajes.length === 0;
    if (!pesajes.length) return;

    caja.innerHTML = '';
    pesajes.slice(0, 4).forEach(function (p) {
      const fila = document.createElement('div');
      fila.className = 'pendiente pendiente--hecho';
      fila.innerHTML =
        '<div>' +
          '<div class="pendiente__placa"></div>' +
          '<div class="pendiente__datos"></div>' +
        '</div>' +
        '<div class="pendiente__peso"></div>';
      fila.querySelector('.pendiente__placa').textContent = p.matricula;
      fila.querySelector('.pendiente__datos').textContent = hora(p.fecha) + ' · ' + p.cliente;
      fila.querySelector('.pendiente__peso').textContent = kg(p.bruto - p.tara);
      caja.appendChild(fila);
    });
  }

  $('formPesaje').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!camionElegido) return avisar('Elige primero el camión.', 'error');

    const bruto = parseInt($('pesajeBruto').value, 10);
    const cliente = $('pesajeCliente').value.trim();
    if (!bruto || bruto <= 0) return avisar('El peso cargado no es válido.', 'error');
    if (!cliente) return avisar('Falta el cliente.', 'error');

    try {
      const p = await Datos.crearPesaje({
        camionId: camionElegido,
        bruto: bruto,
        cliente: cliente,
        barco: $('pesajeBarco').value.trim()
      });

      // El camión se deselecciona a propósito: el siguiente hay que
      // elegirlo a mano, para no colgarle un peso al camión equivocado.
      // El cliente y el barco se quedan, que suelen repetirse.
      camionElegido = null;
      $('pesajeBruto').value = '';

      avisar('Viaje registrado: ' + p.matricula + ' · ' + kg(p.bruto - p.tara) + ' para ' + p.cliente, 'exito');
      await pintarTodo();
    } catch (err) {
      avisar(err.message, 'error');
    }
  });

  /* ---------------------------------------------------------
     REGISTRO
     --------------------------------------------------------- */

  async function pintarRegistro() {
    const todos = await Datos.pesajes();

    const fCliente = $('filtroCliente').value;
    const fBarco = $('filtroBarco').value;
    const fPlaca = normalizarPlaca($('filtroMatricula').value);

    const filtrados = todos.filter(function (p) {
      if (fCliente && p.cliente !== fCliente) return false;
      if (fBarco && p.barco !== fBarco) return false;
      if (fPlaca && p.matricula.indexOf(fPlaca) === -1) return false;
      return true;
    });

    const cuerpo = $('cuerpoRegistro');
    cuerpo.innerHTML = '';
    let total = 0;

    filtrados.forEach(function (p) {
      const neto = p.bruto - p.tara;
      total += neto;

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="hora"></td>' +
        '<td class="placa"></td>' +
        '<td class="cliente"></td>' +
        '<td class="barco"></td>' +
        '<td class="derecha tara"></td>' +
        '<td class="derecha bruto"></td>' +
        '<td class="derecha neto-celda"></td>' +
        '<td><button class="boton boton--fantasma">Borrar</button></td>';

      tr.querySelector('.hora').textContent = hora(p.fecha);
      tr.querySelector('.placa').textContent = p.matricula;
      tr.querySelector('.cliente').textContent = p.cliente;
      tr.querySelector('.barco').textContent = p.barco || '—';
      tr.querySelector('.tara').textContent = kg(p.tara);
      tr.querySelector('.bruto').textContent = kg(p.bruto);
      tr.querySelector('.neto-celda').textContent = kg(neto);

      tr.querySelector('button').addEventListener('click', async function () {
        const ok = await confirmar(
          'Viaje de ' + p.matricula + ' · ' + p.cliente + ' · ' + kg(neto) +
          '. Esto no se puede deshacer.',
          { titulo: 'Borrar viaje', aceptar: 'Borrar' }
        );
        if (!ok) return;
        await Datos.eliminarPesaje(p.id);
        avisar('Viaje borrado.');
        await pintarTodo();
      });

      cuerpo.appendChild(tr);
    });

    $('totalRegistro').textContent = kg(total);
    $('registroVacio').hidden = filtrados.length > 0;
    $('tablaRegistro').hidden = filtrados.length === 0;
    if (filtrados.length === 0) {
      $('registroVacio').textContent = todos.length
        ? 'Ningún viaje coincide con el filtro.'
        : 'Todavía no hay viajes registrados.';
    }
  }

  ['filtroCliente', 'filtroBarco', 'filtroMatricula'].forEach(function (id) {
    $(id).addEventListener('input', pintarRegistro);
  });

  /* ---------- Exportar a Excel (formato CSV) ---------- */

  function descargarCSV(filas) {
    const cabecera = ['Fecha', 'Hora', 'Matricula', 'Cliente', 'Barco', 'Tara (kg)', 'Bruto (kg)', 'Neto (kg)'];
    const lineas = [cabecera.join(';')];

    filas.forEach(function (p) {
      const f = new Date(p.fecha);
      lineas.push([
        f.toLocaleDateString('es-ES'),
        f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        p.matricula,
        '"' + (p.cliente || '').replace(/"/g, '""') + '"',
        '"' + (p.barco || '').replace(/"/g, '""') + '"',
        p.tara,
        p.bruto,
        p.bruto - p.tara
      ].join(';'));
    });

    // El BOM inicial hace que Excel abra bien las tildes.
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = 'pesajes-' + new Date().toISOString().slice(0, 10) + '.csv';
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  $('botonExportar').addEventListener('click', async function () {
    const filas = await Datos.pesajes();
    if (!filas.length) return avisar('No hay nada que exportar todavía.', 'error');
    descargarCSV(filas);
    avisar('Archivo descargado.', 'exito');
  });

  /* ---------- Cerrar jornada ---------- */

  $('botonVaciar').addEventListener('click', async function () {
    const filas = await Datos.pesajes();
    if (!filas.length) return avisar('No hay viajes que cerrar.', 'error');

    const total = filas.reduce(function (suma, p) { return suma + (p.bruto - p.tara); }, 0);

    const ok = await confirmar(
      'Se descargará el Excel con los ' + filas.length + ' viajes (' + kg(total) +
      ') y el registro quedará limpio para mañana. Los camiones y sus taras se quedan ' +
      'dados de alta. Los viajes no se destruyen: quedan archivados por si hiciera falta recuperarlos.',
      { titulo: 'Cerrar jornada', aceptar: 'Descargar y cerrar' }
    );
    if (!ok) return;

    descargarCSV(filas);
    const archivados = await Datos.archivarPesajes();
    avisar('Jornada cerrada: ' + archivados + ' viajes archivados.', 'exito');
    await pintarTodo();
  });

  /* ---------------------------------------------------------
     RESUMEN
     --------------------------------------------------------- */

  async function pintarResumen() {
    const filas = await Datos.pesajes();
    const porCliente = {};
    const porCamion = {};
    let total = 0;

    filas.forEach(function (p) {
      const neto = p.bruto - p.tara;
      total += neto;

      if (!porCliente[p.cliente]) porCliente[p.cliente] = { peso: 0, viajes: 0 };
      porCliente[p.cliente].peso += neto;
      porCliente[p.cliente].viajes++;

      if (!porCamion[p.matricula]) porCamion[p.matricula] = { peso: 0, viajes: 0 };
      porCamion[p.matricula].peso += neto;
      porCamion[p.matricula].viajes++;
    });

    pintarBloque($('resumenClientes'), porCliente, total, 'camión', 'camiones');
    pintarBloque($('resumenCamiones'), porCamion, total, 'viaje', 'viajes');

    $('totalGeneral').textContent = kg(total);
    const nClientes = Object.keys(porCliente).length;
    $('totalGeneralDetalle').textContent =
      filas.length + (filas.length === 1 ? ' viaje' : ' viajes') +
      ' · ' + nClientes + (nClientes === 1 ? ' cliente' : ' clientes');
  }

  function pintarBloque(caja, datos, total, singular, plural) {
    const nombres = Object.keys(datos).sort(function (a, b) {
      return datos[b].peso - datos[a].peso;
    });

    if (!nombres.length) {
      caja.innerHTML = '<p class="vacio">Todavía no hay viajes registrados.</p>';
      return;
    }

    caja.innerHTML = '';
    nombres.forEach(function (nombre) {
      const d = datos[nombre];
      const fila = document.createElement('div');
      fila.className = 'clienteFila';
      fila.innerHTML =
        '<div style="flex:1;min-width:0">' +
          '<div class="clienteFila__nombre"></div>' +
          '<div class="clienteFila__viajes"></div>' +
          '<div class="clienteFila__barra"></div>' +
        '</div>' +
        '<div class="clienteFila__peso"></div>';
      fila.querySelector('.clienteFila__nombre').textContent = nombre;
      fila.querySelector('.clienteFila__viajes').textContent =
        d.viajes + ' ' + (d.viajes === 1 ? singular : plural);
      fila.querySelector('.clienteFila__barra').style.width =
        Math.max(4, (d.peso / total) * 100) + '%';
      fila.querySelector('.clienteFila__peso').textContent = kg(d.peso);
      caja.appendChild(fila);
    });
  }

  /* ---------------------------------------------------------
     Listas de autocompletado y filtros
     --------------------------------------------------------- */

  async function pintarListas() {
    const clientes = await Datos.clientes();
    const barcos = await Datos.barcos();
    rellenarDatalist($('listaClientes'), clientes);
    rellenarDatalist($('listaBarcos'), barcos);
    rellenarFiltro($('filtroCliente'), clientes);
    rellenarFiltro($('filtroBarco'), barcos);
  }

  function rellenarDatalist(lista, valores) {
    lista.innerHTML = '';
    valores.forEach(function (v) {
      const op = document.createElement('option');
      op.value = v;
      lista.appendChild(op);
    });
  }

  function rellenarFiltro(select, valores) {
    const anterior = select.value;
    select.innerHTML = '';
    const vacio = document.createElement('option');
    vacio.value = '';
    vacio.textContent = 'Todos';
    select.appendChild(vacio);
    valores.forEach(function (v) {
      const op = document.createElement('option');
      op.value = v;
      op.textContent = v;
      select.appendChild(op);
    });
    if (valores.indexOf(anterior) !== -1) select.value = anterior;
  }

  /* ---------------------------------------------------------
     Arranque
     --------------------------------------------------------- */

  let pintando = false;
  let repintarDespues = false;

  async function pintarTodo() {
    if (pintando) { repintarDespues = true; return; }
    pintando = true;
    try {
      await pintarListas();
      await pintarCamiones();
      await pintarPesar();
      await pintarRegistro();
      await pintarResumen();
    } finally {
      pintando = false;
      if (repintarDespues) {
        repintarDespues = false;
        await pintarTodo();
      }
    }
  }

  /* ---------------------------------------------------------
     Acceso
     --------------------------------------------------------- */

  function mostrarAcceso(mostrar) {
    $('acceso').hidden = !mostrar;
    document.querySelector('.pestanas').hidden = mostrar;
    document.querySelector('.contenido').hidden = mostrar;
    $('botonSalir').hidden = mostrar;
  }

  $('formAcceso').addEventListener('submit', async function (e) {
    e.preventDefault();
    const boton = $('botonEntrar');
    const error = $('accesoError');
    error.hidden = true;
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    try {
      await Datos.entrar($('accesoCorreo').value.trim(), $('accesoClave').value);
      $('accesoClave').value = '';
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  });

  $('botonSalir').addEventListener('click', async function () {
    const ok = await confirmar(
      'Se cerrará la sesión en este dispositivo. Los datos siguen en la nube.',
      { titulo: 'Cerrar sesión', aceptar: 'Salir' }
    );
    if (!ok) return;
    await Datos.salir();
  });

  /* --------- Rescate de lo apuntado antes de tener nube --------- */

  function revisarDatosLocales() {
    const p = Datos.datosLocalesPendientes();
    $('avisoSubir').hidden = !p;
    if (!p) return;
    $('avisoSubirDetalle').textContent =
      ' — ' + p.camiones + (p.camiones === 1 ? ' camión' : ' camiones') +
      ' y ' + p.pesajes + (p.pesajes === 1 ? ' viaje' : ' viajes') +
      ' que todavía no están en la nube.';
  }

  $('botonDescartar').addEventListener('click', async function () {
    const p = Datos.datosLocalesPendientes();
    if (!p) return;

    const ok = await confirmar(
      'Los ' + p.camiones + ' camiones y ' + p.pesajes + ' viajes de este dispositivo ' +
      'dejarán de aparecer y no se subirán. Se guarda una copia por si acaso, ' +
      'así que se pueden recuperar si resultan hacer falta.',
      { titulo: 'Descartar datos de prueba', aceptar: 'Descartar' }
    );
    if (!ok) return;

    Datos.descartarDatosLocales();
    revisarDatosLocales();
    avisar('Descartados. Ya no volverá a avisarte.');
  });

  $('botonSubir').addEventListener('click', async function () {
    const p = Datos.datosLocalesPendientes();
    if (!p) return;

    const ok = await confirmar(
      'Se subirán ' + p.camiones + ' camiones y ' + p.pesajes + ' viajes de este dispositivo. ' +
      'Los camiones que ya estén en la nube se dejan como están, no se duplican.',
      { titulo: 'Subir datos', aceptar: 'Subir' }
    );
    if (!ok) return;

    this.disabled = true;
    this.textContent = 'Subiendo…';
    try {
      const r = await Datos.subirDatosLocales();
      avisar('Subidos ' + r.camiones + ' camiones y ' + r.pesajes + ' viajes.', 'exito');
      revisarDatosLocales();
      await pintarTodo();
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      this.disabled = false;
      this.textContent = 'Subirlos a la nube';
    }
  });

  /* ---------------------------------------------------------
     Arranque
     --------------------------------------------------------- */

  async function alCambiarSesion(usuario) {
    mostrarAcceso(!usuario);
    $('estadoTexto').textContent = Datos.origen();
    if (usuario) {
      await pintarTodo();
      revisarDatosLocales();
    }
  }

  Datos.suscribir(pintarTodo);
  Datos.alCambiarSesion(alCambiarSesion);

  Datos.iniciar()
    .then(alCambiarSesion)
    .catch(function (e) {
      console.error('No se pudo arrancar:', e);
      mostrarAcceso(true);
      $('accesoError').textContent =
        'No se pudo conectar con la base de datos. Comprueba la cobertura.';
      $('accesoError').hidden = false;
    });

  // Convierte la web en aplicación instalable y le permite funcionar sin
  // cobertura. Solo se activa servida por internet, no abriendo el archivo.
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('No se pudo activar el modo sin conexión:', e);
      });
    });
  }
})();
