-- Fase 4: seguimiento de acciones (cambios de estado con observaciones, evidencias y
-- reprogramación de fechas) y cierre de acciones ya reportadas en los informes.

-- Historial: tipo de entrada y fechas reprogramadas
alter table public.historial
  add column tipo text not null default 'estado'
    check (tipo in ('alta', 'importacion', 'estado', 'seguimiento', 'cierre')),
  add column fecha_inicio date,
  add column fecha_fin date;
comment on column public.historial.fecha_inicio is 'Nueva fecha de inicio fijada en este seguimiento (si cambió)';
comment on column public.historial.fecha_fin is 'Nueva fecha de fin fijada en este seguimiento (si cambió)';

update public.historial set tipo = 'importacion' where comentario = 'Importada desde Excel';
update public.historial set tipo = 'alta' where estado_anterior is null and tipo = 'estado';

-- El trigger de historial distingue altas e importaciones y se puede desactivar
-- dentro de una transacción (app.sin_historial) cuando la función registra su propia entrada.
create or replace function public.registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email      text;
  v_comentario text := nullif(current_setting('app.comentario_historial', true), '');
begin
  if coalesce(current_setting('app.sin_historial', true), '') = '1' then
    return new;
  end if;
  select email into v_email from public.perfiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.historial (accion_id, usuario, usuario_email, estado_nuevo, comentario, tipo)
    values (new.id, auth.uid(), v_email, new.estado, coalesce(v_comentario, 'Alta de la acción'),
            case when v_comentario = 'Importada desde Excel' then 'importacion' else 'alta' end);
  elsif new.estado is distinct from old.estado then
    insert into public.historial (accion_id, usuario, usuario_email, estado_anterior, estado_nuevo, comentario, evidencias, tipo)
    values (new.id, auth.uid(), v_email, old.estado, new.estado, v_comentario,
            nullif(current_setting('app.evidencias_historial', true), ''), 'estado');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- registrar_seguimiento: cambia (o mantiene) el estado, actualiza las observaciones
-- de la acción, reprograma fechas y deja constancia en el historial.
-- ---------------------------------------------------------------------
create function public.registrar_seguimiento(
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
  v_antes  public.acciones;
  v_despues public.acciones;
  v_obs    text := nullif(trim(coalesce(p_observaciones, '')), '');
  v_evid   text := nullif(trim(coalesce(p_evidencias, '')), '');
  v_email  text;
begin
  select * into v_antes from public.acciones where id = p_accion for update;
  if v_antes.id is null or not public.puede_gestionar(v_antes.titulacion) then
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
    fecha_inicio, fecha_fin)
  values (
    p_accion, auth.uid(), v_email, v_antes.estado, p_estado, v_obs, v_evid, 'seguimiento',
    case when v_despues.fecha_inicio is distinct from v_antes.fecha_inicio then v_despues.fecha_inicio end,
    case when v_despues.fecha_fin is distinct from v_antes.fecha_fin then v_despues.fecha_fin end);

  return v_despues;
end;
$$;

-- ---------------------------------------------------------------------
-- marcar_cerradas: marca (o desmarca) como cerradas acciones ya reportadas.
-- Solo se pueden cerrar acciones completadas o canceladas.
-- ---------------------------------------------------------------------
create function public.marcar_cerradas(p_acciones uuid[], p_cerrada boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a     public.acciones;
  v_n     integer := 0;
  v_email text;
begin
  select email into v_email from public.perfiles where id = auth.uid();
  for v_a in select * from public.acciones where id = any (p_acciones) order by codigo for update loop
    if not public.puede_gestionar(v_a.titulacion) then
      raise exception 'Sin permisos sobre la acción %', v_a.codigo using errcode = '42501';
    end if;
    if p_cerrada and v_a.estado not in ('completada', 'cancelada') then
      raise exception 'La acción % está % y no se puede cerrar', v_a.codigo, v_a.estado using errcode = '22023';
    end if;
    if v_a.cerrada is distinct from p_cerrada then
      update public.acciones set cerrada = p_cerrada where id = v_a.id;
      insert into public.historial (accion_id, usuario, usuario_email, estado_anterior, estado_nuevo, comentario, tipo)
      values (v_a.id, auth.uid(), v_email, v_a.estado, v_a.estado,
              case when p_cerrada then 'Marcada como cerrada (reportada en el informe de seguimiento)'
                   else 'Se quita la marca de cerrada' end,
              'cierre');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.registrar_seguimiento(uuid, public.estado_accion, text, text, date, date) from public, anon;
grant execute on function public.registrar_seguimiento(uuid, public.estado_accion, text, text, date, date) to authenticated;
revoke execute on function public.marcar_cerradas(uuid[], boolean) from public, anon;
grant execute on function public.marcar_cerradas(uuid[], boolean) to authenticated;
