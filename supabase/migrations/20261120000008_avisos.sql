-- Avisos (notificaciones) de plazos de las acciones: inicio, fin próximo y plazo vencido.
-- Se generan cada mañana (pg_cron) y los envía la Edge Function «enviar-avisos» (push; email más adelante).

-- ---------------------------------------------------------------------
-- Ajustes (una sola fila, editable por administración)
-- ---------------------------------------------------------------------
create table public.ajustes_avisos (
  id                 boolean primary key default true check (id),
  activo             boolean not null default true,
  dias_antes_inicio  integer not null default 0  check (dias_antes_inicio between 0 and 60),
  dias_antes_fin     integer not null default 30 check (dias_antes_fin between 1 and 120),
  dias_despues_fin   integer not null default 1  check (dias_despues_fin between 0 and 60),
  url_app            text,   -- dirección de la aplicación (para los enlaces de los avisos)
  url_funciones      text,   -- dirección del proyecto Supabase (para la tarea programada)
  ultima_ejecucion   timestamptz,
  ultimo_resultado   jsonb
);
insert into public.ajustes_avisos default values;
comment on table public.ajustes_avisos is 'Configuración de los avisos de plazos (una fila)';
comment on column public.ajustes_avisos.dias_antes_inicio is 'Días antes de la fecha de inicio (0 = el mismo día)';
comment on column public.ajustes_avisos.dias_antes_fin is 'Días antes de la fecha de fin para el aviso de fin próximo';
comment on column public.ajustes_avisos.dias_despues_fin is 'Días después de la fecha de fin para el aviso de plazo vencido';

alter table public.ajustes_avisos enable row level security;
create policy ajustes_avisos_lectura on public.ajustes_avisos for select to authenticated using (true);
create policy ajustes_avisos_admin on public.ajustes_avisos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
revoke all on public.ajustes_avisos from anon;

-- Preferencias de cada usuario por canal
alter table public.perfiles
  add column avisos_push  boolean not null default true,
  add column avisos_email boolean not null default true;

