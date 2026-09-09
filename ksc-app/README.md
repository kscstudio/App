# KSC Studio — app de gestión

Esta es la versión independiente de la app, para alojar fuera de Claude con su propia
dirección web. Usa [Supabase](https://supabase.com) como base de datos y sistema de
usuarios real, y se aloja gratis en [Vercel](https://vercel.com).

Vas a necesitar unos 30-40 minutos la primera vez. Después de esto, actualizar la app
es mucho más simple.

---

## Paso 1 — Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta gratis.
2. Creá un **New Project**. Elegí un nombre (ej. "ksc-studio") y una contraseña para la
   base (guardala en un lugar seguro, no es la misma que la de las personas del equipo).
3. Esperá 1-2 minutos a que el proyecto termine de crearse.

## Paso 2 — Crear las tablas

1. En el menú izquierdo, andá a **SQL Editor** → **New query**.
2. Abrí el archivo `sql/schema.sql` de esta carpeta, copiá **todo** el contenido, y
   pegalo ahí.
3. Apretá **Run**. Deberías ver "Success. No rows returned".

## Paso 3 — Crear a las personas del equipo

1. Andá a **Authentication → Users → Add user → Create new user**.
2. Cargá un email para cada persona (puede ser el real, o uno inventado tipo
   `sol@kscstudio.app` si no quieren usar el personal — funciona igual) y una
   contraseña provisoria. **Importante:** si usás emails inventados, andá a
   **Authentication → Providers → Email** y desactivá "Confirm email", porque si no
   Supabase va a esperar una confirmación que nunca va a llegar.
3. Repetí para las 6 personas. Cada usuario creado te muestra su **UUID** (un código
   largo tipo `a1b2c3d4-...`) — copialo, lo necesitás en el próximo paso.

## Paso 4 — Asignar nombre y rol a cada persona

1. Volvé a **SQL Editor → New query**.
2. Escribí un INSERT como este por cada persona (reemplazando el UUID real que copiaste):

```sql
insert into perfiles (id, nombre, usuario, rol) values
  ('PEGAR-UUID-DE-SOL',      'Sol Martinez',      'sol',              'admin'),
  ('PEGAR-UUID-DE-SANTIAGO', 'Santiago Remon',    'santiago',         'admin'),
  ('PEGAR-UUID-DE-FRANCO-T', 'Franco Tosi',       'franco.tosi',      'staff'),
  ('PEGAR-UUID-DE-FRANCO-G', 'Franco Gutierrez',  'franco.gutierrez', 'staff'),
  ('PEGAR-UUID-DE-SEBASTIAN','Sebastian Caminio', 'sebastian',        'staff'),
  ('PEGAR-UUID-DE-JEREMIAS', 'Jeremias Aime',     'jeremias',         'staff');
```

3. Apretá **Run**.

## Paso 5 — Conseguir las claves del proyecto

1. Andá a **Project Settings → API**.
2. Copiá el **Project URL** y la clave **anon public**.

## Paso 6 — Configurar el proyecto localmente (opcional, para probar)

Si tenés Node.js instalado en tu compu:

```bash
npm install
cp .env.example .env
```

Editá `.env` y pegá el URL y la clave del paso anterior. Después:

```bash
npm run dev
```

Se abre en `http://localhost:5173`.

## Paso 7 — Subir a GitHub

1. Creá una cuenta en [github.com](https://github.com) si no tenés.
2. Creá un repositorio nuevo (puede ser privado) y subí esta carpeta completa
   (podés arrastrar los archivos desde la web de GitHub si no usás la terminal —
   opción "uploading an existing file").

## Paso 8 — Publicar en Vercel

1. Entrá a [vercel.com](https://vercel.com) y creá una cuenta con tu GitHub.
2. **Add New → Project**, elegí el repositorio que subiste.
3. En **Environment Variables**, agregá:
   - `VITE_SUPABASE_URL` = el Project URL del paso 5
   - `VITE_SUPABASE_ANON_KEY` = la clave anon del paso 5
4. Apretá **Deploy**. En 1-2 minutos te da una dirección tipo
   `https://ksc-studio.vercel.app` — esa es la app, ya online, con su propia URL.
5. Más adelante, si querés un dominio propio (ej. `kscstudio.com.ar`), se agrega desde
   **Project → Settings → Domains** en Vercel.

---

## Cómo agregar o dar de baja a alguien del equipo más adelante

- **Agregar:** Supabase → Authentication → Users → Add user. Después un INSERT en
  `perfiles` como en el Paso 4 (o pedime ayuda).
- **Restablecer una contraseña olvidada:** Supabase → Authentication → Users → tocá
  los tres puntos junto a la persona → "Send password recovery" (si usás emails
  reales) o "Reset password" para ponerle una nueva vos mismo.
- **Cambiar el rol de alguien** (de acceso de equipo a acceso total o viceversa): se
  hace directamente desde la app, en la sección "Usuarios" (solo lo ven los admins).

## Estructura del proyecto

```
src/
  App.jsx              → toda la aplicación (agenda, pacientes, cobros, etc.)
  supabaseClient.js     → conexión a Supabase
  lib/supabaseHooks.js  → capa que sincroniza los datos con la base en tiempo real
sql/schema.sql          → tablas y reglas de seguridad para pegar en Supabase
```

## Nota sobre seguridad

Los cobros y reportes están protegidos **en el servidor** (no solo en la pantalla):
un usuario con rol "staff" no puede ver esos datos aunque intente acceder directo a
la base de datos. Esto es una mejora real respecto de la versión que corría dentro de
Claude.
