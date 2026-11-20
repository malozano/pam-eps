-- Pruebas de importar_acciones
create schema tst;
grant usage on schema tst to anon, authenticated;
create function tst.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function tst.falla(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'ok - % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLO: se esperaba error: %', msg;
end $$;
grant execute on all functions in schema tst to anon, authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'imp.d115@ua.es');
insert into public.perfil_titulacion values ('00000000-0000-0000-0000-0000000000e1', 'D115');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;

select tst.ok(public.importar_acciones('D115', $j$[
  {"codigo":"AM-D115-2025-01","anyo":2025,"numero":1,"nombre":"Una","estado":"completada","cerrada":true,
   "fecha_inicio":"2025-09-01","fecha_fin":"2025-12-31","presupuesto":null,"es_mejora":true},
  {"codigo":"AM-MUDIB-2023-02","anyo":2023,"numero":2,"nombre":"Antigua","estado":"pendiente"}
]$j$::jsonb) = '{"insertadas":2,"actualizadas":0,"omitidas":0}'::jsonb, 'importa 2 acciones nuevas');
select tst.ok((select cerrada and estado = 'completada' from public.acciones where codigo = 'AM-D115-2025-01'),
              'conserva estado y cerrada');
select tst.ok((select comentario from public.historial h join public.acciones a on a.id = h.accion_id
               where a.codigo = 'AM-D115-2025-01') = 'Importada desde Excel', 'el historial indica la importación');
insert into public.acciones (titulacion, anyo, nombre) values ('D115', 2023, 'Nueva tras importar');
select tst.ok((select codigo from public.acciones where nombre = 'Nueva tras importar') = 'AM-D115-2023-03',
              'la numeración continúa tras importar códigos antiguos');
select tst.ok((select comentario from public.historial h join public.acciones a on a.id = h.accion_id
               where a.nombre = 'Nueva tras importar') = 'Alta de la acción', 'el alta normal no hereda el comentario');

select tst.ok(public.importar_acciones('D115', $j$[
  {"codigo":"AM-D115-2025-01","anyo":2025,"numero":1,"nombre":"Una (cambiada)","estado":"completada"}
]$j$::jsonb) = '{"insertadas":0,"actualizadas":0,"omitidas":1}'::jsonb, 'sin actualizar: las existentes se omiten');
select tst.ok((select nombre from public.acciones where codigo = 'AM-D115-2025-01') = 'Una', 'no se modifica');

select tst.ok(public.importar_acciones('D115', $j$[
  {"codigo":"AM-D115-2025-01","anyo":2025,"numero":1,"nombre":"Una (cambiada)","estado":"en_proceso"}
]$j$::jsonb, true) = '{"insertadas":0,"actualizadas":1,"omitidas":0}'::jsonb, 'con actualizar: se sobrescriben');
select tst.ok((select nombre = 'Una (cambiada)' and estado = 'en_proceso' from public.acciones
               where codigo = 'AM-D115-2025-01'), 'datos actualizados');

-- todo o nada: la segunda fila choca con (2025, 1) y no debe quedar nada de la primera
select tst.falla($q$select public.importar_acciones('D115', '[
  {"codigo":"AM-D115-2025-05","anyo":2025,"numero":5,"nombre":"Válida"},
  {"codigo":"AM-OTRA-2025-01","anyo":2025,"numero":1,"nombre":"Choca"}]'::jsonb)$q$, 'una fila inválida aborta la importación');
select tst.ok(not exists (select 1 from public.acciones where codigo = 'AM-D115-2025-05'), 'no queda importación parcial');

select tst.falla($q$select public.importar_acciones('D110', '[]'::jsonb)$q$, 'no puede importar en otra titulación');
reset role;

set role anon;
select tst.falla($q$select public.importar_acciones('D115', '[]'::jsonb)$q$, 'anon no puede importar');
reset role;

set client_min_messages = warning;
drop schema tst cascade;
