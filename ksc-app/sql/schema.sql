-- =====================================================================
-- KSC Studio — esquema de base de datos para Supabase
-- Pegar este archivo completo en Supabase → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- PERFILES (uno por cada persona del equipo) ----------
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  usuario text unique not null,
  rol text not null check (rol in ('admin','staff')),
  debe_cambiar_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- PACIENTES ----------
create table if not exists pacientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text default '',
  email text default '',
  nacimiento date,
  notas text default '',
  historial jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ---------- TURNOS ----------
create table if not exists turnos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid references pacientes(id) on delete set null,
  actividad text not null,
  profesional text not null,
  fecha date not null,
  hora time not null,
  motivo text default '',
  estado text not null default 'Pendiente' check (estado in ('Pendiente','Confirmado','Cancelado','Atendido')),
  created_at timestamptz not null default now()
);

-- ---------- COBROS ----------
create table if not exists cobros (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid references pacientes(id) on delete set null,
  concepto text default '',
  monto numeric not null default 0,
  metodo text not null,
  fecha date not null,
  created_at timestamptz not null default now()
);

-- ---------- CONTACTOS DE SEGUIMIENTO ----------
create table if not exists contactos (
  paciente_id uuid primary key references pacientes(id) on delete cascade,
  fecha date not null
);

-- =====================================================================
-- SEGURIDAD (Row Level Security)
-- Cualquiera del equipo (logueado) puede ver/editar pacientes, turnos
-- y seguimiento. Cobros queda reservado SOLO para perfiles con rol admin.
-- =====================================================================

alter table perfiles enable row level security;
alter table pacientes enable row level security;
alter table turnos enable row level security;
alter table cobros enable row level security;
alter table contactos enable row level security;

-- Helper: ¿el usuario logueado es admin?
create or replace function es_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'admin'
  );
$$;

-- PERFILES: cualquier persona logueada puede ver la lista del equipo.
create policy "perfiles_select" on perfiles for select
  to authenticated using (true);

-- PERFILES: cada uno puede actualizar su propia fila (ej. sacarse el
-- flag de "debe cambiar password"); los admins pueden actualizar cualquiera
-- (ej. cambiar el rol de alguien).
create policy "perfiles_update" on perfiles for update
  to authenticated using (id = auth.uid() or es_admin());

-- PACIENTES / TURNOS / CONTACTOS: acceso total para cualquier persona
-- logueada del equipo.
create policy "pacientes_all" on pacientes for all
  to authenticated using (true) with check (true);

create policy "turnos_all" on turnos for all
  to authenticated using (true) with check (true);

create policy "contactos_all" on contactos for all
  to authenticated using (true) with check (true);

-- COBROS: solo admins. Esto se aplica en el servidor, no solo en la
-- pantalla, así que un integrante del equipo sin ese rol no puede ver
-- ni cargar cobros ni aunque intente acceder directo a la base.
create policy "cobros_solo_admin" on cobros for all
  to authenticated using (es_admin()) with check (es_admin());

-- =====================================================================
-- CARGA DE PERSONAS DEL EQUIPO
-- =====================================================================
-- 1) En Supabase Dashboard → Authentication → Users → "Add user",
--    creá un usuario por cada persona con su email y una contraseña
--    provisoria. Copiá el UUID que se genera para cada uno.
-- 2) Reemplazá los UUID de ejemplo de abajo por los reales y ejecutá
--    este bloque para darles nombre y rol.
-- =====================================================================

-- insert into perfiles (id, nombre, usuario, rol) values
--   ('UUID-DE-SOL',      'Sol Martinez',       'sol',              'admin'),
--   ('UUID-DE-SANTIAGO', 'Santiago Remon',     'santiago',         'admin'),
--   ('UUID-DE-FRANCO-T', 'Franco Tosi',        'franco.tosi',      'staff'),
--   ('UUID-DE-FRANCO-G', 'Franco Gutierrez',   'franco.gutierrez', 'staff'),
--   ('UUID-DE-SEBASTIAN','Sebastian Caminio',  'sebastian',        'staff'),
--   ('UUID-DE-JEREMIAS', 'Jeremias Aime',      'jeremias',         'staff');
