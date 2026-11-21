-- Pruebas de los criterios del informe de seguimiento
create schema tst;
grant usage on schema tst to anon, authenticated;
create function tst.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on all functions in schema tst to anon, authenticated;

select tst.ok((select tasa_baja = 30 and cambio = 25 and desviacion = 35 and no_presentados = 50 and min_matriculados = 5
               from public.ajustes_informe), 'valores por defecto');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000002001', 'admin.inf@ua.es'),
  ('00000000-0000-0000-0000-000000002002', 'coord.inf@ua.es');
update public.perfiles set rol = 'admin' where email = 'admin.inf@ua.es';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002002', false);
set role authenticated;
select tst.ok((select count(*) from public.ajustes_informe) = 1, 'un coordinador puede leer los criterios');
update public.ajustes_informe set tasa_baja = 10;
reset role;
select tst.ok((select tasa_baja from public.ajustes_informe) = 30, 'un coordinador no puede cambiarlos');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002001', false);
set role authenticated;
update public.ajustes_informe set tasa_baja = 25, min_matriculados = 8;
reset role;
select tst.ok((select tasa_baja = 25 and min_matriculados = 8 from public.ajustes_informe), 'la administración sí');

set role anon;
select tst.ok(not exists (select 1 from information_schema.role_table_grants
                          where table_name = 'ajustes_informe' and grantee = 'anon'), 'sin acceso anónimo');
reset role;
set client_min_messages = warning;
drop schema tst cascade;
