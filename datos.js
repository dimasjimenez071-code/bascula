/* =========================================================
   CAPA DE DATOS — versión en la nube
   ---------------------------------------------------------
   Los datos viven ahora en una base de datos compartida, así
   que lo que apunta uno lo ven todos al instante.

   Dos cosas separadas, porque en el muelle funcionan así:
   - CAMIÓN: se pesa vacío UNA vez y su tara queda guardada.
   - PESAJE: cada viaje que hace ese camión cargado.

   El resto de la aplicación sigue hablando con las mismas
   funciones de siempre y no se entera de nada de esto.
   ========================================================= */

const Datos = (function () {
  'use strict';

  const CLAVE_LOCAL = 'bascula.datos.v2';   // lo que quedó guardado en el móvil
  const cliente = window.supabase.createClient(CONFIG.url, CONFIG.clave);

  const suscriptores = [];
  const oyentesSesion = [];

  // Copia en memoria de lo que hay en la nube, para que la pantalla
  // responda al instante sin esperar a internet en cada toque.
  let estado = { camiones: [], pesajes: [], cupos: [], perfiles: [] };
  let usuario = null;
  let canal = null;

  /* ---------------------------------------------------------
     Traducción entre la base de datos y la aplicación
     --------------------------------------------------------- */

  function aCamion(f) {
    return {
      id: f.id,
      matricula: f.matricula,
      tara: f.tara,
      empresa: f.empresa || '',
      fechaTara: f.fecha_tara
    };
  }

  function aPesaje(f) {
    return {
      id: f.id,
      camionId: f.camion_id,
      matricula: f.matricula,
      tara: f.tara,
      bruto: f.bruto,
      cliente: f.cliente,
      barco: f.barco,
      fecha: f.fecha,
      archivado: f.archivado,
      fechaArchivo: f.fecha_archivo,
      operario: f.operario
    };
  }

  function avisar() {
    suscriptores.forEach(function (fn) { fn(); });
  }

  function reventar(error, queHacia) {
    console.error(queHacia, error);
    const m = (error && error.message) || 'Error desconocido';
    if (m.indexOf('Failed to fetch') !== -1 || m.indexOf('NetworkError') !== -1) {
      throw new Error('Sin conexión. Comprueba la cobertura e inténtalo otra vez.');
    }
    if (esDesfaseDeReloj(error)) {
      throw new Error('El servidor ha tardado en aceptar la sesión. Vuelve a intentarlo en unos segundos.');
    }
    throw new Error(m);
  }

  /* A veces las máquinas de Supabase van desacompasadas unas milésimas
     y rechazan un permiso de entrada recién emitido por considerarlo
     "del futuro". Es pasajero: se reintenta solo. */
  function esDesfaseDeReloj(error) {
    const m = ((error && error.message) || '').toLowerCase();
    return m.indexOf('issued at future') !== -1 ||
           m.indexOf('jwt') !== -1 && m.indexOf('future') !== -1;
  }

  function esperar(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /* ---------------------------------------------------------
     Carga y tiempo real
     --------------------------------------------------------- */

  /* Si el fallo es el desfase de relojes de Supabase, se reintenta
     solo un par de veces antes de dar la cara al usuario. */
  async function recargar() {
    const esperas = [0, 1200, 2500];
    for (let i = 0; i < esperas.length; i++) {
      if (esperas[i]) await esperar(esperas[i]);
      try {
        return await recargarUnaVez();
      } catch (e) {
        const ultimo = i === esperas.length - 1;
        if (ultimo || !esDesfaseDeReloj(e)) throw e;
        console.warn('Relojes desacompasados, reintentando…');
      }
    }
  }

  async function recargarUnaVez() {
    // Los perfiles se leen siempre: hacen falta para saber si esta
    // cuenta sigue activa, aunque el resto de tablas la rechacen.
    const perfiles = await cliente.from('perfiles').select('*');
    if (perfiles.error) reventar(perfiles.error, 'cargando usuarios');

    const mio = perfiles.data.find(function (p) {
      return usuario && p.id === usuario.id;
    });

    if (mio && !mio.activo) {
      estado = { camiones: [], pesajes: [], cupos: [], perfiles: perfiles.data };
      avisar();
      return;
    }

    const [camiones, pesajes, cupos] = await Promise.all([
      cliente.from('camiones').select('*'),
      cliente.from('pesajes').select('*'),
      cliente.from('cupos').select('*')
    ]);
    if (camiones.error) reventar(camiones.error, 'cargando camiones');
    if (pesajes.error) reventar(pesajes.error, 'cargando pesajes');
    if (cupos.error) reventar(cupos.error, 'cargando cupos');

    estado = {
      camiones: camiones.data.map(aCamion),
      pesajes: pesajes.data.map(aPesaje),
      cupos: cupos.data,
      perfiles: perfiles.data
    };
    avisar();
  }

  function escucharCambios() {
    if (canal) return;
    canal = cliente
      .channel('bascula')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'camiones' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pesajes' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cupos' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, recargar)
      .subscribe();
  }

  function dejarDeEscuchar() {
    if (!canal) return;
    cliente.removeChannel(canal);
    canal = null;
  }

  /* ---------------------------------------------------------
     API pública
     --------------------------------------------------------- */

  return {

    /* ============ SESIÓN ============ */

    /** Arranque: mira si ya había sesión abierta y, si la hay, carga todo. */
    async iniciar() {
      const { data } = await cliente.auth.getSession();
      usuario = data.session ? data.session.user : null;

      cliente.auth.onAuthStateChange(async function (evento, sesion) {
        const antes = usuario ? usuario.id : null;
        usuario = sesion ? sesion.user : null;
        if ((usuario ? usuario.id : null) === antes) return;

        if (usuario) {
          await recargar();
          escucharCambios();
        } else {
          dejarDeEscuchar();
          estado = { camiones: [], pesajes: [] };
          avisar();
        }
        oyentesSesion.forEach(function (fn) { fn(usuario); });
      });

      if (usuario) {
        await recargar();
        escucharCambios();
      }
      return usuario;
    },

    sesion() { return usuario; },

    async entrar(correo, contrasena) {
      const { data, error } = await cliente.auth.signInWithPassword({
        email: correo, password: contrasena
      });
      if (error) {
        if (error.message.indexOf('Invalid login credentials') !== -1) {
          throw new Error('Usuario o contraseña incorrectos.');
        }
        reventar(error, 'iniciando sesión');
      }
      return data.user;
    },

    async salir() {
      await cliente.auth.signOut();
    },

    alCambiarSesion(fn) { oyentesSesion.push(fn); },

    /* ============ CAMIONES ============ */

    async camiones() {
      return estado.camiones.slice().sort(function (a, b) {
        return a.matricula.localeCompare(b.matricula, 'es');
      });
    },

    async buscarCamion(id) {
      return estado.camiones.find(function (c) { return c.id === id; }) || null;
    },

    async guardarCamion(datos) {
      const existente = estado.camiones.find(function (c) {
        return c.matricula === datos.matricula;
      });

      if (existente) {
        const taraAnterior = existente.tara;
        const { data, error } = await cliente
          .from('camiones')
          .update({
            tara: datos.tara,
            empresa: datos.empresa || '',
            fecha_tara: new Date().toISOString()
          })
          .eq('id', existente.id)
          .select()
          .single();
        if (error) reventar(error, 'actualizando la tara');
        await recargar();
        return { camion: aCamion(data), actualizado: true, taraAnterior: taraAnterior };
      }

      const { data, error } = await cliente
        .from('camiones')
        .insert({
          matricula: datos.matricula,
          tara: datos.tara,
          empresa: datos.empresa || '',
          creado_por: usuario ? usuario.id : null
        })
        .select()
        .single();
      if (error) reventar(error, 'dando de alta el camión');
      await recargar();
      return { camion: aCamion(data), actualizado: false };
    },

    async eliminarCamion(id) {
      const { error } = await cliente.from('camiones').delete().eq('id', id);
      if (error) reventar(error, 'dando de baja el camión');
      await recargar();
    },

    async viajesDeHoy() {
      const cuenta = {};
      estado.pesajes.forEach(function (p) {
        if (p.archivado) return;
        cuenta[p.camionId] = (cuenta[p.camionId] || 0) + 1;
      });
      return cuenta;
    },

    /* ============ PESAJES ============ */

    async pesajes() {
      return estado.pesajes
        .filter(function (p) { return !p.archivado; })
        .sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    },

    async archivados() {
      return estado.pesajes.filter(function (p) { return p.archivado; });
    },

    /** Las jornadas ya cerradas, de la más reciente a la más antigua,
        con su recuento para poder elegirlas de un vistazo. */
    async jornadas() {
      const porDia = {};
      estado.pesajes.forEach(function (p) {
        if (!p.archivado) return;
        const dia = (p.fechaArchivo || p.fecha || '').slice(0, 10);
        if (!dia) return;
        if (!porDia[dia]) porDia[dia] = { dia: dia, viajes: 0, kilos: 0, barcos: new Set() };
        porDia[dia].viajes++;
        porDia[dia].kilos += p.bruto - p.tara;
        if (p.barco) porDia[dia].barcos.add(p.barco);
      });

      return Object.keys(porDia)
        .sort(function (a, b) { return b.localeCompare(a); })
        .map(function (dia) {
          const d = porDia[dia];
          return {
            dia: dia,
            viajes: d.viajes,
            kilos: d.kilos,
            barcos: Array.from(d.barcos)
          };
        });
    },

    /** Los viajes de una jornada cerrada concreta. */
    async pesajesDeJornada(dia) {
      return estado.pesajes
        .filter(function (p) {
          return p.archivado && (p.fechaArchivo || p.fecha || '').slice(0, 10) === dia;
        })
        .sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    },

    async crearPesaje(datos) {
      const camion = estado.camiones.find(function (c) { return c.id === datos.camionId; });
      if (!camion) throw new Error('Ese camión ya no está dado de alta.');
      if (datos.bruto <= camion.tara) {
        throw new Error('El peso cargado (' + datos.bruto + ' kg) tiene que ser mayor que la tara del camión (' + camion.tara + ' kg).');
      }

      const { data, error } = await cliente
        .from('pesajes')
        .insert({
          camion_id: camion.id,
          matricula: camion.matricula,
          tara: camion.tara,
          bruto: datos.bruto,
          cliente: datos.cliente,
          barco: datos.barco || '',
          operario: usuario ? (usuario.email || '') : '',
          operario_id: usuario ? usuario.id : null
        })
        .select()
        .single();
      if (error) reventar(error, 'registrando el viaje');
      await recargar();
      return aPesaje(data);
    },

    /** Corregir un viaje ya registrado. Solo el encargado, por las
        reglas de la base de datos. Si se cambia de camión, se recoge
        también su matrícula y su tara. */
    async editarPesaje(id, cambios) {
      const anterior = estado.pesajes.find(function (p) { return p.id === id; });
      if (!anterior) throw new Error('Ese viaje ya no existe.');

      const camion = cambios.camionId
        ? estado.camiones.find(function (c) { return c.id === cambios.camionId; })
        : null;

      const matricula = camion ? camion.matricula : anterior.matricula;
      const tara = camion ? camion.tara : anterior.tara;
      const bruto = cambios.bruto !== undefined ? cambios.bruto : anterior.bruto;

      if (bruto <= tara) {
        throw new Error('El peso cargado (' + bruto + ' kg) tiene que ser mayor que la tara (' + tara + ' kg).');
      }

      const { data, error } = await cliente
        .from('pesajes')
        .update({
          camion_id: camion ? camion.id : anterior.camionId,
          matricula: matricula,
          tara: tara,
          bruto: bruto,
          cliente: cambios.cliente !== undefined ? cambios.cliente : anterior.cliente,
          barco: cambios.barco !== undefined ? cambios.barco : anterior.barco
        })
        .eq('id', id)
        .select()
        .single();

      if (error) reventar(error, 'corrigiendo el viaje');
      await recargar();
      return aPesaje(data);
    },

    async eliminarPesaje(id) {
      const { error } = await cliente.from('pesajes').delete().eq('id', id);
      if (error) reventar(error, 'borrando el viaje');
      await recargar();
    },

    /** Cierre de jornada: se archivan los viajes y también los cupos,
        para empezar mañana con la hoja en blanco. */
    async archivarPesajes() {
      const abiertos = estado.pesajes.filter(function (p) { return !p.archivado; });
      const sello = new Date().toISOString();

      if (abiertos.length) {
        const { error } = await cliente
          .from('pesajes')
          .update({ archivado: true, fecha_archivo: sello })
          .eq('archivado', false);
        if (error) reventar(error, 'cerrando la jornada');
      }

      if (estado.cupos.some(function (c) { return !c.archivado; })) {
        const { error } = await cliente
          .from('cupos')
          .update({ archivado: true, fecha_archivo: sello })
          .eq('archivado', false);
        if (error) reventar(error, 'cerrando los cupos');
      }

      await recargar();
      return abiertos.length;
    },

    /* ============ CUPOS ============ */

    /** Lo que cada empresa tiene que llevarse en la jornada, con lo
        descargado y lo que falta ya calculado. */
    async cupos() {
      const descargado = {};
      estado.pesajes.forEach(function (p) {
        if (p.archivado) return;
        descargado[p.cliente] = (descargado[p.cliente] || 0) + (p.bruto - p.tara);
      });

      return estado.cupos
        .filter(function (c) { return !c.archivado; })
        .map(function (c) {
          const hecho = descargado[c.cliente] || 0;
          const conCantidad = !!c.kilos;
          return {
            id: c.id,
            cliente: c.cliente,
            kilos: c.kilos,                 // puede venir vacío
            conCantidad: conCantidad,
            barco: c.barco,
            descargado: hecho,
            falta: conCantidad ? Math.max(0, c.kilos - hecho) : null,
            pasado: conCantidad ? Math.max(0, hecho - c.kilos) : 0,
            porcentaje: conCantidad ? Math.min(100, Math.round((hecho / c.kilos) * 100)) : 0
          };
        })
        .sort(function (a, b) { return a.cliente.localeCompare(b.cliente, 'es'); });
    },

    /** Solo los nombres de las empresas del día, para el desplegable
        del pesaje. Así nadie escribe una empresa a mano ni con erratas. */
    async empresas() {
      return estado.cupos
        .filter(function (c) { return !c.archivado; })
        .map(function (c) { return c.cliente; })
        .sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    /** Fija o corrige el cupo de una empresa. */
    async guardarCupo(datos) {
      const abierto = estado.cupos.find(function (c) {
        return !c.archivado && c.cliente === datos.cliente;
      });

      if (abierto) {
        const { error } = await cliente
          .from('cupos')
          .update({ kilos: datos.kilos || null, barco: datos.barco || '' })
          .eq('id', abierto.id);
        if (error) reventar(error, 'actualizando la empresa');
        await recargar();
        return { actualizado: true, anterior: abierto.kilos };
      }

      const { error } = await cliente.from('cupos').insert({
        cliente: datos.cliente,
        kilos: datos.kilos || null,
        barco: datos.barco || '',
        creado_por: usuario ? usuario.id : null
      });
      if (error) reventar(error, 'fijando el cupo');
      await recargar();
      return { actualizado: false };
    },

    async eliminarCupo(id) {
      const { error } = await cliente.from('cupos').delete().eq('id', id);
      if (error) reventar(error, 'quitando el cupo');
      await recargar();
    },

    /* ============ USUARIOS ============ */

    /** La ficha del que está usando la aplicación ahora. */
    miPerfil() {
      if (!usuario) return null;
      return estado.perfiles.find(function (p) { return p.id === usuario.id; }) || null;
    },

    esAdmin() {
      const p = this.miPerfil();
      return !!(p && p.activo && p.rol === 'admin');
    },

    /** Todos los usuarios: los activos primero, y por nombre. */
    async perfiles() {
      return estado.perfiles.slice().sort(function (a, b) {
        if (a.rol !== b.rol) return a.rol === 'admin' ? -1 : 1;
        return (a.correo || '').localeCompare(b.correo || '', 'es', { numeric: true });
      });
    },

    async cambiarActivo(id, activo) {
      const { error } = await cliente.from('perfiles').update({ activo: activo }).eq('id', id);
      if (error) reventar(error, 'cambiando el acceso');
      await recargar();
    },

    async cambiarNombre(id, nombre) {
      const { error } = await cliente.from('perfiles').update({ nombre: nombre }).eq('id', id);
      if (error) reventar(error, 'cambiando el nombre');
      await recargar();
    },

    /* ============ LISTAS DE APOYO ============ */

    async clientes() {
      const vistos = new Set();
      estado.pesajes.forEach(function (p) { if (p.cliente) vistos.add(p.cliente); });
      return Array.from(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    async barcos() {
      const vistos = new Set();
      estado.pesajes.forEach(function (p) { if (p.barco) vistos.add(p.barco); });
      return Array.from(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    suscribir(fn) { suscriptores.push(fn); },

    /* ============ RESCATE DE LO GUARDADO EN EL MÓVIL ============ */

    /** ¿Quedó algo apuntado en este dispositivo antes de tener nube? */
    datosLocalesPendientes() {
      try {
        const d = JSON.parse(localStorage.getItem(CLAVE_LOCAL));
        if (!d) return null;
        const camiones = (d.camiones || []).length;
        const pesajes = (d.pesajes || []).length;
        if (!camiones && !pesajes) return null;
        return { camiones: camiones, pesajes: pesajes };
      } catch (e) {
        return null;
      }
    },

    /** Sube lo que hubiera en este dispositivo. No pisa lo que ya
        esté en la nube: los camiones repetidos se dejan como están. */
    async subirDatosLocales() {
      const d = JSON.parse(localStorage.getItem(CLAVE_LOCAL));
      if (!d) return { camiones: 0, pesajes: 0 };

      const equivalencias = {};
      let nuevosCamiones = 0;

      for (const c of (d.camiones || [])) {
        const yaEsta = estado.camiones.find(function (x) { return x.matricula === c.matricula; });
        if (yaEsta) { equivalencias[c.id] = yaEsta.id; continue; }
        const { data, error } = await cliente
          .from('camiones')
          .insert({
            matricula: c.matricula,
            tara: c.tara,
            fecha_tara: c.fechaTara,
            creado_por: usuario ? usuario.id : null
          })
          .select()
          .single();
        if (error) reventar(error, 'subiendo camiones');
        equivalencias[c.id] = data.id;
        nuevosCamiones++;
      }

      const filas = (d.pesajes || []).map(function (p) {
        return {
          camion_id: equivalencias[p.camionId] || null,
          matricula: p.matricula,
          tara: p.tara,
          bruto: p.bruto,
          cliente: p.cliente,
          barco: p.barco || '',
          fecha: p.fecha,
          archivado: !!p.archivado,
          operario: p.operario || '',
          operario_id: usuario ? usuario.id : null
        };
      });

      if (filas.length) {
        const { error } = await cliente.from('pesajes').insert(filas);
        if (error) reventar(error, 'subiendo viajes');
      }

      // Se guarda una copia por si acaso y se quita el aviso.
      localStorage.setItem('bascula.copia-antes-de-subir', localStorage.getItem(CLAVE_LOCAL));
      localStorage.removeItem(CLAVE_LOCAL);

      await recargar();
      return { camiones: nuevosCamiones, pesajes: filas.length };
    },

    /** Quita el aviso sin subir nada. No destruye los datos: los deja
        en una copia aparte, por si resultan hacer falta después. */
    descartarDatosLocales() {
      const guardado = localStorage.getItem(CLAVE_LOCAL);
      if (guardado) localStorage.setItem('bascula.copia-descartada', guardado);
      localStorage.removeItem(CLAVE_LOCAL);
      avisar();
    },

    /** Qué poner en la esquina de la cabecera. */
    origen() {
      return usuario ? (usuario.email || 'Conectado') : 'Sin conexión';
    }
  };
})();
