-- Publicación de los planes: la administración decide si son públicos el plan del centro y los
-- planes de titulación. Por defecto, los dos (como hasta ahora). Se aplica en plan_publico, así
-- que un plan no publicado no se puede consultar ni con el enlace directo.
create table public.ajustes_publicacion (
  id            boolean primary key default true check (id),
  centro        boolean not null default true,
  titulaciones  boolean not null default true
);
insert into public.ajustes_publicacion default values;
comment on table public.ajustes_publicacion is 'Qué planes se muestran en la web pública (una fila)';

alter table public.ajustes_publicacion enable row level security;
create policy ajustes_publicacion_lectura on public.ajustes_publicacion for select to anon, authenticated using (true);
create policy ajustes_publicacion_admin on public.ajustes_publicacion for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
revoke insert, delete on public.ajustes_publicacion from anon, authenticated;
revoke update on public.ajustes_publicacion from anon;

-- ¿Está publicado el plan de esta titulación?
create function public.plan_publicado(p_titulacion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when t.tipo = 'centro' then p.centro else p.titulaciones end
  from public.titulaciones t, public.ajustes_publicacion p
  where t.codigo = p_titulacion;
$$;
grant execute on function public.plan_publicado(text) to anon, authenticated;

create or replace function public.plan_publico(p_titulacion text, p_anyo integer)
returns table (
  codigo        text,
  anyo          integer,
  numero        integer,
  nombre        text,
  tareas        text,
  responsable   text,
  fecha_inicio  date,
  fecha_fin     date,
  indicadores   text[],
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
         a.fecha_inicio, a.fecha_fin, a.indicadores, a.origen, a.estado,
         a.presupuesto, a.observaciones
  from public.acciones a
  join public.titulaciones t on t.codigo = a.titulacion and t.activa
  where a.titulacion = p_titulacion
    and public.plan_publicado(p_titulacion)
    and a.es_mejora
    and (a.anyo = p_anyo
         or (a.anyo < p_anyo and a.estado in ('pendiente', 'en_proceso')))
  order by a.anyo desc, a.numero;
$$;
