-- Responsabilidades del plan del centro asignadas a cuentas de coordinación transversal.
-- Una cuenta puede tener varias responsabilidades; las que no tienen cuenta las gestiona la
-- administración. Las cuentas transversales ven las acciones del CEN de sus responsabilidades y
-- registran su seguimiento; la administración recibe un aviso de cada seguimiento y lo marca
-- como revisado.

-- ---------------------------------------------------------------------
-- Cuenta asignada a cada responsabilidad (solo tiene efecto en el plan del centro)
-- ---------------------------------------------------------------------
alter table public.responsables
  add column gestor uuid references public.perfiles (id) on delete set null;
comment on column public.responsables.gestor is
  'Cuenta de coordinación transversal que gestiona las acciones del plan del centro con este responsable (null = administración)';
create index responsables_gestor_idx on public.responsables (gestor);

create function public.es_transversal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'transversal' and activo);
$$;

-- ¿La cuenta actual gestiona, por su responsabilidad, una acción del plan del centro?
create function public.gestiona_responsabilidad(p_titulacion text, p_responsable text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_titulacion = 'CEN' and p_responsable is not null and exists (
    select 1
    from public.responsables r
    join public.perfiles p on p.id = r.gestor
    where r.nombre = p_responsable and r.para_centro
      and r.gestor = auth.uid() and p.rol = 'transversal' and p.activo
  );
$$;

create policy acciones_lectura_responsable on public.acciones for select to authenticated
  using (public.gestiona_responsabilidad(titulacion, responsable));
create policy historial_lectura_responsable on public.historial for select to authenticated
  using (exists (select 1 from public.acciones a
                 where a.id = accion_id and public.gestiona_responsabilidad(a.titulacion, a.responsable)));

-- ---------------------------------------------------------------------
-- Revisión de los seguimientos registrados por las cuentas transversales
-- ---------------------------------------------------------------------
alter table public.historial
  add column requiere_revision boolean not null default false,
  add column revisado          timestamptz,
  add column revisado_por      uuid references public.perfiles (id) on delete set null;
comment on column public.historial.requiere_revision is 'Seguimiento registrado por una cuenta transversal: la administración debe revisarlo';
create index historial_por_revisar_idx on public.historial (fecha) where requiere_revision and revisado is null;

create function public.marcar_revisados(p_ids bigint[], p_revisado boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede revisar seguimientos' using errcode = '42501';
  end if;
  update public.historial
     set revisado = case when p_revisado then now() end,
         revisado_por = case when p_revisado then auth.uid() end
   where id = any (p_ids) and requiere_revision;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.marcar_revisados(bigint[], boolean) from public, anon;
grant execute on function public.marcar_revisados(bigint[], boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Avisos de seguimiento (a la administración), uno por entrada del historial y destinatario
-- ---------------------------------------------------------------------
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check
  check (tipo in ('inicio', 'fin_proximo', 'vencida', 'seguimiento'));
alter table public.avisos add column historial_id bigint references public.historial (id) on delete cascade;
alter table public.avisos drop constraint avisos_accion_id_tipo_fecha_ref_perfil_id_key;
create unique index avisos_plazo_uniq on public.avisos (accion_id, tipo, fecha_ref, perfil_id) where historial_id is null;
create unique index avisos_seguimiento_uniq on public.avisos (historial_id, perfil_id) where historial_id is not null;

-- ---------------------------------------------------------------------
-- registrar_seguimiento: también lo pueden usar las cuentas transversales en sus acciones
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
  v_revisar boolean;
  v_hist    bigint;
begin
  select * into v_antes from public.acciones where id = p_accion for update;
  if v_antes.id is null then
    raise exception 'Acción no encontrada o sin permisos' using errcode = '42501';
  end if;
  v_revisar := not public.puede_gestionar(v_antes.titulacion);
  if v_revisar and not public.gestiona_responsabilidad(v_antes.titulacion, v_antes.responsable) then
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

  select email into v_email from public.perfiles where id = auth.uid();
  insert into public.historial (
    accion_id, usuario, usuario_email, estado_anterior, estado_nuevo, comentario, evidencias, tipo,
    fecha_inicio, fecha_fin, requiere_revision)
  values (
    p_accion, auth.uid(), v_email, v_antes.estado, p_estado, v_obs, v_evid, 'seguimiento',
    case when v_despues.fecha_inicio is distinct from v_antes.fecha_inicio then v_despues.fecha_inicio end,
    case when v_despues.fecha_fin is distinct from v_antes.fecha_fin then v_despues.fecha_fin end,
    v_revisar)
  returning id into v_hist;

  -- Seguimiento de una cuenta transversal: aviso inmediato a la administración
  if v_revisar then
    insert into public.avisos (accion_id, tipo, fecha_ref, perfil_id, historial_id)
    select p_accion, 'seguimiento', current_date, p.id, v_hist
    from public.perfiles p where p.rol = 'admin' and p.activo;
    begin
      perform public.lanzar_envio_avisos();
    exception when others then
      raise notice 'No se ha podido lanzar el envío de avisos: %', sqlerrm;
    end;
  end if;

  return v_despues;
end;
$$;

-- ---------------------------------------------------------------------
-- Recuperación de contraseña: como mucho un correo cada 10 minutos por dirección
-- ---------------------------------------------------------------------
create table privado.recuperaciones (
  email  text primary key,
  ultima timestamptz not null
);
create function public.permitir_recuperacion(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into privado.recuperaciones as r values (lower(trim(p_email)), now())
  on conflict (email) do update set ultima = now() where r.ultima < now() - interval '10 minutes';
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke execute on function public.permitir_recuperacion(text) from public, anon, authenticated;
grant execute on function public.permitir_recuperacion(text) to service_role;
