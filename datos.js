/* =========================================================
   CAPA DE DATOS
   ---------------------------------------------------------
   Este es el ÚNICO archivo que habrá que cambiar cuando
   pasemos a la base de datos en la nube. Todo lo demás de la
   aplicación habla solo con estas funciones, así que no se
   entera de dónde se guardan las cosas.
   ========================================================= */

const Datos = (function () {
  'use strict';

  const CLAVE = 'bascula.pesajes.v1';
  const suscriptores = [];

  /* ---------- utilidades internas ---------- */

  function leerTodo() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE)) || [];
    } catch (e) {
      console.error('No se pudo leer el almacén local:', e);
      return [];
    }
  }

  function escribirTodo(lista) {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
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
    /** Todos los pesajes, del más reciente al más antiguo. */
    async listar() {
      return leerTodo().sort(function (a, b) {
        return (b.fechaTara || '').localeCompare(a.fechaTara || '');
      });
    },

    /** Camiones que ya tienen tara pero aún no han salido cargados.
        En orden de llegada: el que lleva más tiempo esperando, primero. */
    async pendientes() {
      return (await this.listar())
        .filter(function (p) { return p.estado === 'pendiente'; })
        .sort(function (a, b) { return (a.fechaTara || '').localeCompare(b.fechaTara || ''); });
    },

    /** Pesajes ya cerrados (tara + bruto). */
    async completados() {
      return (await this.listar()).filter(function (p) { return p.estado === 'completado'; });
    },

    /** Primer paso: el camión entra vacío y se pesa. */
    async crearTara(datos) {
      const lista = leerTodo();

      // Un mismo camión no puede tener dos taras abiertas a la vez.
      const abierto = lista.find(function (p) {
        return p.estado === 'pendiente' && p.matricula === datos.matricula;
      });
      if (abierto) {
        throw new Error('El camión ' + datos.matricula + ' ya tiene una tara pendiente de cargar.');
      }

      const pesaje = {
        id: nuevoId(),
        matricula: datos.matricula,
        barco: datos.barco || '',
        tara: datos.tara,
        fechaTara: new Date().toISOString(),
        bruto: null,
        cliente: '',
        fechaBruto: null,
        estado: 'pendiente',
        operarioTara: datos.operario || ''
      };

      lista.push(pesaje);
      escribirTodo(lista);
      return pesaje;
    },

    /** Segundo paso: el camión sale cargado y se vuelve a pesar. */
    async completar(id, datos) {
      const lista = leerTodo();
      const pesaje = lista.find(function (p) { return p.id === id; });
      if (!pesaje) throw new Error('No se encuentra ese pesaje.');
      if (pesaje.estado === 'completado') throw new Error('Ese pesaje ya estaba cerrado.');
      if (datos.bruto <= pesaje.tara) {
        throw new Error('El peso cargado (' + datos.bruto + ' kg) tiene que ser mayor que la tara (' + pesaje.tara + ' kg).');
      }

      pesaje.bruto = datos.bruto;
      pesaje.cliente = datos.cliente;
      pesaje.fechaBruto = new Date().toISOString();
      pesaje.estado = 'completado';
      pesaje.operarioBruto = datos.operario || '';

      escribirTodo(lista);
      return pesaje;
    },

    /** Corregir un pesaje ya cerrado. */
    async editar(id, cambios) {
      const lista = leerTodo();
      const pesaje = lista.find(function (p) { return p.id === id; });
      if (!pesaje) throw new Error('No se encuentra ese pesaje.');
      Object.assign(pesaje, cambios);
      escribirTodo(lista);
      return pesaje;
    },

    async eliminar(id) {
      escribirTodo(leerTodo().filter(function (p) { return p.id !== id; }));
    },

    /** Lista de clientes ya usados, para autocompletar. */
    async clientes() {
      const vistos = new Set();
      leerTodo().forEach(function (p) { if (p.cliente) vistos.add(p.cliente); });
      return Array.from(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    /** Lista de barcos ya usados. */
    async barcos() {
      const vistos = new Set();
      leerTodo().forEach(function (p) { if (p.barco) vistos.add(p.barco); });
      return Array.from(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    /** Avisar a la interfaz cuando cambien los datos. */
    suscribir(fn) {
      suscriptores.push(fn);
      // Si la misma app está abierta en otra pestaña del mismo dispositivo,
      // esto ya mantiene las dos sincronizadas.
      window.addEventListener('storage', function (e) {
        if (e.key === CLAVE) fn();
      });
    },

    /** Dónde se están guardando los datos ahora mismo. */
    origen: 'Este dispositivo'
  };
})();
