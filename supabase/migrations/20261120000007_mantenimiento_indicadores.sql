-- Mantenimiento del catálogo de indicadores a lo largo del tiempo:
-- uso por las acciones, borrado protegido, cambio de código / fusión y actualización masiva.

-- Orden de los procedimientos derivado del código (PE.. < PC.. < PA..), para que los
-- procedimientos nuevos queden en su sitio
create function public.orden_procedimiento(p_codigo text)
returns integer
language sql
immutable
as $$
  select case left(p_codigo, 2) when 'PE' then 0 when 'PC' then 100 else 200 end + right(p_codigo, 2)::integer;
$$;
update public.procedimientos set orden = public.orden_procedimiento(codigo);

-- Número de acciones (de cualquier plan) que usan cada indicador del catálogo
create function public.uso_indicadores()
returns table (codigo text, acciones bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.codigo, count(a.id)
  from public.catalogo_indicadores c
  left join public.acciones a on c.codigo = any (a.indicadores)
  group by c.codigo;
$$;
revoke execute on function public.uso_indicadores() from public, anon;
grant execute on function public.uso_indicadores() to authenticated;

-- No se puede borrar un indicador que usan acciones (se desactiva en su lugar)
create function public.catalogo_indicadores_antes_borrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.acciones where old.codigo = any (indicadores);
  if v_n > 0 then
    raise exception 'El indicador % lo usan % acciones: desactívalo en lugar de borrarlo', old.codigo, v_n
      using errcode = '23503';
  end if;
  return old;
end;
$$;
create trigger catalogo_indicadores_antes_borrar
  before delete on public.catalogo_indicadores
  for each row execute function public.catalogo_indicadores_antes_borrar();

-- Cambio de código de un indicador. Si el código nuevo ya existe, los dos se fusionan:
-- las acciones pasan a usar el nuevo y el antiguo se elimina del catálogo.
create function public.cambiar_codigo_indicador(p_antiguo text, p_nuevo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nuevo   text := upper(trim(p_nuevo));
  v_fusion  boolean;
  v_acciones integer;
begin
  if not public.es_admin() then
    raise exception 'Solo administración' using errcode = '42501';
  end if;
  if not exists (select 1 from public.catalogo_indicadores where codigo = p_antiguo) then
    raise exception 'No existe el indicador %', p_antiguo using errcode = '22023';
  end if;
  if v_nuevo !~ '^[A-Z0-9]+$' or v_nuevo = p_antiguo then
    raise exception 'Código nuevo no válido: %', p_nuevo using errcode = '22023';
  end if;
  v_fusion := exists (select 1 from public.catalogo_indicadores where codigo = v_nuevo);

  -- Acciones: sustituir el código conservando el orden y sin duplicarlo si ya tenían el nuevo
  update public.acciones a
     set indicadores = array(
           select x from (
             select x, min(n) as n from (
               select case when i = p_antiguo then v_nuevo else i end as x, n
               from unnest(a.indicadores) with ordinality as u(i, n)
             ) s group by x
           ) t order by n
         )
   where p_antiguo = any (a.indicadores);
  get diagnostics v_acciones = row_count;

  if v_fusion then
    delete from public.catalogo_indicadores where codigo = p_antiguo;
  else
    update public.catalogo_indicadores set codigo = v_nuevo where codigo = p_antiguo;
  end if;

  return jsonb_build_object('fusion', v_fusion, 'acciones', v_acciones);
end;
$$;
revoke execute on function public.cambiar_codigo_indicador(text, text) from public, anon;
grant execute on function public.cambiar_codigo_indicador(text, text) to authenticated;

-- Actualización masiva del catálogo (p. ej. nueva versión del documento de indicadores).
-- p_procedimientos: [{codigo, nombre}]   p_indicadores: [{codigo, nombre, definicion, procedimiento, procedimientos}]
-- Los indicadores incluidos se crean o actualizan (y se activan); los no incluidos se desactivan
-- si p_desactivar_ausentes. Todo en una transacción.
create function public.actualizar_catalogo_indicadores(
  p_procedimientos      jsonb,
  p_indicadores         jsonb,
  p_desactivar_ausentes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nuevos      integer;
  v_actualizados integer;
  v_desactivados integer := 0;
  v_max_orden   integer;
begin
  if not public.es_admin() then
    raise exception 'Solo administración' using errcode = '42501';
  end if;

  insert into public.procedimientos as p (codigo, nombre, orden)
  select x ->> 'codigo', x ->> 'nombre', public.orden_procedimiento(x ->> 'codigo')
  from jsonb_array_elements(coalesce(p_procedimientos, '[]')) as x
  on conflict (codigo) do update set nombre = coalesce(nullif(excluded.nombre, ''), p.nombre);

  select count(*) into v_nuevos from jsonb_array_elements(p_indicadores) as x
   where not exists (select 1 from public.catalogo_indicadores c where c.codigo = x ->> 'codigo');
  select coalesce(max(orden), 0) into v_max_orden from public.catalogo_indicadores;

  insert into public.catalogo_indicadores as c (codigo, nombre, definicion, procedimiento, procedimientos, activo, orden)
  select x ->> 'codigo', x ->> 'nombre', nullif(x ->> 'definicion', ''), x ->> 'procedimiento',
         coalesce(array(select jsonb_array_elements_text(x -> 'procedimientos')), array[x ->> 'procedimiento']),
         true, v_max_orden + n::integer
  from jsonb_array_elements(p_indicadores) with ordinality as e(x, n)
  on conflict (codigo) do update set
    nombre         = excluded.nombre,
    definicion     = excluded.definicion,
    procedimiento  = excluded.procedimiento,
    procedimientos = excluded.procedimientos,
    activo         = true,
    orden          = excluded.orden;
  v_actualizados := jsonb_array_length(p_indicadores) - v_nuevos;

  if p_desactivar_ausentes then
    update public.catalogo_indicadores
       set activo = false
     where activo
       and codigo not in (select x ->> 'codigo' from jsonb_array_elements(p_indicadores) as x);
    get diagnostics v_desactivados = row_count;
  end if;

  return jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_actualizados, 'desactivados', v_desactivados);
end;
$$;
revoke execute on function public.actualizar_catalogo_indicadores(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.actualizar_catalogo_indicadores(jsonb, jsonb, boolean) to authenticated;
