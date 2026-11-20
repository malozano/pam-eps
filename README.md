# Planes de acciones de mejora · EPS

Aplicación web para gestionar los planes de acciones de mejora de las titulaciones
de la Escuela Politécnica Superior (y el plan transversal del centro, código `CEN`).

- **Frontend:** React + TypeScript + Vite + Mantine. Se ejecuta íntegramente en el navegador
  y se publica como web estática (GitHub Pages).
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL + Auth + Edge Functions).
  La seguridad se aplica en la base de datos con *Row Level Security*.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Repositorio, proyecto Supabase, despliegue | ✅ (pendiente de conectar los servicios reales) |
| 1 | Esquema de BD, código automático, historial, RLS, acceso, gestión de usuarios | ✅ |
| 2 | Importación de Excel con vista previa (atómica, detecta errores y códigos antiguos) | ✅ |
| 3 | Gestión de acciones (listado, alta, edición, borrado) | ⏳ |
| 4 | Seguimiento (cambios de estado con observaciones/evidencias, cerrar acciones) | ⏳ |
| 5 | Vista pública por titulación/curso y exportación a Excel | ⏳ |
| 6 | Piloto | ⏳ |

## Modelo de datos

- `titulaciones`: código (`D110`, `C203`, `CEN`…), nombre, siglas, tipo.
- `perfiles` + `perfil_titulacion`: usuarios con rol `admin` (acceso a todo) o `coordinador`
  (solo las titulaciones asignadas).
- `acciones`: una fila por acción. `anyo` es el año de inicio del curso (2026 ⇒ 2026-27).
  El código `AM-<titulación>-<año>-<nn>` se genera automáticamente al dar de alta; los
  números de acciones borradas no se reutilizan. Las acciones importadas conservan su
  código original (p. ej. `AM-MUDSDM-2023-01`).
- `historial`: alta y cambios de estado, con observaciones, evidencias y usuario.
- `responsables`: catálogo de roles responsables. Cada uno indica si sirve para los planes de
  titulación (`para_titulaciones`), para el plan del centro (`para_centro`) o para ambos.
- `plan_publico(titulacion, anyo)`: función pública que devuelve las **acciones de mejora**
  del curso indicado más las de cursos anteriores que sigan *pendientes* o *en proceso*.

## Puesta en marcha (producción)

### 1. Supabase

1. Crear un proyecto en <https://supabase.com/dashboard> en la región **Central EU (Frankfurt)**.
2. Aplicar las migraciones desde este repositorio:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase db push
   ```

3. Desplegar la función de gestión de usuarios:

   ```bash
   npx supabase functions deploy admin-usuarios
   ```

4. Crear la cuenta de administración (la clave *secret/service_role* está en
   *Project Settings → API Keys*; no la subas nunca al repositorio):

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<clave-secreta> \
     node scripts/crear-admin.mjs calidad@ua.es '<contraseña-larga>' 'Nombre Apellidos'
   ```

5. En *Authentication → Sign In / Providers* desactivar **Allow new users to sign up**:
   las cuentas solo las crea el administrador desde la aplicación.
6. En *Authentication → URL Configuration* poner como *Site URL* la URL publicada
   (p. ej. `https://<usuario>.github.io/pam-eps/`).

> **Plan gratuito:** Supabase pausa los proyectos gratuitos tras 7 días sin actividad.
> Para producción conviene el plan Pro, o al menos reactivarlo desde el panel si se pausa.

### 2. GitHub Pages

1. *Settings → Pages → Source:* **GitHub Actions**.
2. *Settings → Secrets and variables → Actions → Variables*:
   - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = clave *publishable* (o *anon*). Es pública por diseño.
3. Cada `push` a `main` compila y publica la aplicación.

## Desarrollo local

Requisitos: Node 22, Docker (para Supabase local) y PostgreSQL 16 (para los tests de BD).

```bash
npm install
npm run db:start                # Supabase local; muestra URL y claves
cp .env.example .env.local      # rellenar con la URL y la clave publishable locales
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<secret local> \
  node scripts/crear-admin.mjs admin@example.com 'admin-local-1234' 'Admin local'
npm run dev
```

Pruebas:

```bash
npm test          # pruebas unitarias (Vitest)
npm run test:db   # migraciones + pruebas de código automático, historial y RLS
```

## Idiomas

Interfaz preparada para castellano y valenciano (`src/i18n`). Los textos sin traducir y el
contenido de las acciones se muestran en castellano.
