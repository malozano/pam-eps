-- Importación de acciones desde Excel en una única transacción (todo o nada).
-- Se ejecuta con los permisos de quien llama (RLS incluida).
create function public.importar_acciones(
  p_titulacion text,
  p_acciones   jsonb,
  p_actualizar boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r          jsonb;
  v_id       uuid;
  v_insert   integer := 0;
  v_update   integer := 0;
  v_omitidas integer := 0;
begin
  if not public.puede_gestionar(p_titulacion) then
    raise exception 'Sin permisos sobre la titulación %', p_titulacion using errcode = '42501';
  end if;
  if jsonb_typeof(p_acciones) is distinct from 'array' then
    raise exception 'p_acciones debe ser un array JSON';
  end if;

  perform set_config('app.comentario_historial', 'Importada desde Excel', true);

  for r in select value from jsonb_array_elements(p_acciones) loop
    select id into v_id from public.acciones
     where codigo = r ->> 'codigo' and titulacion = p_titulacion;

    if v_id is null then
      insert into public.acciones (
        titulacion, anyo, numero, codigo, nombre, tareas, responsable, fecha_inicio, fecha_fin,
        indicador, origen, estado, presupuesto, es_mejora, observaciones, cerrada)
      values (
        p_titulacion, (r ->> 'anyo')::integer, (r ->> 'numero')::integer, r ->> 'codigo', r ->> 'nombre',
        r ->> 'tareas', r ->> 'responsable', (r ->> 'fecha_inicio')::date, (r ->> 'fecha_fin')::date,
        r ->> 'indicador', r ->> 'origen', coalesce((r ->> 'estado')::public.estado_accion, 'pendiente'),
        (r ->> 'presupuesto')::numeric, coalesce((r ->> 'es_mejora')::boolean, true), r ->> 'observaciones',
        coalesce((r ->> 'cerrada')::boolean, false));
      v_insert := v_insert + 1;
    elsif p_actualizar then
      update public.acciones set
        nombre        = r ->> 'nombre',
        tareas        = r ->> 'tareas',
        responsable   = r ->> 'responsable',
        fecha_inicio  = (r ->> 'fecha_inicio')::date,
        fecha_fin     = (r ->> 'fecha_fin')::date,
        indicador     = r ->> 'indicador',
        origen        = r ->> 'origen',
        estado        = coalesce((r ->> 'estado')::public.estado_accion, estado),
        presupuesto   = (r ->> 'presupuesto')::numeric,
        es_mejora     = coalesce((r ->> 'es_mejora')::boolean, es_mejora),
        observaciones = r ->> 'observaciones',
        cerrada       = coalesce((r ->> 'cerrada')::boolean, cerrada)
      where id = v_id;
      v_update := v_update + 1;
    else
      v_omitidas := v_omitidas + 1;
    end if;
  end loop;

  perform set_config('app.comentario_historial', '', true);
  return jsonb_build_object('insertadas', v_insert, 'actualizadas', v_update, 'omitidas', v_omitidas);
end;
$$;

revoke execute on function public.importar_acciones(text, jsonb, boolean) from public, anon;
grant execute on function public.importar_acciones(text, jsonb, boolean) to authenticated;
