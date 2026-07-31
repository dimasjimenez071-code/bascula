/* =========================================================
   BÁSCULA — lógica de la interfaz
   Habla solo con el objeto Datos (datos.js). No sabe ni le
   importa dónde se guardan los pesajes.
   ========================================================= */

(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  let camionElegido = null;

  /* ---------------------------------------------------------
     Utilidades de formato
     --------------------------------------------------------- */

  const kg = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return new Intl.NumberFormat('es-ES').format(Math.round(n)) + ' kg';
  };

  const hora = function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const fechaHora = function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Deja la matrícula siempre igual: mayúsculas y un solo espacio.
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
    }, tipo === 'error' ? 5000 : 2800);
  }

  /* ---------------------------------------------------------
     Confirmación propia
     ---------------------------------------------------------
     No usamos el confirm() del navegador: muchos navegadores y
     paneles lo bloquean en silencio y devuelven "no" sin
     preguntar nada, así que el borrado nunca llegaba a pasar.
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
     1. TARA
     --------------------------------------------------------- */

  $('taraMatricula').addEventListener('blur', function () {
    this.value = normalizarPlaca(this.value);
  });

  $('formTara').addEventListener('submit', async function (e) {
    e.preventDefault();
    const matricula = normalizarPlaca($('taraMatricula').value);
    const tara = parseInt($('taraPeso').value, 10);

    if (!matricula) return avisar('Falta la matrícula.', 'error');
    if (!tara || tara <= 0) return avisar('El peso de la tara no es válido.', 'error');

    try {
      await Datos.crearTara({
        matricula: matricula,
        tara: tara,
        barco: $('taraBarco').value.trim()
      });
      const barcoRecordado = $('taraBarco').value;
      this.reset();
      $('taraBarco').value = barcoRecordado; // el barco suele repetirse todo el día
      $('taraMatricula').focus();
      avisar('Tara de ' + matricula + ' guardada: ' + kg(tara), 'exito');
      await pintarTodo();
    } catch (err) {
      avisar(err.message, 'error');
    }
  });

  async function pintarPendientes() {
    const pendientes = await Datos.pendientes();
    const caja = $('listaPendientes');
    $('contadorPendientes').textContent = pendientes.length;

    const chincheta = $('chinchetaPendientes');
    chincheta.textContent = pendientes.length;
    chincheta.hidden = pendientes.length === 0;

    if (!pendientes.length) {
      caja.innerHTML = '<p class="vacio">Ningún camión esperando carga.</p>';
      return;
    }

    caja.innerHTML = '';
    pendientes.forEach(function (p) {
      const fila = document.createElement('div');
      fila.className = 'pendiente';
      fila.innerHTML =
        '<div>' +
          '<div class="pendiente__placa"></div>' +
          '<div class="pendiente__datos"></div>' +
        '</div>' +
        '<div class="pendiente__acciones">' +
          '<button class="boton boton--secundario boton--pequeno">Cargar</button>' +
          '<button class="boton boton--fantasma">Anular</button>' +
        '</div>';

      fila.querySelector('.pendiente__placa').textContent = p.matricula;
      fila.querySelector('.pendiente__datos').textContent =
        'Tara ' + kg(p.tara) + ' · entrada ' + hora(p.fechaTara) + (p.barco ? ' · ' + p.barco : '');

      const botones = fila.querySelectorAll('button');
      botones[0].addEventListener('click', function () {
        camionElegido = p.id;
        irA('carga');
        pintarCarga();
      });
      botones[1].addEventListener('click', async function () {
        const ok = await confirmar(
          'Se borrará la tara de ' + p.matricula + ' (' + kg(p.tara) + ') y habrá que volver a pesar el camión.',
          { titulo: 'Anular tara', aceptar: 'Anular' }
        );
        if (!ok) return;
        await Datos.eliminar(p.id);
        avisar('Tara anulada.');
        await pintarTodo();
      });

      caja.appendChild(fila);
    });
  }

  /* ---------------------------------------------------------
     2. CARGA
     --------------------------------------------------------- */

  async function pintarCarga() {
    const pendientes = await Datos.pendientes();
    const hay = pendientes.length > 0;
    $('sinPendientes').hidden = hay;
    $('formCarga').hidden = !hay;
    if (!hay) return;

    // Si el camión elegido ya no está pendiente, olvidarlo.
    if (!pendientes.some(function (p) { return p.id === camionElegido; })) camionElegido = null;

    const selector = $('selectorCamiones');
    selector.innerHTML = '';
    pendientes.forEach(function (p) {
      const opcion = document.createElement('button');
      opcion.type = 'button';
      opcion.className = 'selector__opcion' + (p.id === camionElegido ? ' elegida' : '');
      opcion.innerHTML = '<span class="selector__placa"></span><span class="selector__meta"></span>';
      opcion.querySelector('.selector__placa').textContent = p.matricula;
      opcion.querySelector('.selector__meta').textContent = 'Tara ' + kg(p.tara);
      opcion.addEventListener('click', function () {
        camionElegido = p.id;
        pintarCarga();
        $('cargaPeso').focus();
      });
      selector.appendChild(opcion);
    });

    const elegido = pendientes.find(function (p) { return p.id === camionElegido; });
    $('resumenTara').hidden = !elegido;
    if (elegido) {
      $('resumenTaraValor').textContent = kg(elegido.tara);
      $('resumenTaraHora').textContent = hora(elegido.fechaTara);
    }
    calcularNeto();
  }

  function calcularNeto() {
    const caja = $('cajaNeto');
    const valor = $('netoValor');
    const bruto = parseInt($('cargaPeso').value, 10);

    Datos.pendientes().then(function (pendientes) {
      const elegido = pendientes.find(function (p) { return p.id === camionElegido; });
      if (!elegido || !bruto) {
        valor.textContent = '—';
        caja.classList.remove('neto--error');
        return;
      }
      const neto = bruto - elegido.tara;
      if (neto <= 0) {
        valor.textContent = 'Revisar pesos';
        caja.classList.add('neto--error');
      } else {
        valor.textContent = kg(neto);
        caja.classList.remove('neto--error');
      }
    });
  }

  $('cargaPeso').addEventListener('input', calcularNeto);

  $('formCarga').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!camionElegido) return avisar('Elige primero el camión.', 'error');

    const bruto = parseInt($('cargaPeso').value, 10);
    const cliente = $('cargaCliente').value.trim();
    if (!bruto || bruto <= 0) return avisar('El peso cargado no es válido.', 'error');
    if (!cliente) return avisar('Falta el cliente.', 'error');

    try {
      const p = await Datos.completar(camionElegido, { bruto: bruto, cliente: cliente });
      camionElegido = null;
      this.reset();
      avisar('Pesaje cerrado: ' + kg(p.bruto - p.tara) + ' para ' + p.cliente, 'exito');
      await pintarTodo();
    } catch (err) {
      avisar(err.message, 'error');
    }
  });

  /* ---------------------------------------------------------
     3. REGISTRO
     --------------------------------------------------------- */

  async function pintarRegistro() {
    const todos = await Datos.completados();

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
        '<td class="fecha"></td>' +
        '<td class="placa"></td>' +
        '<td class="cliente"></td>' +
        '<td class="barco"></td>' +
        '<td class="derecha tara"></td>' +
        '<td class="derecha bruto"></td>' +
        '<td class="derecha neto-celda"></td>' +
        '<td><button class="boton boton--fantasma">Borrar</button></td>';

      tr.querySelector('.fecha').textContent = fechaHora(p.fechaBruto);
      tr.querySelector('.placa').textContent = p.matricula;
      tr.querySelector('.cliente').textContent = p.cliente;
      tr.querySelector('.barco').textContent = p.barco || '—';
      tr.querySelector('.tara').textContent = kg(p.tara);
      tr.querySelector('.bruto').textContent = kg(p.bruto);
      tr.querySelector('.neto-celda').textContent = kg(neto);

      tr.querySelector('button').addEventListener('click', async function () {
        const ok = await confirmar(
          'Pesaje de ' + p.matricula + ' · ' + p.cliente + ' · ' + kg(neto) +
          '. Esto no se puede deshacer.',
          { titulo: 'Borrar pesaje', aceptar: 'Borrar' }
        );
        if (!ok) return;
        await Datos.eliminar(p.id);
        avisar('Pesaje borrado.');
        await pintarTodo();
      });

      cuerpo.appendChild(tr);
    });

    $('totalRegistro').textContent = kg(total);
    $('registroVacio').hidden = filtrados.length > 0;
    $('tablaRegistro').hidden = filtrados.length === 0;
    if (filtrados.length === 0) {
      $('registroVacio').textContent = todos.length
        ? 'Ningún pesaje coincide con el filtro.'
        : 'Todavía no hay pesajes cerrados.';
    }
  }

  ['filtroCliente', 'filtroBarco', 'filtroMatricula'].forEach(function (id) {
    $(id).addEventListener('input', pintarRegistro);
  });

  /* ---------- Exportar a Excel (formato CSV) ---------- */

  function descargarCSV(filas) {
    const cabecera = ['Fecha entrada', 'Fecha salida', 'Matricula', 'Cliente', 'Barco', 'Tara (kg)', 'Bruto (kg)', 'Neto (kg)'];
    const lineas = [cabecera.join(';')];

    filas.forEach(function (p) {
      lineas.push([
        fechaHora(p.fechaTara),
        fechaHora(p.fechaBruto),
        p.matricula,
        '"' + (p.cliente || '').replace(/"/g, '""') + '"',
        '"' + (p.barco || '').replace(/"/g, '""') + '"',
        p.tara,
        p.bruto,
        p.bruto - p.tara
      ].join(';'));
    });

    // El BOM inicial hace que Excel abra las tildes correctamente.
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = 'pesajes-' + new Date().toISOString().slice(0, 10) + '.csv';
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  $('botonExportar').addEventListener('click', async function () {
    const filas = await Datos.completados();
    if (!filas.length) return avisar('No hay nada que exportar todavía.', 'error');
    descargarCSV(filas);
    avisar('Archivo descargado.', 'exito');
  });

  /* ---------- Cerrar jornada: descargar el Excel y vaciar el registro ---------- */

  $('botonVaciar').addEventListener('click', async function () {
    const filas = await Datos.completados();
    if (!filas.length) return avisar('No hay pesajes que cerrar.', 'error');

    const total = filas.reduce(function (suma, p) { return suma + (p.bruto - p.tara); }, 0);
    const pendientes = await Datos.pendientes();

    const camiones = pendientes.length === 1
      ? 'Hay 1 camión pendiente de cargar y se queda como está.'
      : 'Hay ' + pendientes.length + ' camiones pendientes de cargar y se quedan como están.';

    const ok = await confirmar(
      'Se descargará el Excel con los ' + filas.length + ' pesajes (' + kg(total) +
      ') y el registro quedará limpio para mañana. ' +
      (pendientes.length ? camiones + ' ' : '') +
      'Los pesajes no se destruyen: quedan archivados por si hiciera falta recuperarlos.',
      { titulo: 'Cerrar jornada', aceptar: 'Descargar y cerrar' }
    );
    if (!ok) return;

    descargarCSV(filas);
    const archivados = await Datos.archivarCompletados();
    avisar('Jornada cerrada: ' + archivados + ' pesajes archivados.', 'exito');
    await pintarTodo();
  });

  /* ---------------------------------------------------------
     4. RESUMEN
     --------------------------------------------------------- */

  async function pintarResumen() {
    const filas = await Datos.completados();
    const porCliente = {};
    let total = 0;

    filas.forEach(function (p) {
      const neto = p.bruto - p.tara;
      total += neto;
      if (!porCliente[p.cliente]) porCliente[p.cliente] = { peso: 0, viajes: 0 };
      porCliente[p.cliente].peso += neto;
      porCliente[p.cliente].viajes++;
    });

    const caja = $('resumenClientes');
    const nombres = Object.keys(porCliente).sort(function (a, b) {
      return porCliente[b].peso - porCliente[a].peso;
    });

    if (!nombres.length) {
      caja.innerHTML = '<p class="vacio">Todavía no hay pesajes cerrados.</p>';
    } else {
      caja.innerHTML = '';
      nombres.forEach(function (nombre) {
        const d = porCliente[nombre];
        const fila = document.createElement('div');
        fila.className = 'clienteFila';
        fila.innerHTML =
          '<div style="flex:1">' +
            '<div class="clienteFila__nombre"></div>' +
            '<div class="clienteFila__viajes"></div>' +
            '<div class="clienteFila__barra"></div>' +
          '</div>' +
          '<div class="clienteFila__peso"></div>';
        fila.querySelector('.clienteFila__nombre').textContent = nombre;
        fila.querySelector('.clienteFila__viajes').textContent =
          d.viajes + (d.viajes === 1 ? ' camión' : ' camiones');
        fila.querySelector('.clienteFila__barra').style.width =
          Math.max(4, (d.peso / total) * 100) + '%';
        fila.querySelector('.clienteFila__peso').textContent = kg(d.peso);
        caja.appendChild(fila);
      });
    }

    $('totalGeneral').textContent = kg(total);
    $('totalGeneralDetalle').textContent =
      filas.length + (filas.length === 1 ? ' pesaje' : ' pesajes') +
      ' · ' + nombres.length + (nombres.length === 1 ? ' cliente' : ' clientes');
  }

  /* ---------------------------------------------------------
     Listas de autocompletado y filtros
     --------------------------------------------------------- */

  async function pintarListas() {
    const clientes = await Datos.clientes();
    const barcos = await Datos.barcos();

    $('listaClientes').innerHTML = clientes.map(function (c) {
      return '<option></option>';
    }).join('');
    Array.from($('listaClientes').children).forEach(function (op, i) { op.value = clientes[i]; });

    $('listaBarcos').innerHTML = barcos.map(function () { return '<option></option>'; }).join('');
    Array.from($('listaBarcos').children).forEach(function (op, i) { op.value = barcos[i]; });

    rellenarFiltro($('filtroCliente'), clientes, 'Todos');
    rellenarFiltro($('filtroBarco'), barcos, 'Todos');
  }

  function rellenarFiltro(select, valores, textoVacio) {
    const anterior = select.value;
    select.innerHTML = '';
    const vacio = document.createElement('option');
    vacio.value = '';
    vacio.textContent = textoVacio;
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

  // Dos repintados a la vez pueden pisarse y dejar en pantalla datos viejos.
  // Con esto solo se pinta uno cada vez; si llegan avisos mientras tanto,
  // se repinta una sola vez al terminar, ya con los datos definitivos.
  let pintando = false;
  let repintarDespues = false;

  async function pintarTodo() {
    if (pintando) { repintarDespues = true; return; }
    pintando = true;
    try {
      await pintarListas();
      await pintarPendientes();
      await pintarCarga();
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

  $('estadoTexto').textContent = Datos.origen;
  Datos.suscribir(pintarTodo);
  pintarTodo();

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
