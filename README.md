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
| 3 | Gestión de acciones (listado con filtros, alta con código automático, edición, borrado) y avisos de plazos en el inicio | ✅ |
| 4 | Seguimiento: ficha con historial, cambios de estado con observaciones/evidencias/fechas, informe CEN19 y cierre de acciones reportadas | ✅ |
| 5 | Vista pública por titulación/curso (`/plan/<código>/<año>`, castellano/valenciano) y exportación a Excel (formato común, reimportable) | ✅ |
| 5b | Catálogo de indicadores (79 con código, por procedimiento), varios indicadores por acción, página de consulta y mantenimiento | ✅ |
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
- `procedimientos` y `catalogo_indicadores`: indicadores con código del Sistema de Calidad
  (documento «Indicadores por procedimiento», V04 sep. 2026), agrupados por procedimiento.
  Cada acción guarda una lista de indicadores (`indicadores text[]`): códigos del catálogo,
  «Si / No» o textos sin código. En Excel van en una celda separados por comas.
- `responsables`: catálogo de roles responsables. Cada uno indica si sirve para los planes de
  titulación (`para_titulaciones`), para el plan del centro (`para_centro`) o para ambos.
- `plan_publico(titulacion, anyo)`: función pública que devuelve las **acciones de mejora**
  del curso indicado más las de cursos anteriores que sigan *pendientes* o *en proceso*.

## Puesta en marcha (producción)

### 1. Supabase

1. Crear un proyecto en <https://supabase.com/dashboard> en una región de la UE.
2. Configurar el despliegue automático (workflow `Desplegar Supabase`). En GitHub,
   *Settings → Secrets and variables → Actions*:
   - Variable `SUPABASE_PROJECT_ID`: referencia del proyecto (*Project Settings → General → Project ID*).
   - Secret `SUPABASE_ACCESS_TOKEN`: token personal creado en <https://supabase.com/dashboard/account/tokens>.
   - Secret `SUPABASE_DB_PASSWORD`: contraseña de la base de datos (se puede restablecer en
     *Database → Settings*).

   Después lanzar el workflow *Actions → Desplegar Supabase → Run workflow*. Aplica las
   migraciones pendientes y despliega la función `admin-usuarios`. A partir de ahí se ejecuta
   solo cada vez que cambia algo en `supabase/`.
3. Crear la cuenta de administración: en *Authentication → Users → Add user* (con
   «Auto Confirm User») y después, en *SQL Editor*:

   ```sql
   update public.perfiles set rol = 'admin', nombre = 'Nombre Apellidos' where email = 'calidad@ua.es';
   ```

4. En *Authentication → Sign In / Providers* desactivar **Allow new users to sign up**:
   las cuentas solo las crea el administrador desde la aplicación.
5. En *Authentication → URL Configuration* poner como *Site URL* la URL publicada
   (`https://<usuario>.github.io/pam-eps/`).

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

## Plan en Word para publicar

En cada plan, «Excel y publicación» → «Plan en Word para publicar» genera el documento con la
plantilla oficial de la UA (`public/plantillas/plan-mejora.docx`):

- Tabla 1: plan del curso (acciones de mejora del curso y de cursos anteriores aún pendientes o en
  proceso). «Plazo» = fecha de fin.
- Tabla 2: estado actual de las acciones del plan del curso anterior (las de ese curso y las de
  cursos previos que seguían abiertas al empezarlo, según el historial). «Evidencias» = observaciones.

La plantilla se prepara a partir del Word oficial con
`python3 scripts/preparar_plantilla_word.py <plantilla-oficial.docx> public/plantillas/plan-mejora.docx`
(marca los campos, quita las instrucciones y ajusta anchos y letra de las tablas). Si la UA publica una
versión nueva de la plantilla, basta con repetirlo.

## Mantenimiento del catálogo de indicadores

Desde la página «Indicadores» (administración):

- **Alta, edición y desactivación** de indicadores uno a uno. Los desactivados no se ofrecen al
  elegir, pero las acciones que ya los usan los conservan (se muestran «en desuso»).
- **Borrado** solo de indicadores que no usa ninguna acción (la base de datos lo impide si están en uso).
- **Cambiar código o fusionar**: actualiza todas las acciones que usan el código. Si el código nuevo
  ya existe, los dos indicadores se fusionan.
- **Nueva versión del documento de indicadores**: «Exportar catálogo» → editar el Excel →
  «Actualizar desde Excel». Vista previa de nuevos, modificados, filas con errores e indicadores
  que ya no están (opcionalmente se desactivan). Los procedimientos nuevos se crean con
  «PC09 · Nombre» en la columna de procedimiento.

## URL públicas

- Índice de planes: `https://<usuario>.github.io/pam-eps/plan`
- Plan de una titulación para un curso: `…/plan/D110/2026` (curso 2026-27). Sin año, el curso actual.

Muestran solo acciones marcadas como «acción de mejora»: las del curso indicado más las de
cursos anteriores que siguen pendientes o en proceso. No requieren iniciar sesión.

## Aplicación instalable (móvil y escritorio)

La web es una PWA: se puede instalar desde el navegador y se abre a pantalla completa con su
icono. Menú de usuario (o pantalla de acceso) → «Instalar la aplicación» muestra las
instrucciones para cada plataforma (en Android/Chrome, instalación directa).

- `src/sw.ts`: service worker (caché de la aplicación; nunca de los datos de Supabase).
- Al publicar una versión nueva aparece un aviso «Actualizar» (no recarga sola).
- Iconos en `public/` (`icono.svg` es el original; los PNG se generan a partir de él).

## Avisos de plazos (notificaciones)

Cada día (pg_cron, 06:00 UTC) se generan avisos para la coordinación de cada plan (y para la
administración, del plan del centro): **inicio** de una acción pendiente, **fin próximo** (30 días
antes por defecto) y **plazo vencido** (1 día después del fin sin completar). Cada aviso se envía
una sola vez por acción y fecha; los días se configuran en «Avisos» (administración).

- Envío: Edge Function `enviar-avisos` por **notificación push** (Web Push con claves VAPID que se
  generan solas la primera vez). Cada usuario la activa en «Mi cuenta → Notificaciones» para cada
  dispositivo (en iPhone, con la aplicación instalada e iOS 16.4+).
- La tarea programada se autentica con un secreto generado por la base de datos; la dirección del
  proyecto se guarda sola cuando entra un administrador en la aplicación.
- **Email** por SMTP con SSL (puerto 465; Supabase bloquea los puertos 25 y 587). Se configura con
  secretos de la Edge Function (Supabase → Edge Functions → Secrets): `SMTP_HOST` (p. ej.
  `smtp.gmail.com`), `SMTP_PORT` = `465`, `SMTP_USER`, `SMTP_PASS` (contraseña de aplicación) y
  `SMTP_FROM` (p. ej. `Planes de mejora EPS <cuenta@gmail.com>`). Sin ellos solo se envía push. Cada
  usuario puede desactivar los avisos por email y enviarse un email de prueba en «Mi cuenta».

## Idiomas

Interfaz preparada para castellano y valenciano (`src/i18n`). Los textos sin traducir y el
contenido de las acciones se muestran en castellano.
