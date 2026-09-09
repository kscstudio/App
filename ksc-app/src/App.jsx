import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar, Users, Wallet, Bell, BarChart3, Plus, X, Phone,
  Mail, Search, ChevronLeft, ChevronRight, CalendarPlus,
  MessageCircle, Check, Trash2, Clock, AlertTriangle, Download, FileDown,
  LogOut, KeyRound, ShieldCheck, Lock, User as UserIcon, Menu
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";
import { supabase } from "./supabaseClient";
import { useSupabaseTable, useContactosSupabase, mapPacientes, mapTurnos, mapCobros, mapPerfiles } from "./lib/supabaseHooks";

// ---------- Utilidades ----------
const uid = () => Math.random().toString(36).slice(2, 10);
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

const PROFESIONALES = ["Santiago Remon", "Franco Tosi", "Franco Gutierrez", "Sebastian Caminio", "Jeremias Aime"];
const ACTIVIDADES = ["Osteopatía", "Kinefilaxia", "Recovery"];
const MOTIVOS = ["Primera consulta", "Control", "Tratamiento", "Revisión", "Otro"];
const ESTADOS = ["Pendiente", "Confirmado", "Cancelado", "Atendido"];
const METODOS_PAGO = ["Efectivo", "Transferencia", "Tarjeta débito", "Tarjeta crédito"];

const NAV_ITEMS = [
  { key: "agenda", label: "Agenda", icon: Calendar, roles: ["admin", "staff"] },
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
