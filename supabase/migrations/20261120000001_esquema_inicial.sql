-- =====================================================================
-- Planes de acciones de mejora - EPS
-- Esquema inicial: titulaciones, usuarios, acciones, historial y RLS
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.estado_accion as enum ('pendiente', 'en_proceso', 'completada', 'cancelada');
create type public.rol_usuario as enum ('admin', 'coordinador');
create type public.tipo_titulacion as enum ('centro', 'grado', 'master');

-- ---------------------------------------------------------------------
-- Titulaciones (el centro es una "titulación" más, con código CEN)
-- ---------------------------------------------------------------------
create table public.titulaciones (
  codigo  text primary key check (codigo ~ '^[A-Z0-9]{3,6}$'),
  nombre  text not null,
  siglas  text,
  tipo    public.tipo_titulacion not null,
  activa  boolean not null default true,
  orden   integer not null default 100
);
comment on column public.titulaciones.siglas is 'Siglas usadas en el nombre del fichero exportado (p.ej. MUDSDM)';

-- ---------------------------------------------------------------------
-- Perfiles de usuario (1:1 con auth.users) y asignación a titulaciones
-- ---------------------------------------------------------------------
create table public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nombre      text,
  rol         public.rol_usuario not null default 'coordinador',
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.perfil_titulacion (
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  titulacion  text not null references public.titulaciones (codigo) on update cascade,
  primary key (perfil_id, titulacion)
);

-- Al crear un usuario en Auth se crea automáticamente su perfil (coordinador)
create function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (new.id, new.email, new.raw_user_meta_data ->> 'nombre')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ---------------------------------------------------------------------
-- Catálogo de responsables (roles, no personas)
-- ---------------------------------------------------------------------
create table public.responsables (
  nombre  text primary key,
  orden   integer not null default 100,
  activo  boolean not null default true
);

-- ---------------------------------------------------------------------
-- Funciones auxiliares de permisos
-- ---------------------------------------------------------------------
create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and activo
  );
$$;

