-- Pruebas del mantenimiento del catálogo de indicadores
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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'admin.ind@ua.es'),
  ('00000000-0000-0000-0000-0000000000b2', 'coord.ind@ua.es');
update public.perfiles set rol = 'admin' where email = 'admin.ind@ua.es';
insert into public.perfil_titulacion values ('00000000-0000-0000-0000-0000000000b2', 'C211');
insert into public.acciones (titulacion, anyo, nombre, indicadores) values
  ('C211', 2026, 'Usa UAT12 y UAT11', array['UAT12', 'UAT11', 'Si / No']),
  ('C211', 2026, 'Usa UAT12', array['UAT12']);

select tst.ok(public.orden_procedimiento('PE03') < public.orden_procedimiento('PC01')
              and public.orden_procedimiento('PC09') < public.orden_procedimiento('PA01'), 'orden de procedimientos por código');

-- coordinador: puede ver el uso, no puede tocar el catálogo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;
select tst.ok((select acciones from public.uso_indicadores() where codigo = 'UAT12') = 2, 'uso: UAT12 en 2 acciones (de cualquier plan)');
select tst.ok((select acciones from public.uso_indicadores() where codigo = 'UAT13') = 0, 'uso: UAT13 en ninguna');
select tst.falla($q$select public.cambiar_codigo_indicador('UAT12', 'UAT99')$q$, 'coordinador no puede cambiar códigos');
select tst.falla($q$select public.actualizar_catalogo_indicadores('[]', '[]', true)$q$, 'coordinador no puede actualizar el catálogo');
reset role;

-- administración
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.falla($q$delete from public.catalogo_indicadores where codigo = 'UAT12'$q$, 'no se puede borrar un indicador en uso');
delete from public.catalogo_indicadores where codigo = 'UAT13';
select tst.ok(not exists (select 1 from public.catalogo_indicadores where codigo = 'UAT13'), 'se borra un indicador sin uso');

-- cambio de código simple
select tst.ok(public.cambiar_codigo_indicador('UAT12', 'UAT120') = '{"fusion": false, "acciones": 2}'::jsonb, 'cambio de código en 2 acciones');
select tst.ok((select indicadores from public.acciones where nombre = 'Usa UAT12 y UAT11') = array['UAT120', 'UAT11', 'Si / No'],
              'las acciones usan el código nuevo, en el mismo orden');
select tst.ok(exists (select 1 from public.catalogo_indicadores where codigo = 'UAT120')
              and not exists (select 1 from public.catalogo_indicadores where codigo = 'UAT12'), 'catálogo renombrado');

-- fusión: UAT120 -> UAT11 (ya existe): sin duplicados
select tst.ok(public.cambiar_codigo_indicador('UAT120', 'UAT11') ->> 'fusion' = 'true', 'fusión con un indicador existente');
select tst.ok((select indicadores from public.acciones where nombre = 'Usa UAT12 y UAT11') = array['UAT11', 'Si / No'],
              'sin duplicar el indicador fusionado');
select tst.ok((select indicadores from public.acciones where nombre = 'Usa UAT12') = array['UAT11'], 'la otra acción también');
select tst.ok(not exists (select 1 from public.catalogo_indicadores where codigo = 'UAT120'), 'el código antiguo desaparece');

-- actualización masiva
select tst.ok(public.actualizar_catalogo_indicadores(
  '[{"codigo":"PC09","nombre":"Nuevo procedimiento"}]',
  '[{"codigo":"UAT11","nombre":"Tasa de éxito (rev.)","definicion":"Nueva definición","procedimiento":"PC01","procedimientos":["PC01"]},
    {"codigo":"UANEW1","nombre":"Indicador nuevo","definicion":null,"procedimiento":"PC09","procedimientos":["PC09","PA02"]}]',
  false) = '{"nuevos": 1, "actualizados": 1, "desactivados": 0}'::jsonb, 'actualización: 1 nuevo y 1 modificado');
select tst.ok((select nombre = 'Tasa de éxito (rev.)' and definicion = 'Nueva definición' from public.catalogo_indicadores where codigo = 'UAT11'),
              'indicador modificado');
select tst.ok((select procedimiento = 'PC09' and procedimientos = array['PC09', 'PA02'] from public.catalogo_indicadores where codigo = 'UANEW1'),
              'indicador nuevo en un procedimiento nuevo');
select tst.ok((select count(*) from public.catalogo_indicadores where activo) = 78, 'sin desactivar ausentes no cambia el resto');
select tst.ok((public.actualizar_catalogo_indicadores('[]',
  '[{"codigo":"UAT11","nombre":"Tasa de éxito","procedimiento":"PC01","procedimientos":["PC01"]}]', true) ->> 'desactivados')::int = 77,
  'desactivar ausentes');
select tst.ok((select count(*) from public.catalogo_indicadores where activo) = 1, 'solo queda activo el incluido');
select tst.ok(public.actualizar_catalogo_indicadores('[]',
  '[{"codigo":"UAS01","nombre":"Satisfacción del estudiantado con la titulación","procedimiento":"PA02","procedimientos":["PE03","PA02"]}]', false)
  ->> 'actualizados' = '1', 'volver a incluir un indicador existente');
select tst.ok((select activo from public.catalogo_indicadores where codigo = 'UAS01'), 'y lo reactiva');
reset role;

set client_min_messages = warning;
drop schema tst cascade;
