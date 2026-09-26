import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

// Aviso simple de errores de guardado, para mostrar un cartel visible en la app
// en vez de que un fallo quede en silencio (solo en la consola).
const errorListeners = new Set();
export function onSaveError(cb) {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}
function avisarErrorGuardado(mensaje) {
  errorListeners.forEach((cb) => cb(mensaje));
}

/**
 * Hook genérico para una tabla de Supabase.
 * Devuelve [filas, persistir, cargando] con la MISMA forma que se usaba
 * antes con window.storage: persistir(arrayCompleto) calcula la diferencia
 * (altas / bajas / cambios) y hace los inserts/updates/deletes necesarios.
 * También escucha cambios en tiempo real de otras personas conectadas.
 *
 * toRow: convierte un objeto camelCase de la app a una fila snake_case de la tabla
 * fromRow: convierte una fila de la tabla a un objeto camelCase para la app
 */
export function useSupabaseTable(table, { toRow, fromRow, orderBy } = {}) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const _toRow = toRow || ((x) => x);
  const _fromRow = fromRow || ((x) => x);

  const cargar = useCallback(async () => {
    setError(null);
    let query = supabase.from(table).select("*");
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending !== false });
    const { data, error: err } = await query;
    if (err) {
      console.error(`Error cargando ${table}:`, err.message);
      setError(err.message);
      setReady(true);
      return;
    }
    setRows((data || []).map(_fromRow));
    setReady(true);
  }, [table]);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (!activo) return;
      await cargar();
    })();

    const canal = supabase
      .channel(`realtime:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        setRows((prev) => {
          if (payload.eventType === "INSERT") {
            const nueva = _fromRow(payload.new);
            if (prev.some((r) => r.id === nueva.id)) return prev;
            return [...prev, nueva];
          }
          if (payload.eventType === "UPDATE") {
            const act = _fromRow(payload.new);
            return prev.map((r) => (r.id === act.id ? act : r));
          }
          if (payload.eventType === "DELETE") {
            return prev.filter((r) => r.id !== payload.old.id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [table]);

  const persistir = useCallback(
    async (next) => {
      const prev = rowsRef.current;
      setRows(next); // actualización optimista, se confirma o corrige con el realtime

      const prevById = new Map(prev.map((r) => [r.id, r]));
      const nextById = new Map(next.map((r) => [r.id, r]));

      const altas = next.filter((r) => !prevById.has(r.id));
      const bajas = prev.filter((r) => !nextById.has(r.id));
      const cambios = next.filter((r) => {
        const anterior = prevById.get(r.id);
        return anterior && JSON.stringify(anterior) !== JSON.stringify(r);
      });

      try {
        if (altas.length) {
          const { error } = await supabase.from(table).insert(altas.map(_toRow));
          if (error) throw error;
        }
        for (const fila of cambios) {
          const { id, ...resto } = _toRow(fila);
          const { error } = await supabase.from(table).update(resto).eq("id", id);
          if (error) throw error;
        }
        if (bajas.length) {
          const { error } = await supabase.from(table).delete().in("id", bajas.map((r) => r.id));
          if (error) throw error;
        }
      } catch (e) {
        console.error(`Error guardando en ${table}:`, e.message);
        avisarErrorGuardado(`No se pudo guardar un cambio en "${table}". Revisá tu conexión e intentá de nuevo. (${e.message})`);
      }
    },
    [table]
  );

  return [rows, persistir, ready, error, cargar];
}

// ---------- Contactos de seguimiento ----------
// Se guardan como {pacienteId: fechaISO}, igual que antes, pero por dentro
// viven en una tabla propia (contactos) en vez de un objeto suelto.
export function useContactosSupabase() {
  const [mapa, setMapa] = useState({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase.from("contactos").select("*");
    if (err) {
      console.error("Error cargando contactos:", err.message);
      setError(err.message);
      setReady(true);
      return;
    }
    const m = {};
    (data || []).forEach((r) => { m[r.paciente_id] = r.fecha; });
    setMapa(m);
    setReady(true);
  }, []);

  useEffect(() => {
    let activo = true;
    (async () => { if (activo) await cargar(); })();

    const canal = supabase
      .channel("realtime:contactos")
      .on("postgres_changes", { event: "*", schema: "public", table: "contactos" }, (payload) => {
        setMapa((prev) => {
          const next = { ...prev };
          if (payload.eventType === "DELETE") {
            delete next[payload.old.paciente_id];
          } else {
            next[payload.new.paciente_id] = payload.new.fecha;
          }
          return next;
        });
      })
      .subscribe();

    return () => { activo = false; supabase.removeChannel(canal); };
  }, []);

  // Compatible con el uso anterior: setContactos({...contactos, [id]: fecha})
  const setContactos = useCallback(async (nuevoMapa) => {
    setMapa(nuevoMapa);
    const entradas = Object.entries(nuevoMapa);
    if (entradas.length === 0) return;
    const filas = entradas.map(([paciente_id, fecha]) => ({ paciente_id, fecha }));
    const { error } = await supabase.from("contactos").upsert(filas);
    if (error) {
      console.error("Error guardando contacto:", error.message);
      avisarErrorGuardado(`No se pudo guardar el contacto. Revisá tu conexión e intentá de nuevo. (${error.message})`);
    }
  }, []);

  return [mapa, setContactos, ready, error, cargar];
}

// ---------- Mapeos camelCase <-> snake_case por tabla ----------
export const mapPacientes = {
  toRow: (p) => ({
    id: p.id,
    nombre: p.nombre,
    telefono: p.telefono || "",
    email: p.email || "",
    nacimiento: p.nacimiento || null,
    notas: p.notas || "",
    historial: p.historial || [],
    como_conocio: p.comoConocio || "",
    fecha_ingreso: p.fechaIngreso || null,
    horario: p.horario || "",
    plan_pago: p.planPago || "",
    vencimiento_mensualidad: p.vencimientoMensualidad || null,
    ultimo_pago_manual: p.ultimoPagoManual || null,
    pausado_vencimiento: !!p.pausadoVencimiento,
    tratamiento_actual: p.tratamientoActual || "",
    frecuencia_semanal: p.frecuenciaSemanal || null,
  }),
  fromRow: (r) => ({
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono || "",
    email: r.email || "",
    nacimiento: r.nacimiento || "",
    notas: r.notas || "",
    historial: r.historial || [],
    comoConocio: r.como_conocio || "",
    fechaIngreso: r.fecha_ingreso || "",
    horario: r.horario || "",
    planPago: r.plan_pago || "",
    vencimientoMensualidad: r.vencimiento_mensualidad || "",
    ultimoPagoManual: r.ultimo_pago_manual || "",
    pausadoVencimiento: !!r.pausado_vencimiento,
    tratamientoActual: r.tratamiento_actual || "",
    frecuenciaSemanal: r.frecuencia_semanal || "",
  }),
};

export const mapTurnos = {
  toRow: (t) => ({
    id: t.id,
    paciente_id: t.pacienteId,
    actividad: t.actividad,
    profesional: t.profesional,
    fecha: t.fecha,
    hora: t.hora,
    motivo: t.motivo || "",
    estado: t.estado,
  }),
  fromRow: (r) => ({
    id: r.id,
    pacienteId: r.paciente_id,
    actividad: r.actividad,
    profesional: r.profesional,
    fecha: r.fecha,
    hora: (r.hora || "").slice(0, 5),
    motivo: r.motivo || "",
    estado: r.estado,
  }),
};

export const mapCobros = {
  toRow: (c) => ({
    id: c.id,
    paciente_id: c.pacienteId,
    concepto: c.concepto || "",
    tipo_servicio: c.tipoServicio || "",
    modalidad: c.modalidad || "",
    obra_social: c.obraSocial || "",
    monto: c.monto,
    metodo: c.metodo,
    fecha: c.fecha,
    tipo_pago: c.tipoPago || "Individual",
  }),
  fromRow: (r) => ({
    id: r.id,
    pacienteId: r.paciente_id,
    concepto: r.concepto || "",
    tipoServicio: r.tipo_servicio || "",
    modalidad: r.modalidad || "",
    obraSocial: r.obra_social || "",
    monto: Number(r.monto),
    metodo: r.metodo,
    fecha: r.fecha,
    tipoPago: r.tipo_pago || "Individual",
  }),
};

export const mapRegistros = {
  toRow: (r) => ({
    id: r.id,
    paciente_id: r.pacienteId,
    fecha: r.fecha,
    hora: r.hora || null,
    profesional: r.profesional,
    tipo: r.tipo || "Individual",
    notas: r.notas || "",
  }),
  fromRow: (row) => ({
    id: row.id,
    pacienteId: row.paciente_id,
    fecha: row.fecha,
    hora: (row.hora || "").slice(0, 5),
    profesional: row.profesional,
    tipo: row.tipo || "Individual",
    notas: row.notas || "",
  }),
};

export const mapPerfiles = {
  toRow: (u) => ({
    id: u.id,
    nombre: u.nombre,
    usuario: u.usuario,
    rol: u.rol,
    debe_cambiar_password: u.debeCambiarPassword,
  }),
  fromRow: (r) => ({
    id: r.id,
    nombre: r.nombre,
    usuario: r.usuario,
    rol: r.rol,
    debeCambiarPassword: r.debe_cambiar_password,
  }),
};