-- Cada usuario puede cambiar sus propias preferencias (y solo esas columnas)
create function public.mis_preferencias_avisos(p_push boolean, p_email boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.perfiles set avisos_push = p_push, avisos_email = p_email where id = auth.uid();
$$;
revoke execute on function public.mis_preferencias_avisos(boolean, boolean) from public, anon;
grant execute on function public.mis_preferencias_avisos(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Suscripciones push (una por dispositivo / navegador)
-- ---------------------------------------------------------------------
create table public.suscripciones_push (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  dispositivo text,
  creada     timestamptz not null default now()
);
alter table public.suscripciones_push enable row level security;
create policy suscripciones_propias on public.suscripciones_push for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
revoke all on public.suscripciones_push from anon;

-- ---------------------------------------------------------------------
-- Avisos generados (uno por acción, tipo, fecha de referencia y destinatario)
-- ---------------------------------------------------------------------
create table public.avisos (
  id          bigint generated always as identity primary key,
  accion_id   uuid not null references public.acciones (id) on delete cascade,
  tipo        text not null check (tipo in ('inicio', 'fin_proximo', 'vencida')),
  fecha_ref   date not null,  -- fecha de la acción a la que se refiere (si se reprograma, hay aviso nuevo)
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  creado      timestamptz not null default now(),
  enviado_push  timestamptz,
  enviado_email timestamptz,
  unique (accion_id, tipo, fecha_ref, perfil_id)
);
create index avisos_pendientes_idx on public.avisos (creado) where enviado_push is null;
alter table public.avisos enable row level security;
create policy avisos_propios on public.avisos for select to authenticated using (perfil_id = auth.uid());
revoke all on public.avisos from anon;
revoke insert, update, delete on public.avisos from authenticated;

-- ---------------------------------------------------------------------
-- Destinatarios de los avisos de un plan: su coordinación y, en el plan del centro,
-- también la administración
-- ---------------------------------------------------------------------
create function public.destinatarios_plan(p_titulacion text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.perfiles p
  where p.activo
    and (exists (select 1 from public.perfil_titulacion pt where pt.perfil_id = p.id and pt.titulacion = p_titulacion)
         or (p_titulacion = 'CEN' and p.rol = 'admin'));
$$;
revoke execute on function public.destinatarios_plan(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- generar_avisos: calcula los avisos del día. Solo considera eventos de los últimos
-- p_ventana días (para no avisar de golpe de todo lo antiguo al ponerlo en marcha).
-- ---------------------------------------------------------------------
create function public.generar_avisos(p_hoy date default current_date, p_ventana integer default 7)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.ajustes_avisos;
  v_n integer;
begin
  select * into a from public.ajustes_avisos;
  if not a.activo then
    return 0;
  end if;

  with eventos as (
    -- llega la fecha de inicio (solo acciones aún pendientes)
    select ac.id, ac.titulacion, 'inicio'::text as tipo, ac.fecha_inicio as fecha_ref,
           ac.fecha_inicio - a.dias_antes_inicio as dispara
    from public.acciones ac
    where ac.estado = 'pendiente' and not ac.cerrada and ac.fecha_inicio is not null
    union all
    -- queda poco para la fecha de fin
    select ac.id, ac.titulacion, 'fin_proximo', ac.fecha_fin, ac.fecha_fin - a.dias_antes_fin
    from public.acciones ac
    where ac.estado in ('pendiente', 'en_proceso') and not ac.cerrada and ac.fecha_fin is not null
      and ac.fecha_fin >= p_hoy
    union all
    -- ha pasado la fecha de fin sin completarse
    select ac.id, ac.titulacion, 'vencida', ac.fecha_fin, ac.fecha_fin + a.dias_despues_fin
    from public.acciones ac
    where ac.estado in ('pendiente', 'en_proceso') and not ac.cerrada and ac.fecha_fin is not null
  )
  insert into public.avisos (accion_id, tipo, fecha_ref, perfil_id)
  select e.id, e.tipo, e.fecha_ref, d
  from eventos e
  cross join lateral public.destinatarios_plan(e.titulacion) as d
  where e.dispara <= p_hoy and e.dispara > p_hoy - p_ventana
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.generar_avisos(date, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Datos privados (no accesibles desde la API): secreto de la tarea programada y claves VAPID
-- ---------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table privado.config (
  clave text primary key,
  valor text not null
);
insert into privado.config values
  ('secreto_tarea', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- Solo la Edge Function (service_role) accede a estas funciones
create function public.config_privada(p_clave text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select valor from privado.config where clave = p_clave;
$$;
create function public.guardar_config_privada(p_clave text, p_valor text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into privado.config values (p_clave, p_valor) on conflict (clave) do update set valor = excluded.valor;
$$;
revoke execute on function public.config_privada(text) from public, anon, authenticated;
revoke execute on function public.guardar_config_privada(text, text) from public, anon, authenticated;
grant execute on function public.config_privada(text) to service_role;
grant execute on function public.guardar_config_privada(text, text) to service_role;
grant execute on function public.generar_avisos(date, integer) to service_role;

-- Clave pública VAPID (la necesita el navegador para suscribirse)
create function public.clave_publica_push()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select valor from privado.config where clave = 'vapid_publica';
$$;
revoke execute on function public.clave_publica_push() from public, anon;
grant execute on function public.clave_publica_push() to authenticated;

-- ---------------------------------------------------------------------
-- Tarea programada: cada día a las 06:00 UTC (7:00 u 8:00 en España) llama a la función
-- de envío. Solo si pg_cron y pg_net están disponibles (en Supabase lo están).
-- ---------------------------------------------------------------------
create function public.lanzar_envio_avisos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  select url_funciones into v_url from public.ajustes_avisos;
  if v_url is null then
    raise notice 'Avisos: falta url_funciones (se guarda al abrir los ajustes de avisos)';
    return;
  end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/enviar-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('modo', 'tarea', 'secreto', (select valor from privado.config where clave = 'secreto_tarea'))
  );
end;
$$;
revoke execute on function public.lanzar_envio_avisos() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('enviar-avisos', '0 6 * * *', 'select public.lanzar_envio_avisos()');
  else
    raise notice 'pg_cron/pg_net no disponibles: no se programa el envío de avisos';
  end if;
end;
$$;
