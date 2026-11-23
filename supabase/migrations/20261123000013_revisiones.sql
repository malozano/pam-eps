-- Revisión del estado de las acciones (antes de los informes): la administración abre una
-- revisión del plan del centro o de todos los planes de titulación. Una acción está revisada si
-- se ha registrado su seguimiento (o cambiado su estado) desde el inicio de la revisión; entran
-- las acciones abiertas creadas antes del inicio. No se añade nada a las acciones: se deduce
-- del historial.

create table public.revisiones (
  id          bigint generated always as identity primary key,
  ambito      text not null check (ambito in ('centro', 'titulaciones')),
  titulo      text not null check (length(trim(titulo)) > 0),
  inicio      timestamptz not null default now(),
  fin         timestamptz,
  completada  timestamptz,  -- cuando se revisó la última acción (se avisa una sola vez)
  total       integer,      -- al finalizar: acciones de la revisión
  revisadas   integer,      -- al finalizar: revisadas
  creada_por  uuid references public.perfiles (id) on delete set null
);
comment on table public.revisiones is 'Revisiones del estado de las acciones (plan del centro o planes de titulación)';
create unique index revisiones_activa_uniq on public.revisiones (ambito) where fin is null;

alter table public.revisiones enable row level security;
create policy revisiones_lectura on public.revisiones for select to authenticated using (true);
create policy revisiones_admin on public.revisiones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
revoke all on public.revisiones from anon;

-- ¿Se ha registrado el seguimiento (o cambiado el estado) de una acción desde una fecha?
create function public.revisada_desde(p_accion uuid, p_desde timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.historial h
                 where h.accion_id = p_accion and h.tipo in ('seguimiento', 'estado') and h.fecha >= p_desde);
$$;
revoke execute on function public.revisada_desde(uuid, timestamptz) from public, anon;
grant execute on function public.revisada_desde(uuid, timestamptz) to authenticated;

