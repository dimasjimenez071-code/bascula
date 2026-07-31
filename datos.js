/* =========================================================
   CAPA DE DATOS
   ---------------------------------------------------------
   Dos cosas separadas, porque en el muelle funcionan así:

   - CAMIÓN: se pesa vacío UNA vez y su tara queda guardada.
   - PESAJE: cada viaje que hace ese camión cargado. Un camión
     tiene todos los pesajes que haga en el día.

   Este es el único archivo que cambiará cuando pasemos a la
   base de datos en la nube. El resto de la aplicación habla
   solo con estas funciones.
   ========================================================= */

const Datos = (function () {
  'use strict';

  const CLAVE = 'bascula.datos.v2';
  const CLAVE_ANTIGUA = 'bascula.pesajes.v1';
  const suscriptores = [];

  /* ---------- utilidades internas ---------- */

  function vacio() {
    return { camiones: [], pesajes: [] };
  }

  function leerTodo() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE));
      if (guardado && guardado.camiones && guardado.pesajes) return guardado;
    } catch (e) {
      console.error('No se pudo leer el almacén local:', e);
    }
    return migrarDesdeVersionAntigua();
  }

  /* Los datos de la primera versión se aprovechan en lugar de perderse:
     cada matrícula pasa a ser un camión con su tara, y cada pesaje que
     estuviera cerrado pasa a ser un viaje de ese camión. */
  function migrarDesdeVersionAntigua() {
    const nuevo = vacio();
    let antiguos;
    try {
      antiguos = JSON.parse(localStorage.getItem(CLAVE_ANTIGUA));
    } catch (e) {
      antiguos = null;
    }
    if (!Array.isArray(antiguos) || !antiguos.length) return nuevo;

    antiguos.forEach(function (p) {
      let camion = nuevo.camiones.find(function (c) { return c.matricula === p.matricula; });
      if (!camion) {
        camion = {
          id: nuevoId(),
          matricula: p.matricula,
          tara: p.tara,
          fechaTara: p.fechaTara || new Date().toISOString()
        };
        nuevo.camiones.push(camion);
      }
      if (p.estado === 'completado' && p.bruto) {
        nuevo.pesajes.push({
          id: p.id || nuevoId(),
          camionId: camion.id,
          matricula: p.matricula,
          tara: p.tara,
          bruto: p.bruto,
          cliente: p.cliente || '',
          barco: p.barco || '',
          fecha: p.fechaBruto || p.fechaTara,
          archivado: !!p.archivado,
          operario: p.operarioBruto || ''
        });
      }
    });

    localStorage.setItem(CLAVE, JSON.stringify(nuevo));
    return nuevo;
  }

  function escribirTodo(datos) {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
    avisar();
  }

  function avisar() {
    suscriptores.forEach(function (fn) { fn(); });
  }

  function nuevoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- API pública ---------- */

  return {

    /* ============ CAMIONES ============ */

    /** Todos los camiones dados de alta, por orden alfabético de matrícula. */
    async camiones() {
      return leerTodo().camiones.slice().sort(function (a, b) {
        return a.matricula.localeCompare(b.matricula, 'es');
      });
    },

    async buscarCamion(id) {
      return leerTodo().camiones.find(function (c) { return c.id === id; }) || null;
    },

    /** Da de alta un camión o actualiza su tara si ya existía.
        Devuelve {camion, actualizado} para poder avisar de cuál fue el caso. */
    async guardarCamion(datos) {
      const todo = leerTodo();
      const existente = todo.camiones.find(function (c) {
        return c.matricula === datos.matricula;
      });

      if (existente) {
        const taraAnterior = existente.tara;
        existente.tara = datos.tara;
        existente.fechaTara = new Date().toISOString();
        escribirTodo(todo);
        return { camion: existente, actualizado: true, taraAnterior: taraAnterior };
      }

      const camion = {
        id: nuevoId(),
        matricula: datos.matricula,
        tara: datos.tara,
        fechaTara: new Date().toISOString()
      };
      todo.camiones.push(camion);
      escribirTodo(todo);
      return { camion: camion, actualizado: false };
    },

    /** Da de baja un camión. Sus pesajes ya hechos NO se tocan:
        guardan su propia copia de la matrícula y de la tara. */
    async eliminarCamion(id) {
      const todo = leerTodo();
      todo.camiones = todo.camiones.filter(function (c) { return c.id !== id; });
      escribirTodo(todo);
    },

    /** Cuántos viajes lleva hoy cada camión. */
    async viajesDeHoy() {
      const todo = leerTodo();
      const cuenta = {};
      todo.pesajes.forEach(function (p) {
        if (p.archivado) return;
        cuenta[p.camionId] = (cuenta[p.camionId] || 0) + 1;
      });
      return cuenta;
    },

    /* ============ PESAJES ============ */

    /** Pesajes de la jornada en curso, del más reciente al más antiguo. */
    async pesajes() {
      return leerTodo().pesajes
        .filter(function (p) { return !p.archivado; })
        .sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    },

    async archivados() {
      return leerTodo().pesajes.filter(function (p) { return p.archivado; });
    },

    /** Registra un viaje: el camión sale cargado y se pesa.
        Se guarda una copia de la tara usada, para que si mañana se
        vuelve a tarar el camión los pesajes de hoy no cambien. */
    async crearPesaje(datos) {
      const todo = leerTodo();
      const camion = todo.camiones.find(function (c) { return c.id === datos.camionId; });
      if (!camion) throw new Error('Ese camión ya no está dado de alta.');
      if (datos.bruto <= camion.tara) {
        throw new Error('El peso cargado (' + datos.bruto + ' kg) tiene que ser mayor que la tara del camión (' + camion.tara + ' kg).');
      }

      const pesaje = {
        id: nuevoId(),
        camionId: camion.id,
        matricula: camion.matricula,
        tara: camion.tara,
        bruto: datos.bruto,
        cliente: datos.cliente,
        barco: datos.barco || '',
        fecha: new Date().toISOString(),
        archivado: false,
        operario: datos.operario || ''
      };

      todo.pesajes.push(pesaje);
      escribirTodo(todo);
      return pesaje;
    },

    async eliminarPesaje(id) {
      const todo = leerTodo();
      todo.pesajes = todo.pesajes.filter(function (p) { return p.id !== id; });
      escribirTodo(todo);
    },

    /** Cierre de jornada: los pesajes dejan de salir en el registro pero
        NO se destruyen, quedan archivados por si hay que recuperarlos.
        Los camiones y sus taras se quedan como están para mañana. */
    async archivarPesajes() {
      const todo = leerTodo();
      const sello = new Date().toISOString();
      let cuantos = 0;
      todo.pesajes.forEach(function (p) {
        if (!p.archivado) {
          p.archivado = true;
          p.fechaArchivo = sello;
          cuantos++;
        }
      });
      escribirTodo(todo);
      return cuantos;
    },

    /* ============ LISTAS DE APOYO ============ */

    async clientes() {
      const vistos = new Set();
      leerTodo().pesajes.forEach(function (p) { if (p.cliente) vistos.add(p.cliente); });
      return Array.from(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    async barcos() {
      const vistos = new Set();
      leerTodo().pesajes.forEach(function (p) { if (p.barco) vistos.add(p.barco); });
      return Array.from(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    suscribir(fn) {
      suscriptores.push(fn);
      window.addEventListener('storage', function (e) {
        if (e.key === CLAVE) fn();
      });
    },

    origen: 'Este dispositivo'
  };
})();