create function public.puede_gestionar(p_titulacion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin() or exists (
    select 1
    from public.perfil_titulacion pt
    join public.perfiles p on p.id = pt.perfil_id
    where pt.perfil_id = auth.uid()
      and pt.titulacion = p_titulacion
      and p.activo
  );
$$;

-- ---------------------------------------------------------------------
-- Acciones
-- ---------------------------------------------------------------------
create table public.acciones (
  id            uuid primary key default gen_random_uuid(),
  titulacion    text not null references public.titulaciones (codigo) on update cascade,
  anyo          integer not null check (anyo between 2000 and 2100),
  numero        integer not null check (numero > 0),
  codigo        text not null check (codigo ~ '^AM-[A-Z0-9]+-[0-9]{4}-[0-9]{2,}$'),
  nombre        text not null check (length(trim(nombre)) > 0),
  tareas        text,
  responsable   text,
  fecha_inicio  date,
  fecha_fin     date,
  indicador     text,
  origen        text,
  estado        public.estado_accion not null default 'pendiente',
  presupuesto   numeric(12, 2) check (presupuesto is null or presupuesto >= 0),
  es_mejora     boolean not null default true,
  observaciones text,
  cerrada       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.perfiles (id) on delete set null,
  updated_by    uuid references public.perfiles (id) on delete set null,
  unique (titulacion, anyo, numero),
  unique (codigo),
  check (fecha_inicio is null or fecha_fin is null or fecha_fin >= fecha_inicio)
);
comment on column public.acciones.anyo is 'Año de inicio del curso: 2026 => curso 2026-27';
comment on column public.acciones.codigo is 'AM-<titulación>-<año>-<nn>. Se genera al dar de alta; las acciones importadas conservan su código original (p.ej. AM-MUDSDM-2023-01)';
comment on column public.acciones.cerrada is 'Ya reportada como finalizada en los informes del SGC; pasa al histórico';

create index acciones_titulacion_anyo_idx on public.acciones (titulacion, anyo);
create index acciones_estado_idx on public.acciones (estado);
create index acciones_fechas_idx on public.acciones (fecha_inicio, fecha_fin);

-- Contador por titulación y año: los números de acciones borradas no se reutilizan
create table public.contadores (
  titulacion  text not null references public.titulaciones (codigo) on update cascade,
  anyo        integer not null,
  ultimo      integer not null,
  primary key (titulacion, anyo)
);

create function public.codigo_accion(p_titulacion text, p_anyo integer, p_numero integer)
returns text
language sql
immutable
as $$
  select 'AM-' || p_titulacion || '-' || p_anyo::text || '-' ||
         case when p_numero < 10 then '0' else '' end || p_numero::text;
$$;

-- Asignación automática del número + control de campos de auditoría
create function public.acciones_antes_insertar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.numero is null then
    insert into public.contadores as c (titulacion, anyo, ultimo)
    values (new.titulacion, new.anyo, 1)
    on conflict (titulacion, anyo) do update set ultimo = c.ultimo + 1
    returning ultimo into new.numero;
  else
    -- número explícito (importación): mantener el contador sincronizado
    insert into public.contadores as c (titulacion, anyo, ultimo)
    values (new.titulacion, new.anyo, new.numero)
    on conflict (titulacion, anyo) do update set ultimo = greatest(c.ultimo, excluded.ultimo);
  end if;
  if new.codigo is null then
    new.codigo := public.codigo_accion(new.titulacion, new.anyo, new.numero);
  end if;
  new.created_at := now();
  new.updated_at := now();
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger acciones_antes_insertar
  before insert on public.acciones
  for each row execute function public.acciones_antes_insertar();

create function public.acciones_antes_actualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- El código (titulación, año, número) solo lo puede cambiar el administrador
  if (new.titulacion, new.anyo, new.numero) is distinct from (old.titulacion, old.anyo, old.numero)
     and not public.es_admin()
     and auth.uid() is not null then
    raise exception 'Solo el administrador puede cambiar el código de una acción'
      using errcode = '42501';
  end if;
  if new.codigo is distinct from old.codigo and not public.es_admin() and auth.uid() is not null then
    raise exception 'Solo el administrador puede cambiar el código de una acción'
      using errcode = '42501';
  end if;
  if (new.titulacion, new.anyo, new.numero) is distinct from (old.titulacion, old.anyo, old.numero) then
    new.codigo := public.codigo_accion(new.titulacion, new.anyo, new.numero);
    insert into public.contadores as c (titulacion, anyo, ultimo)
    values (new.titulacion, new.anyo, new.numero)
    on conflict (titulacion, anyo) do update set ultimo = greatest(c.ultimo, excluded.ultimo);
  end if;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger acciones_antes_actualizar
  before update on public.acciones
  for each row execute function public.acciones_antes_actualizar();

-- ---------------------------------------------------------------------
-- Historial (creación y cambios de estado, con observaciones y evidencias)
-- ---------------------------------------------------------------------
create table public.historial (
  id               bigint generated always as identity primary key,
  accion_id        uuid not null references public.acciones (id) on delete cascade,
  fecha            timestamptz not null default now(),
  usuario          uuid references public.perfiles (id) on delete set null,
  usuario_email    text,
  estado_anterior  public.estado_accion,
  estado_nuevo     public.estado_accion,
  comentario       text,
  evidencias       text
);
create index historial_accion_idx on public.historial (accion_id, fecha desc);

create function public.registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select email into v_email from public.perfiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.historial (accion_id, usuario, usuario_email, estado_nuevo, comentario)
    values (new.id, auth.uid(), v_email, new.estado,
            coalesce(nullif(current_setting('app.comentario_historial', true), ''), 'Alta de la acción'));
  elsif new.estado is distinct from old.estado then
    insert into public.historial (accion_id, usuario, usuario_email, estado_anterior, estado_nuevo, comentario, evidencias)
    values (new.id, auth.uid(), v_email, old.estado, new.estado,
            nullif(current_setting('app.comentario_historial', true), ''),
            nullif(current_setting('app.evidencias_historial', true), ''));
  end if;
  return new;
end;
$$;

create trigger acciones_historial
  after insert or update of estado on public.acciones
  for each row execute function public.registrar_historial();

-- Cambio de estado desde el seguimiento (respeta RLS: security invoker)
create function public.cambiar_estado(
  p_accion        uuid,
  p_estado        public.estado_accion,
  p_observaciones text default null,
  p_evidencias    text default null
)
returns public.acciones
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_accion public.acciones;
begin
  perform set_config('app.comentario_historial', coalesce(p_observaciones, ''), true);
  perform set_config('app.evidencias_historial', coalesce(p_evidencias, ''), true);

  update public.acciones
     set estado = p_estado,
         observaciones = coalesce(nullif(trim(p_observaciones), ''), observaciones)
   where id = p_accion
  returning * into v_accion;

  if v_accion.id is null then
    raise exception 'Acción no encontrada o sin permisos' using errcode = '42501';
  end if;

  perform set_config('app.comentario_historial', '', true);
  perform set_config('app.evidencias_historial', '', true);
  return v_accion;
end;
$$;

-- ---------------------------------------------------------------------
-- Plan público: acciones de mejora del curso + anteriores no finalizadas
-- ---------------------------------------------------------------------
create function public.plan_publico(p_titulacion text, p_anyo integer)
returns table (
  codigo        text,
  anyo          integer,
  numero        integer,
  nombre        text,
  tareas        text,
  responsable   text,
  fecha_inicio  date,
  fecha_fin     date,
  indicador     text,
  origen        text,
  estado        public.estado_accion,
  presupuesto   numeric,
  observaciones text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.codigo, a.anyo, a.numero, a.nombre, a.tareas, a.responsable,
         a.fecha_inicio, a.fecha_fin, a.indicador, a.origen, a.estado,
         a.presupuesto, a.observaciones
  from public.acciones a
  join public.titulaciones t on t.codigo = a.titulacion and t.activa
  where a.titulacion = p_titulacion
    and a.es_mejora
    and (a.anyo = p_anyo
         or (a.anyo < p_anyo and a.estado in ('pendiente', 'en_proceso')))
  order by a.anyo desc, a.numero;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.titulaciones      enable row level security;
alter table public.perfiles          enable row level security;
alter table public.perfil_titulacion enable row level security;
alter table public.responsables      enable row level security;
alter table public.acciones          enable row level security;
alter table public.contadores        enable row level security;
alter table public.historial         enable row level security;

-- Titulaciones y responsables: lectura pública, escritura admin
create policy titulaciones_lectura on public.titulaciones for select using (true);
create policy titulaciones_admin on public.titulaciones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy responsables_lectura on public.responsables for select using (true);
create policy responsables_admin on public.responsables for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Perfiles: cada uno ve el suyo; el admin ve y gestiona todos
create policy perfiles_lectura on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());
create policy perfiles_admin on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy perfiles_admin_borrar on public.perfiles for delete to authenticated
  using (public.es_admin());

create policy perfil_titulacion_lectura on public.perfil_titulacion for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
create policy perfil_titulacion_admin on public.perfil_titulacion for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Acciones: solo quien gestiona la titulación (o el admin)
create policy acciones_lectura on public.acciones for select to authenticated
  using (public.puede_gestionar(titulacion));
create policy acciones_alta on public.acciones for insert to authenticated
  with check (public.puede_gestionar(titulacion));
create policy acciones_edicion on public.acciones for update to authenticated
  using (public.puede_gestionar(titulacion)) with check (public.puede_gestionar(titulacion));
create policy acciones_borrado on public.acciones for delete to authenticated
  using (public.puede_gestionar(titulacion));

-- Historial: lectura de lo que se gestiona; solo se escribe mediante triggers
create policy historial_lectura on public.historial for select to authenticated
  using (exists (select 1 from public.acciones a
                 where a.id = accion_id and public.puede_gestionar(a.titulacion)));

-- Contadores: sin acceso directo (solo vía trigger security definer)

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke all on public.contadores from anon, authenticated;
revoke all on public.historial from anon, authenticated;
grant select on public.historial to authenticated;
revoke all on public.acciones from anon;
revoke all on public.perfiles, public.perfil_titulacion from anon;
revoke insert on public.perfiles from authenticated;
-- (el código y los campos de auditoría los controlan los triggers)

revoke execute on function public.plan_publico(text, integer) from public;
grant execute on function public.plan_publico(text, integer) to anon, authenticated;
revoke execute on function public.cambiar_estado(uuid, public.estado_accion, text, text) from public, anon;
grant execute on function public.cambiar_estado(uuid, public.estado_accion, text, text) to authenticated;