-- Acciones de una revisión que puede ver quien llama (RLS) y si están revisadas
create function public.estado_revision(p_revision bigint)
returns table (accion_id uuid, titulacion text, responsable text, revisada boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.titulacion, a.responsable, public.revisada_desde(a.id, r.inicio)
  from public.revisiones r
  join public.acciones a on (a.titulacion = 'CEN') = (r.ambito = 'centro')
  join public.titulaciones t on t.codigo = a.titulacion and t.activa
  where r.id = p_revision and a.created_at < r.inicio
    and (a.estado in ('pendiente', 'en_proceso') or public.revisada_desde(a.id, r.inicio));
$$;
revoke execute on function public.estado_revision(bigint) from public, anon;
grant execute on function public.estado_revision(bigint) to authenticated;

-- Recuento completo (sin RLS), para el aviso de revisión completada y el cierre
create function public.recuento_revision(p_revision bigint, out total integer, out revisadas integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, (count(*) filter (where x.rev))::integer
  from (
    select public.revisada_desde(a.id, r.inicio) as rev, a.estado
    from public.revisiones r
    join public.acciones a on (a.titulacion = 'CEN') = (r.ambito = 'centro')
    join public.titulaciones t on t.codigo = a.titulacion and t.activa
    where r.id = p_revision and a.created_at < r.inicio
  ) x
  where x.estado in ('pendiente', 'en_proceso') or x.rev;
$$;
revoke execute on function public.recuento_revision(bigint) from public, anon;
grant execute on function public.recuento_revision(bigint) to authenticated;

-- Finalizar una revisión: guarda el resultado
create function public.finalizar_revision(p_revision bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede finalizar una revisión' using errcode = '42501';
  end if;
  select * into c from public.recuento_revision(p_revision);
  update public.revisiones set fin = now(), total = c.total, revisadas = c.revisadas
   where id = p_revision and fin is null;
end;
$$;
revoke execute on function public.finalizar_revision(bigint) from public, anon;
grant execute on function public.finalizar_revision(bigint) to authenticated;

-- Aviso de revisión completada (a la administración)
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check
  check (tipo in ('inicio', 'fin_proximo', 'vencida', 'seguimiento', 'revision'));

-- ---------------------------------------------------------------------
-- registrar_seguimiento: una confirmación sin cambios (mismo estado, sin observaciones, evidencias
-- ni fechas nuevas) no requiere revisión ni avisa; al revisarse la última acción de una revisión
-- en curso se avisa a la administración.
-- ---------------------------------------------------------------------
create or replace function public.registrar_seguimiento(
  p_accion        uuid,
  p_estado        public.estado_accion,
  p_observaciones text default null,
  p_evidencias    text default null,
  p_fecha_inicio  date default null,
  p_fecha_fin     date default null
)
returns public.acciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   public.acciones;
  v_despues public.acciones;
  v_obs     text := nullif(trim(coalesce(p_observaciones, '')), '');
  v_evid    text := nullif(trim(coalesce(p_evidencias, '')), '');
  v_email   text;
  v_ajena   boolean;
  v_cambio  boolean;
  v_hist    bigint;
  v_avisar  boolean := false;
  r         record;
begin
  select * into v_antes from public.acciones where id = p_accion for update;
  if v_antes.id is null then
    raise exception 'Acción no encontrada o sin permisos' using errcode = '42501';
  end if;
  v_ajena := not public.puede_gestionar(v_antes.titulacion);
  if v_ajena and not public.gestiona_responsabilidad(v_antes.titulacion, v_antes.responsable) then
    raise exception 'Acción no encontrada o sin permisos' using errcode = '42501';
  end if;
  if p_estado in ('completada', 'cancelada') and v_obs is null then
    raise exception 'Para marcar la acción como % hay que indicar observaciones (lo realizado o el motivo)', p_estado
      using errcode = '22023';
  end if;
  if coalesce(p_fecha_fin, v_antes.fecha_fin) < coalesce(p_fecha_inicio, v_antes.fecha_inicio) then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio' using errcode = '22023';
  end if;

  perform set_config('app.sin_historial', '1', true);
  update public.acciones set
    estado        = p_estado,
    observaciones = coalesce(v_obs, observaciones),
    fecha_inicio  = coalesce(p_fecha_inicio, fecha_inicio),
    fecha_fin     = coalesce(p_fecha_fin, fecha_fin),
    -- una acción que se reabre deja de estar cerrada
    cerrada       = case when p_estado in ('pendiente', 'en_proceso') then false else cerrada end
  where id = p_accion
  returning * into v_despues;
  perform set_config('app.sin_historial', '', true);

  v_cambio := p_estado is distinct from v_antes.estado or v_obs is not null or v_evid is not null
              or v_despues.fecha_inicio is distinct from v_antes.fecha_inicio
              or v_despues.fecha_fin is distinct from v_antes.fecha_fin;

  select email into v_email from public.perfiles where id = auth.uid();
  insert into public.historial (
    accion_id, usuario, usuario_email, estado_anterior, estado_nuevo, comentario, evidencias, tipo,
    fecha_inicio, fecha_fin, requiere_revision)
  values (
    p_accion, auth.uid(), v_email, v_antes.estado, p_estado, v_obs, v_evid, 'seguimiento',
    case when v_despues.fecha_inicio is distinct from v_antes.fecha_inicio then v_despues.fecha_inicio end,
    case when v_despues.fecha_fin is distinct from v_antes.fecha_fin then v_despues.fecha_fin end,
    v_ajena and v_cambio)
  returning id into v_hist;

  -- Seguimiento con cambios de una cuenta transversal: aviso inmediato a la administración
  if v_ajena and v_cambio then
    insert into public.avisos (accion_id, tipo, fecha_ref, perfil_id, historial_id)
    select p_accion, 'seguimiento', current_date, p.id, v_hist
    from public.perfiles p where p.rol = 'admin' and p.activo;
    v_avisar := true;
  end if;

  -- ¿Era la última acción por revisar de una revisión en curso?
  for r in select * from public.revisiones
           where fin is null and completada is null
             and (ambito = 'centro') = (v_antes.titulacion = 'CEN') loop
    if (select total = revisadas from public.recuento_revision(r.id)) then
      update public.revisiones set completada = now() where id = r.id;
      insert into public.avisos (accion_id, tipo, fecha_ref, perfil_id, historial_id)
      select p_accion, 'revision', current_date, p.id, v_hist
      from public.perfiles p where p.rol = 'admin' and p.activo;
      v_avisar := true;
    end if;
  end loop;

  if v_avisar then
    begin
      perform public.lanzar_envio_avisos();
    exception when others then
      raise notice 'No se ha podido lanzar el envío de avisos: %', sqlerrm;
    end;
  end if;

  return v_despues;
end;
$$;
