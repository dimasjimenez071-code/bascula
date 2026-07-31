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
  let estado = { camiones: [], pesajes: [] };
  let usuario = null;
  let canal = null;

  /* ---------------------------------------------------------
     Traducción entre la base de datos y la aplicación
     --------------------------------------------------------- */

  function aCamion(f) {
    return { id: f.id, matricula: f.matricula, tara: f.tara, fechaTara: f.fecha_tara };
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
    throw new Error(m);
  }

  /* ---------------------------------------------------------
     Carga y tiempo real
     --------------------------------------------------------- */

  async function recargar() {
    const [camiones, pesajes] = await Promise.all([
      cliente.from('camiones').select('*'),
      cliente.from('pesajes').select('*')
    ]);
    if (camiones.error) reventar(camiones.error, 'cargando camiones');
    if (pesajes.error) reventar(pesajes.error, 'cargando pesajes');

    estado = {
      camiones: camiones.data.map(aCamion),
      pesajes: pesajes.data.map(aPesaje)
    };
    avisar();
  }

  function escucharCambios() {
    if (canal) return;
    canal = cliente
      .channel('bascula')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'camiones' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pesajes' }, recargar)
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
          .update({ tara: datos.tara, fecha_tara: new Date().toISOString() })
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

    async eliminarPesaje(id) {
      const { error } = await cliente.from('pesajes').delete().eq('id', id);
      if (error) reventar(error, 'borrando el viaje');
      await recargar();
    },

    async archivarPesajes() {
      const abiertos = estado.pesajes.filter(function (p) { return !p.archivado; });
      if (!abiertos.length) return 0;

      const { error } = await cliente
        .from('pesajes')
        .update({ archivado: true, fecha_archivo: new Date().toISOString() })
        .eq('archivado', false);
      if (error) reventar(error, 'cerrando la jornada');
      await recargar();
      return abiertos.length;
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

    /** Qué poner en la esquina de la cabecera. */
    origen() {
      return usuario ? (usuario.email || 'Conectado') : 'Sin conexión';
    }
  };
})();
