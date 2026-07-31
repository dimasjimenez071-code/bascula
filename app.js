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

  $('camionMatricula').addEventListener('blur', async function () {
    this.value = normalizarPlaca(this.value);
    if (!this.value) return;

    // Si el camión ya existe, recuperamos su empresa para no borrársela
    // sin querer al volver a tararlo.
    const camiones = await Datos.camiones();
    const yaEsta = camiones.find(function (c) { return c.matricula === $('camionMatricula').value; });
    if (!yaEsta) return;

    const sel = $('camionEmpresa');
    if (yaEsta.empresa && Array.from(sel.options).some(function (o) { return o.value === yaEsta.empresa; })) {
      sel.value = yaEsta.empresa;
    }
    avisar(yaEsta.matricula + ' ya está dado de alta con ' + kg(yaEsta.tara) + '. Al guardar se actualizará.');
  });

  $('formCamion').addEventListener('submit', async function (e) {
    e.preventDefault();
    const matricula = normalizarPlaca($('camionMatricula').value);
    const tara = parseInt($('camionTara').value, 10);

    if (!matricula) return avisar('Falta la matrícula.', 'error');
    if (!tara || tara <= 0) return avisar('El peso de la tara no es válido.', 'error');

    const empresa = $('camionEmpresa').value;
    const res = await Datos.guardarCamion({ matricula: matricula, tara: tara, empresa: empresa });
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
        (c.empresa ? c.empresa + ' · ' : '') +
        'Tara ' + kg(c.tara) +
        ' · ' + (n === 1 ? '1 viaje hoy' : n + ' viajes hoy');

      const botones = fila.querySelectorAll('button');
      botones[0].addEventListener('click', function () {
        camionElegido = c.id;
        ponerEmpresaDelCamion(c);
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

  /* Al elegir un camión se pone sola su empresa habitual, pero se puede
     cambiar: a veces un camión hace un viaje para otra. */
  function ponerEmpresaDelCamion(camion) {
    if (!camion) return;
    const sel = $('pesajeCliente');
    if (!camion.empresa) return;   // sin empresa fija: se respeta lo que hubiera

    const existe = Array.from(sel.options).some(function (o) {
      return o.value === camion.empresa;
    });

    if (existe) {
      sel.value = camion.empresa;
    } else {
      // Su empresa no está entre las del barco de hoy: mejor que lo elija
      // a mano que colgarle el viaje a la empresa equivocada.
      sel.value = '';
      avisar(camion.empresa + ' no está entre las empresas de hoy. Elige una.', 'error');
    }
  }

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
        (c.empresa ? c.empresa + ' · ' : '') +
        'Tara ' + kg(c.tara) + (n ? ' · ' + n + (n === 1 ? ' viaje' : ' viajes') : '');
      opcion.addEventListener('click', function () {
        camionElegido = c.id;
        ponerEmpresaDelCamion(c);
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
    const esJefe = Datos.esAdmin();

    // Cerrar la jornada solo lo puede hacer el encargado.
    $('botonVaciar').hidden = !esJefe;

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
        '<td class="acciones">' +
          '<button class="boton boton--fantasma boton--azul">Corregir</button>' +
          '<button class="boton boton--fantasma">Borrar</button>' +
        '</td>';

      tr.querySelector('.hora').textContent = hora(p.fecha);
      tr.querySelector('.placa').textContent = p.matricula;
      tr.querySelector('.cliente').textContent = p.cliente;
      tr.querySelector('.barco').textContent = p.barco || '—';
      tr.querySelector('.tara').textContent = kg(p.tara);
      tr.querySelector('.bruto').textContent = kg(p.bruto);
      tr.querySelector('.neto-celda').textContent = kg(neto);

      // Corregir y borrar son cosa del encargado.
      const acciones = tr.querySelectorAll('.acciones button');
      acciones[0].hidden = !esJefe;
      acciones[1].hidden = !esJefe;

      acciones[0].addEventListener('click', function () { abrirEditor(p); });

      acciones[1].addEventListener('click', async function () {
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
     CUPOS: lo que se lleva cada empresa
     --------------------------------------------------------- */

  $('formCupo').addEventListener('submit', async function (e) {
    e.preventDefault();
    const cliente = $('cupoCliente').value.trim();
    const texto = $('cupoKilos').value.trim();
    const kilos = texto ? parseInt(texto, 10) : null;

    if (!cliente) return avisar('Falta el nombre de la empresa.', 'error');
    if (texto && (!kilos || kilos <= 0)) return avisar('Los kilos no son válidos.', 'error');

    try {
      const r = await Datos.guardarCupo({ cliente: cliente, kilos: kilos });
      this.reset();
      $('cupoCliente').focus();
      if (r.actualizado) {
        avisar(cliente + ': ' + (r.anterior ? kg(r.anterior) : 'sin cantidad') + ' → ' + (kilos ? kg(kilos) : 'sin cantidad'), 'exito');
      } else {
        avisar(kilos ? cliente + ' tiene que llevarse ' + kg(kilos) : cliente + ' añadida al barco', 'exito');
      }
      await pintarTodo();
    } catch (err) {
      avisar(err.message, 'error');
    }
  });

  async function pintarCupos() {
    const cupos = await Datos.cupos();
    const caja = $('listaCupos');
    const esJefe = Datos.esAdmin();

    // Registrar las empresas del barco es cosa del encargado.
    $('formCupo').hidden = !esJefe;
    $('ayudaEmpresas').textContent = esJefe
      ? 'Estas son las únicas empresas que se pueden elegir al pesar, para que nadie escriba una a mano y salgan duplicadas por una letra.'
      : 'Las empresas de este barco las registra el encargado. Al pesar solo podrás elegir entre estas.';

    if (!cupos.length) {
      caja.innerHTML = esJefe
        ? '<p class="vacio">Añade arriba las empresas que vienen en este barco.</p>'
        : '<p class="vacio">El encargado todavía no ha registrado las empresas.</p>';
      return;
    }

    caja.innerHTML = '';
    cupos.forEach(function (c) {
      const terminado = c.conCantidad && c.falta === 0;
      const fila = document.createElement('div');
      fila.className = 'cupo' + (terminado ? ' cupo--completo' : '');
      fila.innerHTML =
        '<div class="cupo__cabecera">' +
          '<span class="cupo__nombre"></span>' +
          '<div class="cupo__acciones">' +
            '<button class="boton boton--fantasma boton--pequeno boton--azul" data-accion="cambiar">Cambiar</button>' +
            '<button class="boton boton--fantasma boton--pequeno" data-accion="quitar">Quitar</button>' +
          '</div>' +
        '</div>' +
        '<div class="cupo__barra"><i></i></div>' +
        '<div class="cupo__cifras">' +
          '<span><b class="cupo__hecho"></b> descargado</span>' +
          '<span><b class="cupo__falta"></b> <span class="cupo__faltaTexto"></span></span>' +
          '<span class="cupo__total"></span>' +
        '</div>';

      fila.querySelector('.cupo__nombre').textContent = c.cliente;
      fila.querySelector('.cupo__hecho').textContent = kg(c.descargado);

      if (!c.conCantidad) {
        // Empresa registrada pero sin cantidad asignada todavía.
        fila.querySelector('.cupo__barra').hidden = true;
        fila.querySelector('.cupo__total').textContent = 'sin cantidad asignada';
        fila.querySelector('.cupo__falta').textContent = '';
        fila.querySelector('.cupo__faltaTexto').textContent = '';
      } else {
        fila.querySelector('.cupo__barra i').style.width = c.porcentaje + '%';
        fila.querySelector('.cupo__total').textContent = 'de ' + kg(c.kilos);

        if (c.pasado > 0) {
          fila.querySelector('.cupo__falta').textContent = kg(c.pasado);
          fila.querySelector('.cupo__faltaTexto').textContent = 'de más';
          fila.querySelector('.cupo__falta').classList.add('cupo__pasado');
        } else {
          fila.querySelector('.cupo__falta').textContent = kg(c.falta);
          fila.querySelector('.cupo__faltaTexto').textContent = terminado ? 'pendiente' : 'por descargar';
        }
      }

      // Cambiar la cantidad y quitar la empresa son cosa del encargado.
      fila.querySelector('.cupo__acciones').hidden = !esJefe;

      fila.querySelector('[data-accion="cambiar"]').addEventListener('click', function () {
        $('cupoCliente').value = c.cliente;
        $('cupoKilos').value = c.kilos || '';
        $('formCupo').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('cupoKilos').focus();
        $('cupoKilos').select();
        avisar('Cambia los kilos de ' + c.cliente + ' y dale a Guardar.');
      });

      fila.querySelector('[data-accion="quitar"]').addEventListener('click', async function () {
        const ok = await confirmar(
          c.cliente + ' dejará de aparecer entre las empresas de este barco' +
          (c.descargado > 0
            ? ', pero los ' + kg(c.descargado) + ' ya descargados se quedan en el registro.'
            : '.'),
          { titulo: 'Quitar empresa', aceptar: 'Quitar' }
        );
        if (!ok) return;
        await Datos.eliminarCupo(c.id);
        avisar('Empresa quitada.');
        await pintarTodo();
      });

      caja.appendChild(fila);
    });
  }

  /* ---------------------------------------------------------
     CORREGIR UN VIAJE: solo el encargado
     --------------------------------------------------------- */

  let editando = null;

  async function abrirEditor(pesaje) {
    editando = pesaje;
    const camiones = await Datos.camiones();

    // Camiones disponibles, incluido el del viaje aunque se diera de baja
    const selector = $('editarCamion');
    selector.innerHTML = '';
    let estaElSuyo = false;
    camiones.forEach(function (c) {
      const op = document.createElement('option');
      op.value = c.id;
      op.textContent = c.matricula + ' · tara ' + kg(c.tara);
      selector.appendChild(op);
      if (c.id === pesaje.camionId) estaElSuyo = true;
    });
    if (!estaElSuyo) {
      const op = document.createElement('option');
      op.value = '';
      op.textContent = pesaje.matricula + ' · tara ' + kg(pesaje.tara) + ' (dado de baja)';
      selector.insertBefore(op, selector.firstChild);
    }
    selector.value = estaElSuyo ? pesaje.camionId : '';

    $('editarOriginal').textContent =
      'Tal como está ahora: ' + pesaje.matricula + ' · ' + pesaje.cliente + ' · ' +
      kg(pesaje.bruto - pesaje.tara) + ' (' + hora(pesaje.fecha) + ')';

    $('editarBruto').value = pesaje.bruto;
    $('editarBarco').value = pesaje.barco || '';

    // Si la empresa del viaje ya no está entre las del día, se añade
    // para no perderla al corregir otra cosa.
    const sel = $('editarCliente');
    if (pesaje.cliente && !Array.from(sel.options).some(function (o) { return o.value === pesaje.cliente; })) {
      const op = document.createElement('option');
      op.value = pesaje.cliente;
      op.textContent = pesaje.cliente + ' (ya no está en el barco)';
      sel.appendChild(op);
    }
    sel.value = pesaje.cliente;

    calcularNetoEditor();
    $('modalEditar').hidden = false;
    $('editarBruto').focus();
  }

  function cerrarEditor() {
    $('modalEditar').hidden = true;
    editando = null;
  }

  async function calcularNetoEditor() {
    const bruto = parseInt($('editarBruto').value, 10);
    const idCamion = $('editarCamion').value;
    const camion = idCamion ? await Datos.buscarCamion(idCamion) : null;
    const tara = camion ? camion.tara : (editando ? editando.tara : 0);

    const caja = $('editarCajaNeto');
    const valor = $('editarNeto');
    if (!bruto || !tara) {
      valor.textContent = '—';
      caja.classList.remove('neto--error');
      return;
    }
    const neto = bruto - tara;
    if (neto <= 0) {
      valor.textContent = 'Revisar pesos';
      caja.classList.add('neto--error');
    } else {
      valor.textContent = kg(neto);
      caja.classList.remove('neto--error');
    }
  }

  $('editarBruto').addEventListener('input', calcularNetoEditor);
  $('editarCamion').addEventListener('change', calcularNetoEditor);
  $('editarCancelar').addEventListener('click', cerrarEditor);
  $('modalEditar').addEventListener('click', function (e) {
    if (e.target === $('modalEditar')) cerrarEditor();
  });

  $('formEditar').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!editando) return;

    const bruto = parseInt($('editarBruto').value, 10);
    const cliente = $('editarCliente').value;
    if (!bruto || bruto <= 0) return avisar('El peso cargado no es válido.', 'error');
    if (!cliente) return avisar('Falta el cliente.', 'error');

    try {
      const p = await Datos.editarPesaje(editando.id, {
        camionId: $('editarCamion').value || undefined,
        bruto: bruto,
        cliente: cliente,
        barco: $('editarBarco').value.trim()
      });
      cerrarEditor();
      avisar('Viaje corregido: ' + p.matricula + ' · ' + kg(p.bruto - p.tara), 'exito');
      await pintarTodo();
    } catch (err) {
      avisar(err.message, 'error');
    }
  });

  /* ---------------------------------------------------------
     USUARIOS: solo lo ve el jefe
     --------------------------------------------------------- */

  async function pintarUsuarios() {
    const esJefe = Datos.esAdmin();
    $('pestanaUsuarios').hidden = !esJefe;
    if (!esJefe) return;

    const perfiles = await Datos.perfiles();
    const yo = Datos.miPerfil();
    const caja = $('listaUsuarios');
    caja.innerHTML = '';

    perfiles.forEach(function (p) {
      const esJefeEste = p.rol === 'admin';
      const soyYo = yo && p.id === yo.id;

      const fila = document.createElement('div');
      fila.className = 'usuario' + (p.activo ? ' usuario--activo' : '');
      fila.innerHTML =
        '<div class="usuario__datos">' +
          '<div class="usuario__correo"></div>' +
          '<input type="text" class="usuario__nombre" placeholder="Nombre de la persona" maxlength="40">' +
        '</div>' +
        '<div class="usuario__control"></div>';

      fila.querySelector('.usuario__correo').textContent = p.correo || '(sin correo)';

      const nombre = fila.querySelector('.usuario__nombre');
      nombre.value = p.nombre || '';
      nombre.addEventListener('change', async function () {
        try {
          await Datos.cambiarNombre(p.id, this.value.trim());
          avisar('Nombre guardado.');
        } catch (err) {
          avisar(err.message, 'error');
        }
      });

      const control = fila.querySelector('.usuario__control');

      if (esJefeEste) {
        control.innerHTML = '<span class="etiquetaJefe">Encargado</span>';
        if (soyYo) nombre.placeholder = 'Tu nombre';
      } else {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'interruptor' + (p.activo ? ' encendido' : '');
        boton.setAttribute('aria-label', p.activo ? 'Desactivar' : 'Activar');
        boton.innerHTML = '<span class="interruptor__bola"></span>';
        boton.addEventListener('click', async function () {
          boton.disabled = true;
          try {
            await Datos.cambiarActivo(p.id, !p.activo);
            avisar((p.correo || 'Usuario') + (p.activo ? ' desactivado.' : ' activado.'), 'exito');
            await pintarTodo();
          } catch (err) {
            avisar(err.message, 'error');
            boton.disabled = false;
          }
        });
        control.appendChild(boton);
      }

      caja.appendChild(fila);
    });
  }

  /* ---------------------------------------------------------
     Listas de autocompletado y filtros
     --------------------------------------------------------- */

  async function pintarListas() {
    const clientes = await Datos.clientes();
    const barcos = await Datos.barcos();
    const empresas = await Datos.empresas();

    rellenarDatalist($('listaBarcos'), barcos);
    rellenarFiltro($('filtroCliente'), clientes);
    rellenarFiltro($('filtroBarco'), barcos);

    // El cliente ya no se escribe: se elige entre las del día.
    rellenarSelect($('pesajeCliente'), empresas, 'Elige la empresa…');
    rellenarSelect($('editarCliente'), empresas, 'Elige la empresa…');
    rellenarSelect($('camionEmpresa'), empresas, 'Sin empresa fija');
    $('sinEmpresas').hidden = empresas.length > 0;
  }

  function rellenarSelect(select, valores, textoVacio) {
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
      revisarSiEstoyActivo();
      await pintarListas();
      await pintarCamiones();
      await pintarPesar();
      await pintarRegistro();
      await pintarResumen();
      await pintarCupos();
      await pintarUsuarios();
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
      { titulo: 'Descartar datos', aceptar: 'Descartar' }
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

  /* Si el jefe apaga esta cuenta mientras está abierta, la pantalla
     se bloquea sola en cuanto llega el aviso. */
  function revisarSiEstoyActivo() {
    const perfil = Datos.miPerfil();
    const bloqueado = !!(perfil && !perfil.activo);
    $('desactivado').hidden = !bloqueado;
    if (bloqueado) {
      document.querySelector('.pestanas').hidden = true;
      document.querySelector('.contenido').hidden = true;
    }
  }

  $('botonSalirDesactivado').addEventListener('click', async function () {
    await Datos.salir();
    $('desactivado').hidden = true;
  });

  async function alCambiarSesion(usuario) {
    mostrarAcceso(!usuario);
    if (!usuario) $('desactivado').hidden = true;
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
