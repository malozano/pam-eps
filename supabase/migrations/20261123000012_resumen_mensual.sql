-- Fase B: resumen mensual por correo y avisos de plazo a las cuentas de coordinación transversal.

-- ---------------------------------------------------------------------
-- Ajustes
-- ---------------------------------------------------------------------
alter table public.ajustes_avisos
  add column resumen_activo            boolean not null default true,
  add column resumen_dia               integer not null default 15 check (resumen_dia between 1 and 28),
  add column avisos_plazo_transversal  boolean not null default true;
comment on column public.ajustes_avisos.resumen_dia is
  'Día del mes en que se envía el resumen mensual (si ese día falla, se reintenta los dos días siguientes)';
comment on column public.ajustes_avisos.avisos_plazo_transversal is
  'Las cuentas transversales reciben también los avisos de plazo de sus acciones del plan del centro';

-- Preferencia de cada usuario
alter table public.perfiles add column resumen_mensual boolean not null default true;

create function public.mi_resumen_mensual(p_activo boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.perfiles set resumen_mensual = p_activo where id = auth.uid();
$$;
revoke execute on function public.mi_resumen_mensual(boolean) from public, anon;
grant execute on function public.mi_resumen_mensual(boolean) to authenticated;

-- Resúmenes ya enviados (uno por persona y mes)
create table public.resumenes (
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  mes        date not null check (extract(day from mes) = 1),
  enviado    timestamptz not null default now(),
  acciones   integer not null default 0,
  primary key (perfil_id, mes)
);
alter table public.resumenes enable row level security;
create policy resumenes_lectura on public.resumenes for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
revoke all on public.resumenes from anon;
revoke insert, update, delete on public.resumenes from authenticated;

-- ---------------------------------------------------------------------
-- Destinatarios de los avisos de una acción: los del plan y, en el plan del centro, la cuenta
-- transversal que gestiona su responsabilidad (si está activado)
-- ---------------------------------------------------------------------
create function public.destinatarios_accion(p_titulacion text, p_responsable text, p_transversal boolean)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.destinatarios_plan(p_titulacion)
  union
  select r.gestor
  from public.responsables r
  join public.perfiles p on p.id = r.gestor
  where p_transversal and p_titulacion = 'CEN' and r.nombre = p_responsable and r.para_centro
    and p.rol = 'transversal' and p.activo;
$$;
revoke execute on function public.destinatarios_accion(text, text, boolean) from public, anon, authenticated;

create or replace function public.generar_avisos(p_hoy date default current_date, p_ventana integer default 7)
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
    select ac.id, ac.titulacion, ac.responsable, 'inicio'::text as tipo, ac.fecha_inicio as fecha_ref,
           ac.fecha_inicio - a.dias_antes_inicio as dispara
    from public.acciones ac
    where ac.estado = 'pendiente' and not ac.cerrada and ac.fecha_inicio is not null
    union all
    -- queda poco para la fecha de fin
    select ac.id, ac.titulacion, ac.responsable, 'fin_proximo', ac.fecha_fin, ac.fecha_fin - a.dias_antes_fin
    from public.acciones ac
    where ac.estado in ('pendiente', 'en_proceso') and not ac.cerrada and ac.fecha_fin is not null
      and ac.fecha_fin >= p_hoy
    union all
    -- ha pasado la fecha de fin sin completarse
    select ac.id, ac.titulacion, ac.responsable, 'vencida', ac.fecha_fin, ac.fecha_fin + a.dias_despues_fin
    from public.acciones ac
    where ac.estado in ('pendiente', 'en_proceso') and not ac.cerrada and ac.fecha_fin is not null
  )
  insert into public.avisos (accion_id, tipo, fecha_ref, perfil_id)
  select e.id, e.tipo, e.fecha_ref, d
  from eventos e
  cross join lateral public.destinatarios_accion(e.titulacion, e.responsable, a.avisos_plazo_transversal) as d
  where e.dispara <= p_hoy and e.dispara > p_hoy - p_ventana
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.generar_avisos(date, integer) from public, anon, authenticated;
grant execute on function public.generar_avisos(date, integer) to service_role;
