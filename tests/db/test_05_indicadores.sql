-- Pruebas del catálogo de indicadores y de varios indicadores por acción
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

-- catálogo
select tst.ok((select count(*) from public.catalogo_indicadores) = 79, '79 indicadores con código');
select tst.ok((select count(*) from public.procedimientos) = 18, '18 procedimientos');
select tst.ok((select nombre from public.catalogo_indicadores where codigo = 'UAT03') = 'Estudiantado de nuevo ingreso en 1º'
              and (select procedimiento from public.catalogo_indicadores where codigo = 'UATI03') = 'PC08',
              'UAT03 (PC02) y UATI03 (PC08) corregido');
select tst.ok((select count(*) from public.catalogo_indicadores where codigo in ('ISV3', 'VER03', 'ISV4', 'VER01')) = 4,
              'ISV3/VER03 e ISV4/VER01 como indicadores separados');
select tst.ok((select procedimiento = 'PA02' and procedimientos = array['PE03', 'PA02']
               from public.catalogo_indicadores where codigo = 'UAS01'),
              'UAS01 se agrupa en PA02 y cita PE03 y PA02');

-- separación de textos antiguos
select tst.ok(public.separar_indicadores('UATR01') = array['UATR01'], 'un código');
select tst.ok(public.separar_indicadores(' uas01, UAS05 ;ISV2 ') = array['UAS01', 'UAS05', 'ISV2'], 'varios códigos');
select tst.ok(public.separar_indicadores('Si / No') = array['Si / No'], 'Si / No');
select tst.ok(public.separar_indicadores('ISV3/VER03') = array['ISV3', 'VER03'], 'código doble del documento');
select tst.ok(public.separar_indicadores('Tasa 2020/Abandono') = array['Tasa 2020/Abandono'], 'texto libre con barra se conserva');
select tst.ok(public.separar_indicadores('sí/no') = array['Si / No'], 'sí/no normalizado');
select tst.ok(public.separar_indicadores('Número de propuestas, aprobadas en CG') = array['Número de propuestas, aprobadas en CG'],
              'texto libre con comas se conserva entero');
select tst.ok(public.separar_indicadores(null) = '{}'::text[] and public.separar_indicadores('  ') = '{}'::text[], 'vacío');

-- acciones con varios indicadores y plan público
insert into public.acciones (titulacion, anyo, nombre, indicadores)
values ('C205', 2026, 'Con varios indicadores', array['ISV2', 'VER02', 'Si / No']);
select tst.ok((select indicadores from public.plan_publico('C205', 2026) limit 1) = array['ISV2', 'VER02', 'Si / No'],
              'plan_publico devuelve la lista de indicadores');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a5', 'ind.c205@ua.es');
insert into public.perfil_titulacion values ('00000000-0000-0000-0000-0000000000a5', 'C205');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
set role authenticated;
select tst.ok(public.importar_acciones('C205', $j$[
  {"codigo":"AM-C205-2025-01","anyo":2025,"numero":1,"nombre":"Importada","indicadores":["UATR01","UAS01"]}
]$j$::jsonb) ->> 'insertadas' = '1', 'importa con lista de indicadores');
select tst.ok((select indicadores from public.acciones where codigo = 'AM-C205-2025-01') = array['UATR01', 'UAS01'],
              'indicadores importados');
select tst.ok((select count(*) from public.catalogo_indicadores) = 79, 'coordinador puede leer el catálogo');
select tst.falla($q$insert into public.catalogo_indicadores (codigo, nombre, procedimiento) values ('XX01', 'x', 'PC01')$q$,
                 'coordinador no puede modificar el catálogo');
reset role;

set role anon;
select tst.ok((select count(*) from public.catalogo_indicadores) = 79, 'el catálogo es público (para el plan publicado)');
update public.catalogo_indicadores set nombre = 'x';
reset role;
select tst.ok(not exists (select 1 from public.catalogo_indicadores where nombre = 'x'), 'anon no puede modificar el catálogo');

set client_min_messages = warning;
drop schema tst cascade;
