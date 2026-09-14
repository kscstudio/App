import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Calendar, Users, Wallet, Bell, BarChart3, Plus, X, Phone,
  Mail, Search, ChevronLeft, ChevronRight, CalendarPlus,
  MessageCircle, Check, Trash2, Clock, AlertTriangle, Download, FileDown,
  LogOut, KeyRound, ShieldCheck, Lock, User as UserIcon, Menu, ClipboardList, Pencil
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import { useSupabaseTable, useContactosSupabase, onSaveError, mapPacientes, mapTurnos, mapCobros, mapRegistros, mapPerfiles } from "./lib/supabaseHooks";

// ---------- Utilidades ----------
// Genera un UUID real (formato que exige la columna "uuid" en Supabase).
const uid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const fmtMoney = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonths = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (desdeISO, hastaISO) => {
  const a = new Date(desdeISO + "T00:00:00");
  const b = new Date(hastaISO + "T00:00:00");
  return Math.round((b - a) / 86400000);
};
// Estado de la mensualidad de un paciente, a partir de los campos guardados en su ficha.
function estadoMensualidad(paciente) {
  if (!paciente || paciente.planPago !== "Mensual" || !paciente.vencimientoMensualidad) return null;
  const dias = diasEntre(todayISO(), paciente.vencimientoMensualidad);
  return { vencimiento: paciente.vencimientoMensualidad, dias };
}
const mondayOf = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
};
function descargarArchivo(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const PROFESIONALES = ["Santiago Remon", "Franco Tosi", "Franco Gutierrez", "Sebastian Caminio", "Jeremias Aime", "Juan Pablo"];
const ACTIVIDADES = ["Osteopatía", "Kinefilaxia", "Recovery"];
const FUENTES_CONTACTO = ["Instagram", "Facebook", "Google", "Recomendación de un paciente", "Recomendación de un profesional", "Derivación de Santiago", "KSC Fitness", "Pasó por la puerta", "Otro"];
const TIPOS_PAGO = ["Individual", "Mensual"];
const TIPOS_SERVICIO = ["Entrenamiento/Readaptación", "Rehabilitaciones", "Sesión personal de kinesiología", "Terapia manual", "Otro"];
const HORARIOS_ASISTENCIA = ["Mañana", "Mediodía", "Tarde"];
const MOTIVOS = ["Primera consulta", "Control", "Tratamiento", "Revisión", "Otro"];
const ESTADOS = ["Pendiente", "Confirmado", "Cancelado", "Atendido"];
const METODOS_PAGO = ["Efectivo", "Transferencia", "Tarjeta débito", "Tarjeta crédito"];

const NAV_ITEMS = [
  { key: "agenda", label: "Agenda", icon: Calendar, roles: ["admin", "staff"] },
  { key: "registro", label: "Registro diario", icon: ClipboardList, roles: ["admin", "staff"] },
  { key: "pacientes", label: "Pacientes", icon: Users, roles: ["admin", "staff"] },
  { key: "cobros", label: "Cobros", icon: Wallet, roles: ["admin"] },
  { key: "seguimiento", label: "Seguimiento", icon: Bell, roles: ["admin", "staff"] },
  { key: "reportes", label: "Reportes", icon: BarChart3, roles: ["admin"] },
  { key: "usuarios", label: "Usuarios", icon: ShieldCheck, roles: ["admin"] },
];




// ---------- Componentes chicos ----------
function Badge({ children, tone = "sage" }) {
  const tones = {
    sage: { bg: "#EDE6D8", fg: "#5C5245" },
    clay: { bg: "#F1DDC9", fg: "#8A4E1F" },
    coral: { bg: "#F3D9D6", fg: "#8C2F32" },
    pine: { bg: "#F1E1CD", fg: "#8A4E1F" },
  };
  const t = tones[tone] || tones.sage;
  return (
    <span style={{ background: t.bg, color: t.fg }} className="badge">
      {children}
      <style>{`.badge{font-family:'IBM Plex Sans',sans-serif;font-size:12px;padding:3px 9px;border-radius:3px;font-weight:600;white-space:nowrap;}`}</style>
    </span>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal-box" + (wide ? " wide" : "")}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
      <style>{`
        .modal-overlay{position:fixed;inset:0;background:rgba(27,43,39,0.45);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px;}
        .modal-box{background:#FBF9F4;border:1px solid #D9CDB9;max-width:480px;width:100%;max-height:86vh;overflow:auto;}
        .modal-box.wide{max-width:640px;}
        .modal-head{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid #E9E1D3;}
        .modal-head h3{font-family:'Fraunces',serif;font-size:19px;font-weight:600;color:#14100C;margin:0;}
        .modal-body{padding:20px 22px 24px;}
        .icon-btn{background:none;border:none;cursor:pointer;color:#9C9284;padding:4px;display:flex;}
        .icon-btn:hover{color:#14100C;}
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      <style>{`
        .field{display:flex;flex-direction:column;gap:5px;margin-bottom:14px;font-family:'IBM Plex Sans',sans-serif;}
        .field>span{font-size:12.5px;color:#8A7F6E;font-weight:500;}
        .field input, .field select, .field textarea{
          font-family:'IBM Plex Sans',sans-serif;border:1px solid #D6CBB8;background:#fff;
          padding:9px 10px;font-size:14px;color:#14100C;border-radius:3px;
        }
        .field input:focus, .field select:focus, .field textarea:focus{outline:2px solid #8C5A34;outline-offset:1px;}
      `}</style>
    </label>
  );
}

function Btn({ children, onClick, variant = "primary", type = "button", small }) {
  const styles = {
    primary: { bg: "#14100C", fg: "#F1E4D8", border: "#14100C" },
    clay: { bg: "#BC7F55", fg: "#241A0E", border: "#BC7F55" },
    ghost: { bg: "transparent", fg: "#8C5A34", border: "#8C5A34" },
    danger: { bg: "transparent", fg: "#B5484B", border: "#B5484B" },
  };
  const s = styles[variant];
  return (
    <button type={type} onClick={onClick} className="btn" style={{ background: s.bg, color: s.fg, borderColor: s.border, padding: small ? "6px 11px" : "9px 16px", fontSize: small ? 12.5 : 14 }}>
      {children}
      <style>{`
        .btn{border:1px solid;border-radius:3px;font-family:'IBM Plex Sans',sans-serif;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:opacity .15s;}
        .btn:hover{opacity:0.85;}
      `}</style>
    </button>
  );
}

// Buscador de pacientes con autocompletar: se tipea el nombre en vez de desplegar
// la lista completa, y si no existe se puede cargar uno nuevo al vuelo.
function PatientPicker({ pacientes, value, onChange, onCreateNew, placeholder }) {
  const seleccionado = pacientes.find((p) => p.id === value);
  const [query, setQuery] = useState(seleccionado ? seleccionado.nombre : "");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const p = pacientes.find((p) => p.id === value);
    if (p) setQuery(p.nombre);
  }, [value]);

  const term = query.trim().toLowerCase();
  const matches = term.length === 0 ? [] : pacientes.filter((p) => p.nombre.toLowerCase().includes(term)).slice(0, 6);
  const puedeCrear = term.length > 1 && !pacientes.some((p) => p.nombre.toLowerCase() === term);

  const elegir = (p) => {
    onChange(p.id);
    setQuery(p.nombre);
    setOpen(false);
  };

  const crear = () => {
    if (!onCreateNew) return;
    const nuevo = onCreateNew(query.trim());
    if (nuevo) { onChange(nuevo.id); setQuery(nuevo.nombre); }
    setOpen(false);
  };

  const opciones = matches.length + (puedeCrear && onCreateNew ? 1 : 0);

  return (
    <div className="picker">
      <input
        type="text"
        value={query}
        placeholder={placeholder || "Escribí el nombre del paciente…"}
        onChange={(e) => { setQuery(e.target.value); onChange(""); setOpen(true); setActiveIdx(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, opciones - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter") {
            e.preventDefault();
            if (activeIdx < matches.length) matches[activeIdx] && elegir(matches[activeIdx]);
            else if (puedeCrear) crear();
          }
        }}
      />
      {open && query.trim().length > 0 && (matches.length > 0 || puedeCrear) && (
        <div className="picker-dropdown">
          {matches.map((p, i) => (
            <button key={p.id} type="button" className={"picker-item" + (i === activeIdx ? " active" : "")} onMouseDown={() => elegir(p)}>
              {p.nombre}
              {p.telefono && <span className="picker-sub">{p.telefono}</span>}
            </button>
          ))}
          {puedeCrear && onCreateNew && (
            <button type="button" className={"picker-item picker-create" + (activeIdx === matches.length ? " active" : "")} onMouseDown={crear}>
              <Plus size={13} /> Crear paciente "{query.trim()}"
            </button>
          )}
        </div>
      )}
      <style>{`
        .picker{ position:relative; }
        .picker-dropdown{ position:absolute; top:calc(100% + 4px); left:0; right:0; background:#FFFFFF; border:1px solid #D9CDB9; border-radius:3px; box-shadow:0 6px 16px rgba(20,16,12,0.12); z-index:20; max-height:220px; overflow-y:auto; }
        .picker-item{ display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; text-align:left; background:none; border:none; padding:9px 12px; font-family:'IBM Plex Sans',sans-serif; font-size:13.5px; color:#14100C; cursor:pointer; }
        .picker-item.active, .picker-item:hover{ background:#F5EEE2; }
        .picker-sub{ font-size:11.5px; color:#A89D8C; }
        .picker-create{ color:#8C5A34; font-weight:600; border-top:1px solid #F0E9DC; }
      `}</style>
    </div>
  );
}

// ---------- App ----------
export default function KSCStudioApp() {
  const [view, setView] = useState(() => localStorage.getItem("ksc:lastView") || "agenda");
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const cambiarView = (v) => {
    setView(v);
    try { localStorage.setItem("ksc:lastView", v); } catch {}
  };

  useEffect(() => {
    const unsub = onSaveError((mensaje) => {
      setSaveError(mensaje);
      setTimeout(() => setSaveError(null), 8000);
    });
    return unsub;
  }, []);
  const [session, setSession] = useState(undefined); // undefined = todavía no se sabe, null = sin sesión
  const [perfil, setPerfil] = useState(null);
  const [perfilLoading, setPerfilLoading] = useState(true);

  const [pacientes, setPacientes] = useSupabaseTable("pacientes", mapPacientes);
  const [turnos, setTurnos] = useSupabaseTable("turnos", mapTurnos);
  const [cobros, setCobros] = useSupabaseTable("cobros", mapCobros);
  const [registros, setRegistros] = useSupabaseTable("registros_diarios", mapRegistros);
  const [contactos, setContactos] = useContactosSupabase();
  const [perfiles, setPerfiles] = useSupabaseTable("perfiles", mapPerfiles);

  const pacienteById = useCallback((id) => pacientes.find((p) => p.id === id), [pacientes]);

  // Sesión de Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Perfil (nombre + rol) de la persona logueada
  useEffect(() => {
    let activo = true;
    if (!session) { setPerfil(null); setPerfilLoading(false); return; }
    setPerfilLoading(true);
    supabase.from("perfiles").select("*").eq("id", session.user.id).single().then(({ data, error }) => {
      if (!activo) return;
      if (error) { console.error("Error cargando perfil:", error.message); setPerfil(null); }
      else setPerfil(mapPerfiles.fromRow(data));
      setPerfilLoading(false);
    });
    return () => { activo = false; };
  }, [session]);

  // Solo reiniciamos a "Agenda" si cambió la persona logueada (por ejemplo, otra
  // cuenta en el mismo dispositivo). Si es la misma persona, respetamos la
  // última sección donde estaba trabajando.
  useEffect(() => {
    if (!perfil) return;
    let ultimoUsuario = null;
    try { ultimoUsuario = localStorage.getItem("ksc:lastUserId"); } catch {}
    if (ultimoUsuario !== perfil.id) {
      cambiarView("agenda");
      try { localStorage.setItem("ksc:lastUserId", perfil.id); } catch {}
    }
  }, [perfil?.id]);

  if (session === undefined || (session && perfilLoading)) {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans',sans-serif", padding: 40, color: "#8A7F6E" }}>
        Cargando KSC Studio…
        <FontImports />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <FontImports />
        <LoginScreen />
        <style>{GLOBAL_CSS}</style>
      </>
    );
  }

  if (!perfil) {
    return (
      <>
        <FontImports />
        <div className="auth-screen">
          <div className="auth-card">
            <h1 className="auth-title">Sin acceso</h1>
            <p className="auth-sub">Tu usuario existe pero todavía no tiene un perfil asignado en KSC Studio. Pedile a un administrador que te agregue en la tabla "perfiles".</p>
            <Btn variant="ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Btn>
          </div>
        </div>
        <style>{GLOBAL_CSS}</style>
      </>
    );
  }

  if (perfil.debeCambiarPassword) {
    return (
      <>
        <FontImports />
        <CambiarPasswordScreen
          usuario={perfil}
          forzado
          onGuardar={async (nuevaPassword) => {
            const { error: errPass } = await supabase.auth.updateUser({ password: nuevaPassword });
            if (errPass) { console.error(errPass.message); return; }
            await supabase.from("perfiles").update({ debe_cambiar_password: false }).eq("id", perfil.id);
            setPerfil({ ...perfil, debeCambiarPassword: false });
          }}
        />
        <style>{GLOBAL_CSS}</style>
      </>
    );
  }

  const currentUser = perfil;
  const navVisible = NAV_ITEMS.filter((n) => n.roles.includes(currentUser.rol));
  const viewPermitida = navVisible.some((n) => n.key === view) ? view : "agenda";

  return (
    <div className="app-root">
      <FontImports />
      {saveError && (
        <div className="save-error-banner">
          <AlertTriangle size={16} />
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} aria-label="Cerrar aviso"><X size={15} /></button>
        </div>
      )}
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
        <div className="mobile-topbar-brand">
          <span className="brand-badge-ksc" style={{ fontSize: 14 }}>KSC</span> <span style={{ fontSize: 12, color: "#8F8577" }}>STUDIO</span>
        </div>
      </div>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
        <div className="brand">
          <div className="brand-badge">
            <span className="brand-badge-ksc">KSC</span>
            <span className="brand-badge-studio">STUDIO</span>
          </div>
          <div className="brand-name">Gestión de consultorio</div>
        </div>
        <nav>
          {navVisible.map((n) => (
            <NavItem key={n.key} icon={<n.icon size={17} />} label={n.label} active={viewPermitida === n.key} onClick={() => { cambiarView(n.key); setMenuOpen(false); }} />
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-name">{currentUser.nombre}</div>
          <div className="sidebar-user-rol">{currentUser.rol === "admin" ? "Acceso total" : "Acceso de equipo"}</div>
          <button className="sidebar-logout" onClick={() => supabase.auth.signOut()}><LogOut size={13} /> Cerrar sesión</button>
        </div>
      </aside>

      <main className="content">
        {viewPermitida === "agenda" && <AgendaView turnos={turnos} setTurnos={setTurnos} pacientes={pacientes} setPacientes={setPacientes} pacienteById={pacienteById} />}
        {viewPermitida === "registro" && <RegistroDiarioView registros={registros} setRegistros={setRegistros} pacientes={pacientes} setPacientes={setPacientes} />}
        {viewPermitida === "pacientes" && <PacientesView pacientes={pacientes} setPacientes={setPacientes} turnos={turnos} />}
        {viewPermitida === "cobros" && <CobrosView cobros={cobros} setCobros={setCobros} pacientes={pacientes} setPacientes={setPacientes} turnos={turnos} />}
        {viewPermitida === "seguimiento" && <SeguimientoView pacientes={pacientes} turnos={turnos} contactos={contactos} setContactos={setContactos} />}
        {viewPermitida === "reportes" && <ReportesView turnos={turnos} cobros={cobros} pacientes={pacientes} />}
        {viewPermitida === "usuarios" && <UsuariosView usuarios={perfiles} setUsuarios={setPerfiles} currentUser={currentUser} />}
      </main>

      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const ingresar = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!email.trim() || !password) { setError("Completá tu email y tu contraseña."); return; }
    setCargando(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setCargando(false);
    if (err) { setError("Email o contraseña incorrectos."); return; }
    setError("");
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-badge" style={{ margin: "0 auto 18px" }}>
          <span className="brand-badge-ksc">KSC</span>
          <span className="brand-badge-studio">STUDIO</span>
        </div>
        <h1 className="auth-title">Ingresar</h1>
        <p className="auth-sub">Gestión de consultorio</p>

        <Field label="Email">
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="tu@email.com" autoFocus />
        </Field>
        <Field label="Contraseña">
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && ingresar(e)} placeholder="••••••••" />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <Btn variant="primary" onClick={ingresar}>{cargando ? "Ingresando…" : "Ingresar"}</Btn>
      </div>
      <style>{`
        .auth-screen{ min-height:100vh; background:#121212; display:flex; align-items:center; justify-content:center; font-family:'IBM Plex Sans',sans-serif; padding:20px; }
        .auth-card{ background:#FBF9F4; border:1px solid #2A241C; padding:34px 34px 30px; width:100%; max-width:340px; text-align:center; border-radius:6px; }
        .auth-title{ font-family:'Fraunces',serif; font-size:22px; font-weight:600; margin:0; color:#14100C; }
        .auth-sub{ color:#7C7264; font-size:13px; margin:4px 0 22px; }
        .auth-card .field{ text-align:left; }
        .auth-error{ background:#F3D9D6; color:#8C2F32; font-size:12.5px; padding:8px 10px; border-radius:3px; margin-bottom:14px; }
        .auth-card .btn{ width:100%; justify-content:center; margin-top:4px; }
        .auth-hint{ font-size:11.5px; color:#A89D8C; margin:14px 0 0; line-height:1.5; }
        .auth-hint strong{ color:#8C5A34; }
      `}</style>
    </div>
  );
}

function CambiarPasswordScreen({ usuario, forzado, onGuardar, onClose }) {
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState("");

  const guardar = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const p1 = nueva.trim();
    const p2 = repetir.trim();
    if (p1.length < 4) { setError("La contraseña debe tener al menos 4 caracteres."); return; }
    if (p1 !== p2) { setError("Las contraseñas no coinciden."); return; }
    onGuardar(p1);
    if (onClose) onClose();
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <KeyRound size={26} color="#BC7F55" style={{ marginBottom: 10 }} />
        <h1 className="auth-title">Elegí tu contraseña</h1>
        <p className="auth-sub">{forzado ? `Hola ${usuario.nombre.split(" ")[0]}, por seguridad tenés que cambiar la contraseña inicial antes de continuar.` : "Actualizá tu contraseña."}</p>
        <Field label="Nueva contraseña"><input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoFocus /></Field>
        <Field label="Repetir contraseña"><input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar(e)} /></Field>
        {error && <div className="auth-error">{error}</div>}
        <Btn variant="primary" onClick={guardar}>Guardar contraseña</Btn>
      </div>
    </div>
  );
}

function UsuariosView({ usuarios, setUsuarios, currentUser }) {
  const cambiarRol = (id, rol) => setUsuarios(usuarios.map((u) => (u.id === id ? { ...u, rol } : u)));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Usuarios</h1>
          <p>Accesos del equipo. "Acceso total" ve Cobros y Reportes; "Acceso de equipo" no.</p>
        </div>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th></tr></thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.nombre}{u.id === currentUser.id && <span className="muted-text" style={{ marginLeft: 6 }}>(vos)</span>}</td>
                <td>{u.usuario}</td>
                <td>
                  <select value={u.rol} onChange={(e) => cambiarRol(u.id, e.target.value)} disabled={u.id === currentUser.id} style={{ border: "1px solid #D6CBB8", borderRadius: 3, padding: "5px 8px", fontSize: 12.5, fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    <option value="admin">Acceso total</option>
                    <option value="staff">Acceso de equipo</option>
                  </select>
                </td>
                <td>{u.debeCambiarPassword ? <Badge tone="clay">Debe cambiar contraseña</Badge> : <Badge tone="sage">Activo</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ padding: "16px 20px", marginTop: 18 }}>
        <p style={{ fontSize: 13, color: "#7C7264", margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: "#14100C" }}>Para agregar a alguien nuevo o restablecer una contraseña olvidada:</strong> entrá al panel de Supabase del proyecto → Authentication → Users. Ahí podés crear una persona nueva o cambiarle la contraseña directamente. Si es alguien nuevo, después agregale una fila en la tabla "perfiles" con su nombre y rol (mirá el archivo sql/schema.sql para el formato exacto).
        </p>
      </div>
    </div>
  );
}

function FontImports() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
    `}</style>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button className={"nav-item" + (active ? " active" : "")} onClick={onClick}>
      <span className="nav-bar" />
      {icon}
      <span>{label}</span>
    </button>
  );
}

const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  .app-root{ display:flex; min-height:100vh; background:#F5F1E9; font-family:'IBM Plex Sans',sans-serif; color:#14100C; }
  .sidebar{ width:224px; background:#121212; color:#DCD3C6; display:flex; flex-direction:column; flex-shrink:0; padding:26px 0; }
  .sidebar-close{ display:none; }
  .brand{ padding:0 20px 22px; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:14px; }
  .brand-badge{ width:60px; height:60px; background:#0A0A0A; border:2px solid #BC7F55; border-radius:14px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; }
  .brand-badge-ksc{ font-family:'IBM Plex Sans',sans-serif; font-weight:700; font-size:16px; letter-spacing:0.5px; color:#BC7F55; line-height:1; }
  .brand-badge-studio{ font-family:'IBM Plex Sans',sans-serif; font-weight:600; font-size:7.5px; letter-spacing:2px; color:#BC7F55; }
  .brand-name{ font-family:'IBM Plex Sans',sans-serif; font-size:11.5px; color:#8F8577; font-weight:500; margin-top:12px; }
  nav{ display:flex; flex-direction:column; gap:2px; padding:0 10px; }
  .nav-item{ position:relative; display:flex; align-items:center; gap:10px; background:none; border:none; color:#B3A897; padding:10px 12px; font-size:14px; font-family:'IBM Plex Sans',sans-serif; font-weight:500; cursor:pointer; border-radius:3px; text-align:left; }
  .nav-item:hover{ background:rgba(255,255,255,0.06); color:#F1E4D8; }
  .nav-item.active{ background:rgba(255,255,255,0.08); color:#F1E4D8; }
  .nav-bar{ position:absolute; left:0; top:6px; bottom:6px; width:3px; background:#BC7F55; border-radius:2px; opacity:0; }
  .nav-item.active .nav-bar{ opacity:1; }
  .sidebar-foot{ margin-top:auto; padding:14px 20px 0; font-size:11px; color:#665D50; border-top:1px solid rgba(255,255,255,0.08); }
  .sidebar-user{ margin-top:auto; padding:14px 20px 0; border-top:1px solid rgba(255,255,255,0.08); }
  .sidebar-user-name{ font-size:13px; font-weight:600; color:#F1E4D8; }
  .sidebar-user-rol{ font-size:11px; color:#8F8577; margin-top:2px; margin-bottom:10px; }
  .sidebar-logout{ display:flex; align-items:center; gap:6px; background:none; border:none; color:#B3A897; font-family:'IBM Plex Sans',sans-serif; font-size:12px; cursor:pointer; padding:0; }
  .sidebar-logout:hover{ color:#F1E4D8; }
  .content{ flex:1; padding:34px 42px; overflow-x:hidden; min-width:0; }
  .page-head{ display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:26px; flex-wrap:wrap; gap:14px; }
  .page-head h1{ font-family:'Fraunces',serif; font-size:28px; font-weight:600; margin:0; color:#14100C; }
  .page-head p{ margin:4px 0 0; color:#7C7264; font-size:13.5px; }
  .panel{ background:#FBF9F4; border:1px solid #E5DDCE; overflow-x:auto; }
  .panel + .panel{ margin-top:18px; }
  table{ width:100%; min-width:520px; border-collapse:collapse; font-size:13.5px; }
  th{ text-align:left; font-weight:600; color:#8A7F6E; font-size:12px; padding:10px 14px; border-bottom:1px solid #E9E1D3; white-space:nowrap; }
  td{ padding:11px 14px; border-bottom:1px solid #F0E9DC; vertical-align:middle; }
  tr:last-child td{ border-bottom:none; }
  .empty-state{ padding:40px 20px; text-align:center; color:#A89D8C; font-size:14px; }
  .tab-switch{ display:flex; gap:4px; margin-bottom:18px; border-bottom:1px solid #E5DDCE; overflow-x:auto; }
  .tab-btn{ background:none; border:none; padding:10px 4px; margin-right:22px; font-family:'IBM Plex Sans',sans-serif; font-size:13.5px; font-weight:600; color:#A89D8C; cursor:pointer; border-bottom:2px solid transparent; position:relative; top:1px; white-space:nowrap; }
  .tab-btn:hover{ color:#14100C; }
  .tab-btn.active{ color:#14100C; border-bottom-color:#BC7F55; }
  input[type=text], input[type=date], input[type=time], input[type=number], input[type=tel], input[type=email], select, textarea{ width:100%; }
  ::placeholder{ color:#B8AC9A; }

  .save-error-banner{
    position:fixed; top:0; left:0; right:0; z-index:100; background:#B5484B; color:#FDF1F0;
    display:flex; align-items:center; gap:10px; padding:11px 18px; font-family:'IBM Plex Sans',sans-serif;
    font-size:13px; font-weight:500; box-shadow:0 2px 10px rgba(0,0,0,0.2);
  }
  .save-error-banner span{ flex:1; }
  .save-error-banner button{ background:none; border:none; color:#FDF1F0; cursor:pointer; display:flex; padding:2px; opacity:0.85; }
  .save-error-banner button:hover{ opacity:1; }

  /* ---------- Mobile ---------- */
  .mobile-topbar{ display:none; }  .hamburger-btn{ background:none; border:none; color:#14100C; padding:6px; display:flex; cursor:pointer; }
  .sidebar-backdrop{ display:none; }

  @media (max-width: 860px) {
    .mobile-topbar{
      display:flex; align-items:center; gap:12px; width:100%; padding:14px 16px;
      background:#FBF9F4; border-bottom:1px solid #E5DDCE; position:sticky; top:0; z-index:30;
    }
    .app-root{ flex-direction:column; }
    .sidebar{
      position:fixed; top:0; left:0; right:0; bottom:0; z-index:50; width:100%; max-width:100%;
      transform:translateX(-100%); transition:transform .22s ease; overflow-y:auto;
    }
    .sidebar.open{ transform:translateX(0); }
    .sidebar-close{ display:flex; align-self:flex-end; margin:0 16px 6px auto; background:none; border:none; color:#B3A897; cursor:pointer; }
    .sidebar-backdrop{ display:block; position:fixed; inset:0; background:rgba(10,10,10,0.5); z-index:40; }
    .content{ padding:20px 16px 40px; width:100%; }
    .page-head{ margin-bottom:18px; }
    .page-head h1{ font-size:22px; }
    .page-head > .btn, .page-head > div + .btn{ width:100%; justify-content:center; }
  }
  @media (max-width: 520px) {
    .content{ padding:16px 12px 36px; }
    .page-head{ flex-direction:column; align-items:stretch; }
  }
`;

// ================= AGENDA =================
function AgendaView({ turnos, setTurnos, pacientes, setPacientes, pacienteById }) {
  const [fecha, setFecha] = useState(todayISO());
  const [showNew, setShowNew] = useState(false);
  const [waTurno, setWaTurno] = useState(null);
  const [calLink, setCalLink] = useState(null);

  const delDia = useMemo(
    () => turnos.filter((t) => t.fecha === fecha).sort((a, b) => a.hora.localeCompare(b.hora)),
    [turnos, fecha]
  );

  const cambiarDia = (delta) => {
    const d = new Date(fecha + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setFecha(d.toISOString().slice(0, 10));
  };

  const addTurno = (t) => setTurnos([...turnos, { id: uid(), estado: "Pendiente", ...t }]);
  const updEstado = (id, estado) => setTurnos(turnos.map((t) => (t.id === id ? { ...t, estado } : t)));
  const delTurno = (id) => setTurnos(turnos.filter((t) => t.id !== id));
  const crearPacienteRapido = (nombre) => {
    if (!nombre) return null;
    const nuevo = { id: uid(), nombre, telefono: "", email: "", nacimiento: "", notas: "", historial: [] };
    setPacientes([...pacientes, nuevo]);
    return nuevo;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Agenda</h1>
          <p>Turnos del consultorio, día por día.</p>
        </div>
        <Btn variant="clay" onClick={() => setShowNew(true)}><Plus size={16} /> Nuevo turno</Btn>
      </div>

      <div className="panel" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="icon-btn" onClick={() => cambiarDia(-1)}><ChevronLeft size={20} /></button>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ border: "1px solid #D6CBB8", padding: "7px 10px", borderRadius: 3, fontFamily: "'IBM Plex Sans',sans-serif" }} />
        <button className="icon-btn" onClick={() => cambiarDia(1)}><ChevronRight size={20} /></button>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, marginLeft: 6 }}>{fmtDate(fecha)}</span>
        <button onClick={() => setFecha(todayISO())} style={{ marginLeft: "auto", background: "none", border: "none", color: "#8C5A34", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Hoy</button>
      </div>

      <div className="panel">
        {delDia.length === 0 ? (
          <div className="empty-state">No hay turnos cargados para este día. Cargá el primero con "Nuevo turno".</div>
        ) : (
          <table>
            <thead>
              <tr><th>Hora</th><th>Paciente</th><th>Actividad</th><th>Profesional</th><th>Motivo</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {delDia.map((t) => {
                const pac = pacienteById(t.pacienteId);
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.hora}</td>
                    <td>{pac ? pac.nombre : "—"}</td>
                    <td><Badge tone="clay">{t.actividad}</Badge></td>
                    <td>{t.profesional}</td>
                    <td>{t.motivo}</td>
                    <td>
                      <select value={t.estado} onChange={(e) => updEstado(t.id, e.target.value)} style={{ border: "1px solid #D6CBB8", borderRadius: 3, padding: "5px 8px", fontSize: 12.5, fontFamily: "'IBM Plex Sans',sans-serif" }}>
                        {ESTADOS.map((e) => <option key={e}>{e}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="icon-btn" title="Agregar a Google Calendar" onClick={() => setCalLink({ url: buildGoogleCalendarUrl(t, pac), nombre: pac?.nombre })}><CalendarPlus size={17} /></button>
                        {pac?.telefono && (
                          <button className="icon-btn" title="Recordar por WhatsApp" onClick={() => setWaTurno({ turno: t, paciente: pac })}><MessageCircle size={17} /></button>
                        )}
                        <button className="icon-btn" title="Eliminar" onClick={() => delTurno(t.id)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NuevoTurnoModal pacientes={pacientes} onCreatePaciente={crearPacienteRapido} fechaInicial={fecha} onClose={() => setShowNew(false)} onSave={(t) => { addTurno(t); setShowNew(false); }} />}
      {waTurno && (
        <WhatsAppModal
          nombre={waTurno.paciente.nombre}
          telefono={waTurno.paciente.telefono}
          mensaje={waRecordatorio(waTurno.paciente.nombre, waTurno.turno)}
          onClose={() => setWaTurno(null)}
        />
      )}
      {calLink && (
        <ExternalLinkModal
          title={`Evento para ${calLink.nombre || "paciente"}`}
          url={calLink.url}
          description="Si no se abre solo, copiá el enlace y pegalo en una pestaña nueva del navegador."
          onClose={() => setCalLink(null)}
        />
      )}
    </div>
  );
}

function NuevoTurnoModal({ pacientes, onCreatePaciente, fechaInicial, onClose, onSave }) {
  const [pacienteId, setPacienteId] = useState("");
  const [actividad, setActividad] = useState(ACTIVIDADES[0]);
  const [profesional, setProfesional] = useState(PROFESIONALES[0]);
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState("09:00");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);

  return (
    <Modal title="Nuevo turno" onClose={onClose}>
      <Field label="Paciente">
        <PatientPicker pacientes={pacientes} value={pacienteId} onChange={setPacienteId} onCreateNew={onCreatePaciente} />
      </Field>
      <Field label="Actividad">
        <select value={actividad} onChange={(e) => setActividad(e.target.value)}>
          {ACTIVIDADES.map((a) => <option key={a}>{a}</option>)}
        </select>
      </Field>
      <Field label="Profesional">
        <select value={profesional} onChange={(e) => setProfesional(e.target.value)}>
          {PROFESIONALES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Hora"><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Field></div>
      </div>
      <Field label="Motivo">
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => pacienteId && onSave({ pacienteId, actividad, profesional, fecha, hora, motivo })}>Guardar turno</Btn>
      </div>
    </Modal>
  );
}

function WhatsAppModal({ nombre, telefono, mensaje, onClose }) {
  const [copiadoMensaje, setCopiadoMensaje] = useState(false);
  const [copiadoNumero, setCopiadoNumero] = useState(false);

  const copiar = async (texto, marcar) => {
    try {
      await navigator.clipboard.writeText(texto);
      marcar(true);
      setTimeout(() => marcar(false), 2000);
    } catch (e) {
      // Si el navegador bloquea el portapapeles, dejamos el texto seleccionado para Ctrl+C manual.
    }
  };

  return (
    <Modal title={`Recordatorio para ${nombre}`} onClose={onClose}>
      <p style={{ fontSize: 13, color: "#7C7264", margin: "0 0 14px", lineHeight: 1.5 }}>
        El enlace directo a veces no se abre solo. Lo más seguro es copiar el mensaje y pegarlo vos mismo en la conversación de WhatsApp con este contacto.
      </p>
      <Field label="Número">
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" readOnly value={telefono || "Sin teléfono cargado"} onFocus={(e) => e.target.select()} />
          {telefono && <Btn variant="ghost" small onClick={() => copiar(telefono, setCopiadoNumero)}>{copiadoNumero ? "¡Copiado!" : "Copiar"}</Btn>}
        </div>
      </Field>
      <Field label="Mensaje">
        <textarea rows={4} readOnly value={mensaje} onFocus={(e) => e.target.select()} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
        {telefono && (
          <a href={waLink(telefono, mensaje)} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <Btn variant="ghost">Intentar abrir WhatsApp</Btn>
          </a>
        )}
        <Btn variant="clay" onClick={() => copiar(mensaje, setCopiadoMensaje)}>{copiadoMensaje ? "¡Mensaje copiado!" : "Copiar mensaje"}</Btn>
      </div>
    </Modal>
  );
}

function waLink(telefono, mensaje) {
  const num = telefono.replace(/[^\d+]/g, "").replace("+", "");
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}
function waRecordatorio(nombre, t) {
  return `Hola ${nombre.split(" ")[0]}! Te recordamos tu turno de ${t.actividad} en KSC Studio el ${fmtDate(t.fecha)} a las ${t.hora} hs con ${t.profesional}. Ante cualquier inconveniente avisanos por este medio. ¡Te esperamos!`;
}
function waSeguimiento(nombre) {
  return `Hola ${nombre.split(" ")[0]}! Somos de KSC Studio, hace un tiempo no te vemos por el consultorio. ¿Querés que te ayudemos a coordinar un nuevo turno?`;
}
function ExternalLinkModal({ title, url, description, onClose }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {}
  };
  return (
    <Modal title={title} onClose={onClose}>
      {description && <p style={{ fontSize: 13, color: "#7C7264", margin: "0 0 14px", lineHeight: 1.5 }}>{description}</p>}
      <Field label="Enlace">
        <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <Btn variant="ghost">Intentar abrir</Btn>
        </a>
        <Btn variant="clay" onClick={copiar}>{copiado ? "¡Copiado!" : "Copiar enlace"}</Btn>
      </div>
    </Modal>
  );
}

function buildGoogleCalendarUrl(t, pac) {
  const start = t.fecha.replace(/-/g, "") + "T" + t.hora.replace(":", "") + "00";
  const endDate = new Date(`${t.fecha}T${t.hora}:00`);
  endDate.setMinutes(endDate.getMinutes() + 30);
  const end = endDate.toISOString().slice(0, 19).replace(/[-:]/g, "");
  const title = `${t.actividad} - ${pac ? pac.nombre : "Paciente"} (KSC Studio)`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${encodeURIComponent(`Turno agendado desde el sistema de KSC Studio. Actividad: ${t.actividad}. Profesional: ${t.profesional}`)}&location=${encodeURIComponent("KSC Studio")}`;
}


// ================= PACIENTES =================
function ConfirmModal({ title, message, confirmLabel = "Eliminar", onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ fontSize: 14, color: "#5C5245", margin: "0 0 20px", lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="danger" onClick={onConfirm}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

// ================= REGISTRO DIARIO =================
function RegistroDiarioView({ registros, setRegistros, pacientes, setPacientes }) {
  const [semanaInicio, setSemanaInicio] = useState(mondayOf(todayISO()));
  const [showNew, setShowNew] = useState(false);
  const [editando, setEditando] = useState(null);
  const semanaFin = addDays(semanaInicio, 6);

  const pacienteById = (id) => pacientes.find((p) => p.id === id);

  const deLaSemana = useMemo(
    () => registros.filter((r) => r.fecha >= semanaInicio && r.fecha <= semanaFin).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [registros, semanaInicio, semanaFin]
  );

  const porPaciente = useMemo(() => {
    const map = {};
    deLaSemana.forEach((r) => {
      map[r.pacienteId] = (map[r.pacienteId] || 0) + 1;
    });
    return Object.entries(map)
      .map(([pacienteId, cantidad]) => ({ pacienteId, cantidad, nombre: pacienteById(pacienteId)?.nombre || "Paciente eliminado" }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [deLaSemana, pacientes]);

  const crearPacienteRapido = (nombre) => {
    if (!nombre) return null;
    const nuevo = { id: uid(), nombre, telefono: "", email: "", nacimiento: "", notas: "", historial: [] };
    setPacientes([...pacientes, nuevo]);
    return nuevo;
  };

  const addRegistro = (r) => setRegistros([...registros, { id: uid(), ...r }]);
  const updateRegistro = (id, patch) => setRegistros(registros.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const delRegistro = (id) => setRegistros(registros.filter((r) => r.id !== id));

  const cambiarSemana = (delta) => setSemanaInicio(addDays(semanaInicio, delta * 7));

  const descargarExcel = () => {
    const filas = deLaSemana.map((r) => ({
      Fecha: fmtDate(r.fecha),
      Hora: r.hora || "",
      Paciente: pacienteById(r.pacienteId)?.nombre || "Paciente eliminado",
      Profesional: r.profesional,
      "Individual o mensualidad": r.tipo,
      Notas: r.notas || "",
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Registro diario");
    XLSX.writeFile(libro, `registro-diario-KSC-${semanaInicio}.xlsx`);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Registro diario</h1>
          <p>Anotá cada persona que entra al consultorio, haya tenido turno agendado o no.</p>
        </div>
        <Btn variant="clay" onClick={() => setShowNew(true)}><Plus size={16} /> Nuevo registro</Btn>
      </div>

      <div className="panel" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="icon-btn" onClick={() => cambiarSemana(-1)}><ChevronLeft size={20} /></button>
        <input type="date" value={semanaInicio} onChange={(e) => setSemanaInicio(mondayOf(e.target.value))} style={{ border: "1px solid #D6CBB8", padding: "7px 10px", borderRadius: 3, fontFamily: "'IBM Plex Sans',sans-serif" }} />
        <button className="icon-btn" onClick={() => cambiarSemana(1)}><ChevronRight size={20} /></button>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 16 }}>Semana del {fmtDate(semanaInicio)} al {fmtDate(semanaFin)}</span>
        <button onClick={() => setSemanaInicio(mondayOf(todayISO()))} style={{ background: "none", border: "none", color: "#8C5A34", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Esta semana</button>
        <div style={{ marginLeft: "auto" }}>
          <Btn variant="ghost" small onClick={descargarExcel}><FileDown size={13} /> Descargar Excel</Btn>
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <h4 className="chart-title">Quién vino esta semana y cuántas veces</h4>
        {porPaciente.length === 0 ? <p className="muted-text">Todavía no hay registros esta semana.</p> : (
          <table>
            <thead><tr><th>Paciente</th><th>Veces esta semana</th></tr></thead>
            <tbody>
              {porPaciente.map((r) => (
                <tr key={r.pacienteId}><td style={{ fontWeight: 600 }}>{r.nombre}</td><td>{r.cantidad}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        {deLaSemana.length === 0 ? (
          <div className="empty-state">No hay registros cargados esta semana. Cargá el primero con "Nuevo registro".</div>
        ) : (
          <table>
            <thead><tr><th>Fecha</th><th>Hora</th><th>Paciente</th><th>Profesional</th><th>Tipo</th><th>Notas</th><th></th></tr></thead>
            <tbody>
              {deLaSemana.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.fecha)}</td>
                  <td>{r.hora || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{pacienteById(r.pacienteId)?.nombre || "Paciente eliminado"}</td>
                  <td>{r.profesional}</td>
                  <td><Badge tone={r.tipo === "Mensual" ? "clay" : "sage"}>{r.tipo}</Badge></td>
                  <td>{r.notas || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="icon-btn" title="Editar" onClick={() => setEditando(r)}><Pencil size={15} /></button>
                      <button className="icon-btn" title="Eliminar" onClick={() => delRegistro(r.id)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NuevoRegistroModal
          pacientes={pacientes}
          onCreatePaciente={crearPacienteRapido}
          onClose={() => setShowNew(false)}
          onSave={(r) => { addRegistro(r); setShowNew(false); }}
        />
      )}
      {editando && (
        <NuevoRegistroModal
          pacientes={pacientes}
          onCreatePaciente={crearPacienteRapido}
          initial={editando}
          onClose={() => setEditando(null)}
          onSave={(r) => { updateRegistro(editando.id, r); setEditando(null); }}
        />
      )}
    </div>
  );
}

function NuevoRegistroModal({ pacientes, onCreatePaciente, onClose, onSave, initial = null }) {
  const [pacienteId, setPacienteId] = useState(initial?.pacienteId || "");
  const [fecha, setFecha] = useState(initial?.fecha || todayISO());
  const [hora, setHora] = useState(initial?.hora || (() => new Date().toTimeString().slice(0, 5))());
  const [profesional, setProfesional] = useState(initial?.profesional || PROFESIONALES[0]);
  const [tipo, setTipo] = useState(initial?.tipo || TIPOS_PAGO[0]);
  const [notas, setNotas] = useState(initial?.notas || "");

  const pacienteSeleccionado = pacientes.find((p) => p.id === pacienteId);
  const mensualidad = estadoMensualidad(pacienteSeleccionado);

  return (
    <Modal title={initial ? "Editar registro" : "Nuevo registro de ingreso"} onClose={onClose}>
      <Field label="Paciente">
        <PatientPicker pacientes={pacientes} value={pacienteId} onChange={setPacienteId} onCreateNew={onCreatePaciente} />
      </Field>

      {mensualidad && (
        <div style={{
          background: mensualidad.dias < 0 ? "#F3D9D6" : mensualidad.dias <= 5 ? "#F1DDC9" : "#EDE6D8",
          color: mensualidad.dias < 0 ? "#8C2F32" : "#5C5245",
          padding: "10px 12px", fontSize: 13, marginBottom: 14, borderRadius: 3, display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>
            {mensualidad.dias < 0
              ? `Ojo: la mensualidad de ${pacienteSeleccionado.nombre} venció hace ${Math.abs(mensualidad.dias)} día(s) (el ${fmtDate(mensualidad.vencimiento)}).`
              : mensualidad.dias <= 5
              ? `La mensualidad de ${pacienteSeleccionado.nombre} vence en ${mensualidad.dias} día(s), el ${fmtDate(mensualidad.vencimiento)}. Aprovechá para avisarle.`
              : `Mensualidad vigente hasta el ${fmtDate(mensualidad.vencimiento)}.`}
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Horario"><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Field></div>
      </div>
      <Field label="Profesional">
        <select value={profesional} onChange={(e) => setProfesional(e.target.value)}>
          {PROFESIONALES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="¿Individual o mensualidad?">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_PAGO.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Notas (opcional)"><input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Alguna observación del día…" /></Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => pacienteId && onSave({ pacienteId, fecha, hora, profesional, tipo, notas })}>{initial ? "Guardar cambios" : "Guardar registro"}</Btn>
      </div>
    </Modal>
  );
}

function PacientesView({ pacientes, setPacientes, turnos }) {
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelectedRaw] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const restauradoRef = useRef(false);

  // Si la app se reinicia sola (por ejemplo al volver de otra ventana en el
  // celular), volvemos a abrir la ficha que estabas mirando.
  useEffect(() => {
    if (restauradoRef.current || pacientes.length === 0) return;
    restauradoRef.current = true;
    try {
      const id = localStorage.getItem("ksc:pacientes:selectedId");
      if (id) {
        const p = pacientes.find((x) => x.id === id);
        if (p) setSelectedRaw(p);
      }
    } catch {}
  }, [pacientes]);

  const setSelected = (p) => {
    setSelectedRaw(p);
    try {
      if (p) localStorage.setItem("ksc:pacientes:selectedId", p.id);
      else localStorage.removeItem("ksc:pacientes:selectedId");
    } catch {}
  };

  const filtrados = pacientes.filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase()));

  const addPaciente = (p) => setPacientes([...pacientes, { id: uid(), historial: [], notas: "", ...p }]);
  const updatePaciente = (id, patch) => setPacientes(pacientes.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const delPaciente = (id) => setPacientes(pacientes.filter((p) => p.id !== id));

  const descargarExcel = () => {
    const filas = filtrados.map((p) => ({
      Nombre: p.nombre,
      Teléfono: p.telefono || "",
      Email: p.email || "",
      "Fecha de nacimiento": p.nacimiento ? fmtDate(p.nacimiento) : "",
      "Fecha de ingreso al tratamiento": p.fechaIngreso ? fmtDate(p.fechaIngreso) : "",
      "Horario en el que asiste": p.horario || "",
      "Cómo nos conoció": p.comoConocio || "",
      "Plan de pago": p.planPago || "",
      "Vencimiento mensualidad": p.vencimientoMensualidad ? fmtDate(p.vencimientoMensualidad) : "",
      "Antecedentes / notas": p.notas || "",
      "Cantidad de turnos": turnos.filter((t) => t.pacienteId === p.id).length,
      "Historial médico": (p.historial || []).map((h) => `${fmtDate(h.fecha)}: ${h.nota}`).join("  |  "),
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 50 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Pacientes");
    XLSX.writeFile(libro, `pacientes-KSC-${todayISO()}.xlsx`);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Pacientes</h1>
          <p>Datos personales, contacto e historial clínico.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={descargarExcel}><FileDown size={16} /> Descargar Excel</Btn>
          <Btn variant="clay" onClick={() => setShowNew(true)}><Plus size={16} /> Nuevo paciente</Btn>
        </div>
      </div>

      <div className="panel" style={{ padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <Search size={16} color="#A89D8C" />
        <input type="text" placeholder="Buscar paciente por nombre…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: "none", fontSize: 14, fontFamily: "'IBM Plex Sans',sans-serif" }} />
      </div>

      <div className="panel">
        {filtrados.length === 0 ? (
          <div className="empty-state">No se encontraron pacientes.</div>
        ) : (
          <table>
            <thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Últimas visitas</th><th></th></tr></thead>
            <tbody>
              {filtrados.map((p) => {
                const visitas = turnos.filter((t) => t.pacienteId === p.id).length;
                return (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setSelected(p)}>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td>{p.telefono || "—"}</td>
                    <td>{p.email || "—"}</td>
                    <td>{visitas} turno{visitas !== 1 ? "s" : ""}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <Btn variant="ghost" small onClick={(e) => { e.stopPropagation(); setSelected(p); }}>Ver ficha</Btn>
                        <button className="icon-btn" title="Eliminar paciente" onClick={(e) => { e.stopPropagation(); setToDelete(p); }}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <PacienteModal
          title="Nuevo paciente"
          onClose={() => setShowNew(false)}
          onSave={(p) => { addPaciente(p); setShowNew(false); }}
        />
      )}
      {selected && (
        <FichaPacienteModal
          paciente={selected}
          turnos={turnos.filter((t) => t.pacienteId === selected.id)}
          onClose={() => setSelected(null)}
          onUpdate={(patch) => { updatePaciente(selected.id, patch); setSelected({ ...selected, ...patch }); }}
          onDelete={() => { setSelected(null); setToDelete(selected); }}
        />
      )}
      {toDelete && (
        <ConfirmModal
          title="Eliminar paciente"
          message={`¿Seguro que querés eliminar a ${toDelete.nombre}? Se va a borrar también su ficha e historial. Esta acción no se puede deshacer.`}
          onClose={() => setToDelete(null)}
          onConfirm={() => { delPaciente(toDelete.id); setToDelete(null); }}
        />
      )}
    </div>
  );
}

function PacienteModal({ title, onClose, onSave, initial = {} }) {
  const [nombre, setNombre] = useState(initial.nombre || "");
  const [telefono, setTelefono] = useState(initial.telefono || "");
  const [email, setEmail] = useState(initial.email || "");
  const [nacimiento, setNacimiento] = useState(initial.nacimiento || "");
  const [notas, setNotas] = useState(initial.notas || "");
  const [comoConocio, setComoConocio] = useState(initial.comoConocio || "");
  const [fechaIngreso, setFechaIngreso] = useState(initial.fechaIngreso || "");
  const [horario, setHorario] = useState(initial.horario || "");

  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Nombre completo"><input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Teléfono (WhatsApp)"><input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+549..." /></Field></div>
        <div style={{ flex: 1 }}><Field label="Fecha de nacimiento"><input type="date" value={nacimiento} onChange={(e) => setNacimiento(e.target.value)} /></Field></div>
      </div>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="paciente@mail.com" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Fecha de ingreso al tratamiento"><input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}>
          <Field label="Horario en el que asiste">
            <select value={horario} onChange={(e) => setHorario(e.target.value)}>
              <option value="">Sin especificar</option>
              {HORARIOS_ASISTENCIA.map((h) => <option key={h}>{h}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <Field label="¿Cómo nos conoció?">
        <select value={comoConocio} onChange={(e) => setComoConocio(e.target.value)}>
          <option value="">Sin especificar</option>
          {FUENTES_CONTACTO.map((f) => <option key={f}>{f}</option>)}
        </select>
      </Field>
      <Field label="Notas / antecedentes"><textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Alergias, observaciones, preferencias…" /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => nombre.trim() && onSave({ nombre: nombre.trim(), telefono, email, nacimiento, notas, comoConocio, fechaIngreso, horario })}>Guardar</Btn>
      </div>
    </Modal>
  );
}

function FichaPacienteModal({ paciente, turnos, onClose, onUpdate, onDelete }) {
  const [editando, setEditando] = useState(false);
  const [fechaNota, setFechaNota] = useState(todayISO());
  const [resumenNota, setResumenNota] = useState("");

  const agregarNota = () => {
    if (!resumenNota.trim()) return;
    const historial = [...(paciente.historial || []), { fecha: fechaNota, nota: resumenNota.trim() }];
    historial.sort((a, b) => a.fecha.localeCompare(b.fecha));
    onUpdate({ historial });
    setResumenNota("");
    setFechaNota(todayISO());
  };

  if (editando) {
    return (
      <PacienteModal
        title="Editar paciente"
        initial={paciente}
        onClose={() => setEditando(false)}
        onSave={(p) => { onUpdate(p); setEditando(false); }}
      />
    );
  }

  return (
    <Modal title={paciente.nombre} onClose={onClose} wide>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 18 }}>
        <InfoLine icon={<Phone size={14} />} text={paciente.telefono || "Sin teléfono"} />
        <InfoLine icon={<Mail size={14} />} text={paciente.email || "Sin email"} />
        <InfoLine icon={<Calendar size={14} />} text={paciente.nacimiento ? fmtDate(paciente.nacimiento) : "Sin fecha de nacimiento"} />
        {paciente.comoConocio && <InfoLine icon={<MessageCircle size={14} />} text={`Nos conoció por: ${paciente.comoConocio}`} />}
        {paciente.fechaIngreso && <InfoLine icon={<Calendar size={14} />} text={`Ingresó el ${fmtDate(paciente.fechaIngreso)}`} />}
        {paciente.horario && <InfoLine icon={<Clock size={14} />} text={`Asiste de ${paciente.horario.toLowerCase()}`} />}
      </div>
      {estadoMensualidad(paciente) && (
        <div style={{
          background: estadoMensualidad(paciente).dias < 0 ? "#F3D9D6" : estadoMensualidad(paciente).dias <= 5 ? "#F1DDC9" : "#EDE6D8",
          color: estadoMensualidad(paciente).dias < 0 ? "#8C2F32" : "#5C5245",
          padding: "10px 12px", fontSize: 13.5, marginBottom: 18, borderRadius: 3,
        }}>
          {estadoMensualidad(paciente).dias < 0
            ? `Mensualidad vencida hace ${Math.abs(estadoMensualidad(paciente).dias)} día(s) (vencía el ${fmtDate(estadoMensualidad(paciente).vencimiento)})`
            : `Mensualidad vigente, vence el ${fmtDate(estadoMensualidad(paciente).vencimiento)} (en ${estadoMensualidad(paciente).dias} día(s))`}
        </div>
      )}
      {paciente.notas && (
        <div style={{ background: "#F2ECDE", border: "1px solid #E9E1D3", padding: "10px 12px", fontSize: 13.5, marginBottom: 18, borderRadius: 3 }}>
          <strong>Antecedentes: </strong>{paciente.notas}
        </div>
      )}

      <h4 className="subhead">Turnos agendados</h4>
      {turnos.length === 0 ? <p className="muted-text">Sin turnos registrados.</p> : (
        <ul className="plain-list">
          {turnos.sort((a, b) => b.fecha.localeCompare(a.fecha)).map((t) => (
            <li key={t.id}>{fmtDate(t.fecha)} · {t.hora} · {t.actividad || t.motivo} · <Badge tone={t.estado === "Cancelado" ? "coral" : "pine"}>{t.estado}</Badge></li>
          ))}
        </ul>
      )}

      <h4 className="subhead">Ficha médica — historial de consultas</h4>
      <p className="muted-text" style={{ marginTop: -4 }}>Cada vez que el paciente asiste, dejá la fecha y un resumen breve de la consulta.</p>
      {(paciente.historial || []).length === 0 ? <p className="muted-text">Todavía no hay entradas en la ficha.</p> : (
        <ul className="record-list">
          {[...paciente.historial].reverse().map((h, i) => (
            <li key={i} className="record-item">
              <span className="record-date">{fmtDate(h.fecha)}</span>
              <span className="record-note">{h.nota}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="record-form">
        <input type="date" value={fechaNota} onChange={(e) => setFechaNota(e.target.value)} className="record-date-input" />
        <input type="text" placeholder="Resumen de la consulta de hoy…" value={resumenNota} onChange={(e) => setResumenNota(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregarNota()} className="record-note-input" />
        <Btn variant="primary" small onClick={agregarNota}>Agregar a la ficha</Btn>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 22, borderTop: "1px solid #E9E1D3", paddingTop: 16 }}>
        <Btn variant="danger" onClick={onDelete}><Trash2 size={14} /> Eliminar paciente</Btn>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={() => setEditando(true)}>Editar datos</Btn>
          <Btn variant="primary" onClick={onClose}>Cerrar</Btn>
        </div>
      </div>
      <style>{`
        .subhead{ font-family:'Fraunces',serif; font-size:15px; font-weight:600; margin:18px 0 8px; color:#14100C; }
        .muted-text{ color:#A89D8C; font-size:13.5px; margin:0 0 8px; }
        .plain-list{ list-style:none; padding:0; margin:0; font-size:13.5px; display:flex; flex-direction:column; gap:7px; }
        .record-list{ list-style:none; padding:0; margin:0 0 12px; display:flex; flex-direction:column; gap:0; border:1px solid #E9E1D3; border-radius:3px; overflow:hidden; }
        .record-item{ display:flex; gap:14px; padding:10px 12px; font-size:13.5px; border-bottom:1px solid #F0E9DC; background:#FBF9F4; }
        .record-item:last-child{ border-bottom:none; }
        .record-date{ flex:0 0 90px; color:#8C5A34; font-weight:600; }
        .record-note{ color:#14100C; }
        .record-form{ display:flex; gap:8px; }
        .record-date-input{ width:140px; flex:0 0 140px; border:1px solid #D6CBB8; border-radius:3px; padding:8px 10px; font-family:'IBM Plex Sans',sans-serif; }
        .record-note-input{ flex:1; border:1px solid #D6CBB8; border-radius:3px; padding:8px 10px; font-family:'IBM Plex Sans',sans-serif; }
      `}</style>
    </Modal>
  );
}

function InfoLine({ icon, text }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "#5C5245" }}>{icon}{text}</span>;
}

// ================= COBROS =================
function CobrosView({ cobros, setCobros, pacientes, setPacientes, turnos }) {
  const [showNew, setShowNew] = useState(false);
  const [mesFiltro, setMesFiltro] = useState(todayISO().slice(0, 7));
  const [tab, setTab] = useState("mes");

  const delMes = cobros.filter((c) => c.fecha.slice(0, 7) === mesFiltro).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalMes = delMes.reduce((acc, c) => acc + Number(c.monto || 0), 0);
  const addCobro = (c) => {
    setCobros([...cobros, { id: uid(), ...c }]);
    if (c.tipoPago === "Mensual") {
      const vencimiento = addMonths(c.fecha, 1);
      setPacientes(pacientes.map((p) => (p.id === c.pacienteId ? { ...p, planPago: "Mensual", vencimientoMensualidad: vencimiento } : p)));
    } else if (c.tipoPago === "Individual") {
      setPacientes(pacientes.map((p) => (p.id === c.pacienteId ? { ...p, planPago: "Individual" } : p)));
    }
  };
  const delCobro = (id) => setCobros(cobros.filter((c) => c.id !== id));
  const crearPacienteRapido = (nombre) => {
    if (!nombre) return null;
    const nuevo = { id: uid(), nombre, telefono: "", email: "", nacimiento: "", notas: "", historial: [] };
    setPacientes([...pacientes, nuevo]);
    return nuevo;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Cobros</h1>
          <p>Registro de pagos y estado financiero del consultorio.</p>
        </div>
        <Btn variant="clay" onClick={() => setShowNew(true)}><Plus size={16} /> Registrar cobro</Btn>
      </div>

      <div className="tab-switch">
        <button className={"tab-btn" + (tab === "mes" ? " active" : "")} onClick={() => setTab("mes")}>Cobros del mes</button>
        <button className={"tab-btn" + (tab === "semana" ? " active" : "")} onClick={() => setTab("semana")}>Reporte semanal</button>
        <button className={"tab-btn" + (tab === "vencimientos" ? " active" : "")} onClick={() => setTab("vencimientos")}>Vencimientos</button>
      </div>

      {tab === "mes" ? (
        <>
          <div className="panel" style={{ padding: "16px 20px", marginBottom: 18, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Field label="Mes"><input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} /></Field>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#7C7264" }}>Total cobrado en el mes</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 26, color: "#8C5A34", fontWeight: 600 }}>{fmtMoney(totalMes)}</div>
            </div>
          </div>

          <div className="panel">
            {delMes.length === 0 ? (
              <div className="empty-state">No hay cobros registrados en este mes.</div>
            ) : (
              <table>
                <thead><tr><th>Fecha</th><th>Paciente</th><th>Tipo de servicio</th><th>Concepto</th><th>Método</th><th>Monto</th><th></th></tr></thead>
                <tbody>
                  {delMes.map((c) => {
                    const pac = pacientes.find((p) => p.id === c.pacienteId);
                    return (
                      <tr key={c.id}>
                        <td>{fmtDate(c.fecha)}</td>
                        <td>{pac ? pac.nombre : "—"}</td>
                        <td>{c.tipoServicio ? <Badge tone="clay">{c.tipoServicio}</Badge> : "—"}</td>
                        <td>{c.concepto}</td>
                        <td><Badge tone="sage">{c.metodo}</Badge></td>
                        <td style={{ fontWeight: 600 }}>{fmtMoney(c.monto)}</td>
                        <td><button className="icon-btn" onClick={() => delCobro(c.id)}><Trash2 size={15} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : tab === "semana" ? (
        <ReporteSemanalView cobros={cobros} turnos={turnos} pacientes={pacientes} />
      ) : (
        <VencimientosView pacientes={pacientes} />
      )}

      {showNew && (
        <Modal title="Registrar cobro" onClose={() => setShowNew(false)}>
          <NuevoCobroForm pacientes={pacientes} onCreatePaciente={crearPacienteRapido} turnos={turnos} onSave={(c) => { addCobro(c); setShowNew(false); }} onClose={() => setShowNew(false)} />
        </Modal>
      )}
    </div>
  );
}

function VencimientosView({ pacientes }) {
  const [waPaciente, setWaPaciente] = useState(null);

  const conMensualidad = pacientes
    .filter((p) => p.planPago === "Mensual" && p.vencimientoMensualidad)
    .map((p) => ({ ...p, dias: diasEntre(todayISO(), p.vencimientoMensualidad) }))
    .sort((a, b) => a.dias - b.dias);

  return (
    <div>
      <div className="panel">
        {conMensualidad.length === 0 ? (
          <div className="empty-state">Ningún paciente con mensualidad cargada todavía. Se completa solo cuando registrás un cobro tipo "Mensual".</div>
        ) : (
          <table>
            <thead><tr><th>Paciente</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {conMensualidad.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                  <td>{fmtDate(p.vencimientoMensualidad)}</td>
                  <td>
                    {p.dias < 0
                      ? <Badge tone="coral">Vencida hace {Math.abs(p.dias)} día(s)</Badge>
                      : p.dias <= 5
                      ? <Badge tone="clay">Vence en {p.dias} día(s)</Badge>
                      : <Badge tone="sage">Vigente ({p.dias} días)</Badge>}
                  </td>
                  <td>
                    {p.telefono
                      ? <Btn variant="clay" small onClick={() => setWaPaciente(p)}><MessageCircle size={13} /> WhatsApp</Btn>
                      : <span className="muted-text" style={{ fontSize: 12.5 }}>Sin teléfono</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {waPaciente && (
        <WhatsAppModal
          nombre={waPaciente.nombre}
          telefono={waPaciente.telefono}
          mensaje={waVencimiento(waPaciente.nombre, waPaciente.vencimientoMensualidad, waPaciente.dias)}
          onClose={() => setWaPaciente(null)}
        />
      )}
    </div>
  );
}

function waVencimiento(nombre, vencimiento, dias) {
  const primerNombre = nombre.split(" ")[0];
  if (dias < 0) return `Hola ${primerNombre}! Te contactamos de KSC Studio porque tu mensualidad venció el ${fmtDate(vencimiento)}. ¿Coordinamos la renovación?`;
  return `Hola ${primerNombre}! Te recordamos desde KSC Studio que tu mensualidad vence el ${fmtDate(vencimiento)}. ¡Te esperamos para renovarla!`;
}

function ReporteSemanalView({ cobros, turnos, pacientes }) {
  const [semanaInicio, setSemanaInicio] = useState(mondayOf(todayISO()));
  const semanaFin = addDays(semanaInicio, 6);

  const turnosSemana = useMemo(
    () => turnos.filter((t) => t.fecha >= semanaInicio && t.fecha <= semanaFin),
    [turnos, semanaInicio, semanaFin]
  );
  const cobrosSemana = useMemo(
    () => cobros.filter((c) => c.fecha >= semanaInicio && c.fecha <= semanaFin).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [cobros, semanaInicio, semanaFin]
  );

  const totalRecaudado = cobrosSemana.reduce((a, c) => a + Number(c.monto || 0), 0);
  const ticketPromedio = cobrosSemana.length ? totalRecaudado / cobrosSemana.length : 0;

  const porProfesional = useMemo(() => {
    const map = {};
    turnosSemana.forEach((t) => {
      if (!map[t.profesional]) map[t.profesional] = { profesional: t.profesional, total: 0, atendidos: 0, cancelados: 0 };
      map[t.profesional].total += 1;
      if (t.estado === "Atendido") map[t.profesional].atendidos += 1;
      if (t.estado === "Cancelado") map[t.profesional].cancelados += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [turnosSemana]);

  const porActividad = useMemo(() => {
    const map = {};
    turnosSemana.forEach((t) => { map[t.actividad] = (map[t.actividad] || 0) + 1; });
    return Object.entries(map).map(([actividad, cantidad]) => ({ actividad, cantidad }));
  }, [turnosSemana]);

  const porMetodo = useMemo(() => {
    const map = {};
    cobrosSemana.forEach((c) => { map[c.metodo] = (map[c.metodo] || 0) + Number(c.monto || 0); });
    return Object.entries(map).map(([metodo, monto]) => ({ metodo, monto }));
  }, [cobrosSemana]);

  const porPaciente = useMemo(() => {
    const map = {};
    cobrosSemana.forEach((c) => {
      const key = c.pacienteId;
      if (!map[key]) map[key] = { pacienteId: key, total: 0, pagos: [] };
      map[key].total += Number(c.monto || 0);
      map[key].pagos.push(c);
    });
    return Object.values(map)
      .map((r) => ({ ...r, nombre: pacientes.find((p) => p.id === r.pacienteId)?.nombre || "Paciente eliminado" }))
      .sort((a, b) => b.total - a.total);
  }, [cobrosSemana, pacientes]);

  const cancelados = turnosSemana.filter((t) => t.estado === "Cancelado").length;
  const tasaCancelacion = turnosSemana.length ? Math.round((cancelados / turnosSemana.length) * 100) : 0;

  const cambiarSemana = (delta) => setSemanaInicio(addDays(semanaInicio, delta * 7));

  const descargarInforme = () => {
    const filas = (arr, cols) => arr.map((r) => `<tr>${cols.map((c) => `<td>${c(r)}</td>`).join("")}</tr>`).join("");
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte semanal KSC Studio</title>
<style>
  body{ font-family:'IBM Plex Sans',Arial,sans-serif; background:#F5F1E9; color:#14100C; margin:0; padding:36px; }
  .brand{ display:flex; align-items:center; gap:14px; margin-bottom:26px; }
  .badge{ width:52px; height:52px; background:#0A0A0A; border:2px solid #BC7F55; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .badge b{ color:#BC7F55; font-size:15px; line-height:1; }
  .badge span{ color:#BC7F55; font-size:6.5px; letter-spacing:1.5px; margin-top:2px; }
  h1{ font-size:22px; margin:0; }
  h1 + p{ margin:2px 0 0; color:#7C7264; font-size:13px; }
  h2{ font-size:15px; border-bottom:2px solid #BC7F55; padding-bottom:6px; margin:30px 0 12px; }
  table{ width:100%; border-collapse:collapse; font-size:13px; background:#fff; }
  th{ text-align:left; background:#EDE6D8; padding:8px 10px; font-size:11.5px; color:#5C5245; }
  td{ padding:8px 10px; border-bottom:1px solid #F0E9DC; }
  .stats{ display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; }
  .stat{ background:#fff; border:1px solid #E5DDCE; border-radius:6px; padding:14px 18px; min-width:150px; }
  .stat .label{ font-size:11.5px; color:#7C7264; }
  .stat .value{ font-size:22px; font-weight:700; margin-top:4px; }
  .foot{ margin-top:34px; font-size:11.5px; color:#A89D8C; }
  @media print{ body{ background:#fff; } }
</style></head><body>
  <div class="brand"><div class="badge"><b>KSC</b><span>STUDIO</span></div><div><h1>Reporte semanal</h1><p>Semana del ${fmtDate(semanaInicio)} al ${fmtDate(semanaFin)}</p></div></div>

  <div class="stats">
    <div class="stat"><div class="label">Total recaudado</div><div class="value">${fmtMoney(totalRecaudado)}</div></div>
    <div class="stat"><div class="label">Cobros registrados</div><div class="value">${cobrosSemana.length}</div></div>
    <div class="stat"><div class="label">Ticket promedio</div><div class="value">${fmtMoney(ticketPromedio)}</div></div>
    <div class="stat"><div class="label">Turnos totales</div><div class="value">${turnosSemana.length}</div></div>
    <div class="stat"><div class="label">Tasa de cancelación</div><div class="value">${tasaCancelacion}%</div></div>
  </div>

  <h2>Turnos por profesional</h2>
  <table><thead><tr><th>Profesional</th><th>Turnos totales</th><th>Atendidos</th><th>Cancelados</th></tr></thead>
  <tbody>${porProfesional.length ? filas(porProfesional, [r => r.profesional, r => r.total, r => r.atendidos, r => r.cancelados]) : '<tr><td colspan="4">Sin turnos esta semana.</td></tr>'}</tbody></table>

  <h2>Turnos por actividad</h2>
  <table><thead><tr><th>Actividad</th><th>Cantidad</th></tr></thead>
  <tbody>${porActividad.length ? filas(porActividad, [r => r.actividad, r => r.cantidad]) : '<tr><td colspan="2">Sin turnos esta semana.</td></tr>'}</tbody></table>

  <h2>Recaudado por método de pago</h2>
  <table><thead><tr><th>Método</th><th>Monto</th></tr></thead>
  <tbody>${porMetodo.length ? filas(porMetodo, [r => r.metodo, r => fmtMoney(r.monto)]) : '<tr><td colspan="2">Sin cobros esta semana.</td></tr>'}</tbody></table>

  <h2>Cómo pagó cada paciente</h2>
  <table><thead><tr><th>Paciente</th><th>Total pagado</th><th>Detalle</th></tr></thead>
  <tbody>${porPaciente.length ? filas(porPaciente, [
    r => r.nombre,
    r => fmtMoney(r.total),
    r => r.pagos.map((p) => `${fmtDate(p.fecha)} · ${p.concepto} · ${p.metodo} · ${fmtMoney(p.monto)}`).join("<br/>")
  ]) : '<tr><td colspan="3">Sin cobros esta semana.</td></tr>'}</tbody></table>

  <div class="foot">Generado desde el sistema de gestión de KSC Studio el ${fmtDate(todayISO())}. Para guardarlo como PDF, abrí este archivo y usá "Imprimir → Guardar como PDF".</div>
</body></html>`;
    descargarArchivo(`reporte-semanal-KSC-${semanaInicio}.html`, html, "text/html;charset=utf-8");
  };

  const descargarCSV = () => {
    const header = ["Fecha", "Paciente", "Concepto", "Metodo", "Monto"];
    const rows = cobrosSemana.map((c) => [
      c.fecha,
      pacientes.find((p) => p.id === c.pacienteId)?.nombre || "Paciente eliminado",
      c.concepto,
      c.metodo,
      c.monto,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\n");
    descargarArchivo(`cobros-semana-KSC-${semanaInicio}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
  };

  return (
    <div>
      <div className="panel" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="icon-btn" onClick={() => cambiarSemana(-1)}><ChevronLeft size={20} /></button>
        <input type="date" value={semanaInicio} onChange={(e) => setSemanaInicio(mondayOf(e.target.value))} style={{ border: "1px solid #D6CBB8", padding: "7px 10px", borderRadius: 3, fontFamily: "'IBM Plex Sans',sans-serif" }} />
        <button className="icon-btn" onClick={() => cambiarSemana(1)}><ChevronRight size={20} /></button>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 16 }}>Semana del {fmtDate(semanaInicio)} al {fmtDate(semanaFin)}</span>
        <button onClick={() => setSemanaInicio(mondayOf(todayISO()))} style={{ background: "none", border: "none", color: "#8C5A34", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Esta semana</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn variant="ghost" small onClick={descargarCSV}><Download size={13} /> CSV de cobros</Btn>
          <Btn variant="clay" small onClick={descargarInforme}><FileDown size={13} /> Descargar informe</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label="Total recaudado" value={fmtMoney(totalRecaudado)} />
        <StatCard label="Cobros registrados" value={cobrosSemana.length} />
        <StatCard label="Ticket promedio" value={fmtMoney(ticketPromedio)} />
        <StatCard label="Turnos totales" value={turnosSemana.length} />
        <StatCard label="Tasa de cancelación" value={`${tasaCancelacion}%`} />
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <h4 className="chart-title">Turnos por profesional</h4>
        {porProfesional.length === 0 ? <p className="muted-text">Sin turnos cargados esta semana.</p> : (
          <table>
            <thead><tr><th>Profesional</th><th>Turnos</th><th>Atendidos</th><th>Cancelados</th></tr></thead>
            <tbody>
              {porProfesional.map((r) => (
                <tr key={r.profesional}>
                  <td style={{ fontWeight: 600 }}>{r.profesional}</td>
                  <td>{r.total}</td>
                  <td>{r.atendidos}</td>
                  <td>{r.cancelados > 0 ? <Badge tone="coral">{r.cancelados}</Badge> : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <h4 className="chart-title">Recaudado por método de pago</h4>
        {porMetodo.length === 0 ? <p className="muted-text">Sin cobros esta semana.</p> : (
          <table>
            <thead><tr><th>Método</th><th>Monto</th></tr></thead>
            <tbody>
              {porMetodo.map((r) => (
                <tr key={r.metodo}><td><Badge tone="sage">{r.metodo}</Badge></td><td style={{ fontWeight: 600 }}>{fmtMoney(r.monto)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <h4 className="chart-title">Cómo pagó cada paciente</h4>
        {porPaciente.length === 0 ? <p className="muted-text">Sin cobros esta semana.</p> : (
          <table>
            <thead><tr><th>Paciente</th><th>Pagos</th><th>Total</th></tr></thead>
            <tbody>
              {porPaciente.map((r) => (
                <tr key={r.pacienteId}>
                  <td style={{ fontWeight: 600 }}>{r.nombre}</td>
                  <td>{r.pagos.map((p) => p.metodo).join(", ")}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <style>{`.chart-title{ font-family:'Fraunces',serif; font-size:15.5px; font-weight:600; margin:0 0 14px; }`}</style>
    </div>
  );
}

function NuevoCobroForm({ pacientes, onCreatePaciente, onSave, onClose }) {
  const [pacienteId, setPacienteId] = useState("");
  const [concepto, setConcepto] = useState("Consulta");
  const [tipoServicio, setTipoServicio] = useState(TIPOS_SERVICIO[0]);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState(METODOS_PAGO[0]);
  const [fecha, setFecha] = useState(todayISO());
  const [tipoPago, setTipoPago] = useState(TIPOS_PAGO[0]);

  return (
    <>
      <Field label="Paciente">
        <PatientPicker pacientes={pacientes} value={pacienteId} onChange={setPacienteId} onCreateNew={onCreatePaciente} />
      </Field>
      <Field label="Tipo de servicio">
        <select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)}>
          {TIPOS_SERVICIO.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Concepto"><input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Monto (ARS)"><input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Método de pago">
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {METODOS_PAGO.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="¿Individual o mensualidad?">
            <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value)}>
              {TIPOS_PAGO.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
      </div>
      {tipoPago === "Mensual" && (
        <p style={{ fontSize: 12.5, color: "#7C7264", margin: "-8px 0 14px", lineHeight: 1.5 }}>
          Al guardar, la ficha del paciente va a mostrar que su mensualidad vence el {fmtDate(addMonths(fecha, 1))}, y todo el equipo va a ver ese aviso al registrar su ingreso.
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => monto && pacienteId && onSave({ pacienteId, concepto, tipoServicio, monto: Number(monto), metodo, fecha, tipoPago })}>Guardar cobro</Btn>
      </div>
    </>
  );
}

// ================= SEGUIMIENTO =================
function SeguimientoView({ pacientes, turnos, contactos, setContactos }) {
  const [umbralDias, setUmbralDias] = useState(45);
  const [waPaciente, setWaPaciente] = useState(null);

  const inactivos = useMemo(() => {
    const hoy = new Date();
    return pacientes
      .map((p) => {
        const turnosPac = turnos.filter((t) => t.pacienteId === p.id && t.estado !== "Cancelado");
        if (turnosPac.length === 0) return null;
        const ultima = turnosPac.reduce((max, t) => (t.fecha > max ? t.fecha : max), turnosPac[0].fecha);
        const dias = Math.floor((hoy - new Date(ultima + "T00:00:00")) / 86400000);
        if (dias < umbralDias) return null;
        return { paciente: p, ultima, dias, ultimoContacto: contactos[p.id] };
      })
      .filter(Boolean)
      .sort((a, b) => b.dias - a.dias);
  }, [pacientes, turnos, contactos, umbralDias]);

  const marcarContactado = (pacienteId) => {
    setContactos({ ...contactos, [pacienteId]: todayISO() });
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Seguimiento</h1>
          <p>Pacientes que dejaron de venir y conviene recontactar.</p>
        </div>
        <Field label="Avisar después de (días sin turno)">
          <input type="number" value={umbralDias} onChange={(e) => setUmbralDias(Number(e.target.value) || 0)} style={{ width: 90 }} />
        </Field>
      </div>

      <div className="panel">
        {inactivos.length === 0 ? (
          <div className="empty-state">Ningún paciente supera el umbral configurado. 👍</div>
        ) : (
          <table>
            <thead><tr><th>Paciente</th><th>Último turno</th><th>Días sin venir</th><th>Último contacto</th><th></th></tr></thead>
            <tbody>
              {inactivos.map(({ paciente, ultima, dias, ultimoContacto }) => (
                <tr key={paciente.id}>
                  <td style={{ fontWeight: 600 }}>{paciente.nombre}</td>
                  <td>{fmtDate(ultima)}</td>
                  <td><Badge tone={dias > 90 ? "coral" : "clay"}><AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: -1 }} />{dias} días</Badge></td>
                  <td>{ultimoContacto ? fmtDate(ultimoContacto) : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      {paciente.telefono ? (
                        <Btn variant="clay" small onClick={() => setWaPaciente(paciente)}><MessageCircle size={13} /> WhatsApp</Btn>
                      ) : <span className="muted-text" style={{ fontSize: 12.5 }}>Sin teléfono</span>}
                      <Btn variant="ghost" small onClick={() => marcarContactado(paciente.id)}><Check size={13} /> Marcar contactado</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {waPaciente && (
        <WhatsAppModal
          nombre={waPaciente.nombre}
          telefono={waPaciente.telefono}
          mensaje={waSeguimiento(waPaciente.nombre)}
          onClose={() => setWaPaciente(null)}
        />
      )}
    </div>
  );
}

// ================= REPORTES =================
function ReportesView({ turnos, cobros, pacientes }) {
  const ultimosMeses = useMemo(() => {
    const meses = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
      meses.push(dd.toISOString().slice(0, 7));
    }
    return meses;
  }, []);

  const dataTurnos = ultimosMeses.map((m) => ({
    mes: labelMes(m),
    turnos: turnos.filter((t) => t.fecha.slice(0, 7) === m).length,
  }));

  const dataIngresos = ultimosMeses.map((m) => ({
    mes: labelMes(m),
    ingresos: cobros.filter((c) => c.fecha.slice(0, 7) === m).reduce((a, c) => a + Number(c.monto || 0), 0),
  }));

  const porProfesional = useMemo(() => {
    const map = {};
    turnos.forEach((t) => { map[t.profesional] = (map[t.profesional] || 0) + 1; });
    return Object.entries(map).map(([profesional, turnos]) => ({ profesional, turnos }));
  }, [turnos]);

  const totalIngresosHistorico = cobros.reduce((a, c) => a + Number(c.monto || 0), 0);
  const tasaCancelacion = turnos.length ? Math.round((turnos.filter((t) => t.estado === "Cancelado").length / turnos.length) * 100) : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Reportes</h1>
          <p>Panorama general del consultorio.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label="Pacientes totales" value={pacientes.length} />
        <StatCard label="Turnos cargados" value={turnos.length} />
        <StatCard label="Ingresos históricos" value={fmtMoney(totalIngresosHistorico)} />
        <StatCard label="Tasa de cancelación" value={`${tasaCancelacion}%`} />
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <h4 className="chart-title">Turnos por mes</h4>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataTurnos}>
              <CartesianGrid stroke="#E5E4D8" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} stroke="#B9B8AC" />
              <YAxis tick={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} stroke="#B9B8AC" allowDecimals={false} />
              <Tooltip contentStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13, border: "1px solid #E5DDCE" }} />
              <Bar dataKey="turnos" fill="#8C5A34" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <h4 className="chart-title">Ingresos por mes</h4>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dataIngresos}>
              <CartesianGrid stroke="#E5E4D8" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} stroke="#B9B8AC" />
              <YAxis tick={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} stroke="#B9B8AC" />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13, border: "1px solid #E5DDCE" }} />
              <Line type="monotone" dataKey="ingresos" stroke="#BC7F55" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <h4 className="chart-title">Turnos por profesional</h4>
        {porProfesional.length === 0 ? <p className="muted-text">Todavía no hay turnos cargados.</p> : (
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porProfesional} layout="vertical">
                <CartesianGrid stroke="#E5E4D8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} stroke="#B9B8AC" allowDecimals={false} />
                <YAxis type="category" dataKey="profesional" tick={{ fontSize: 12.5, fontFamily: "IBM Plex Sans" }} stroke="#B9B8AC" width={110} />
                <Tooltip contentStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13, border: "1px solid #E5DDCE" }} />
                <Bar dataKey="turnos" fill="#9C9284" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <style>{`.chart-title{ font-family:'Fraunces',serif; font-size:15.5px; font-weight:600; margin:0 0 14px; }`}</style>
    </div>
  );
}

function labelMes(iso) {
  const [y, m] = iso.split("-");
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[Number(m) - 1]} '${y.slice(2)}`;
}

function StatCard({ label, value }) {
  return (
    <div className="panel" style={{ padding: "16px 20px", flex: "1 1 180px", minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "#7C7264", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 600, color: "#14100C" }}>{value}</div>
    </div>
  );
}
