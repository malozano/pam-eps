-- Pruebas del catálogo de responsables por ámbito
create schema tst;
create function tst.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

select tst.ok((select count(*) from public.responsables where para_titulaciones) = 8,
              '8 responsables para los planes de titulación');
select tst.ok((select count(*) from public.responsables where para_centro) = 18,
              '18 responsables para el plan del centro');
select tst.ok((select count(*) from public.responsables where para_centro and para_titulaciones) = 5,
              '5 responsables comunes');
select tst.ok(not exists (select 1 from public.responsables where not para_centro and not para_titulaciones),
              'ningún responsable queda sin ámbito');

set client_min_messages = warning;
drop schema tst cascade;
