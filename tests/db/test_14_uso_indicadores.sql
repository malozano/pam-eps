-- Uso de los indicadores: solo las acciones visibles para quien consulta
create schema if not exists tst14;
grant usage on schema tst14 to anon, authenticated, service_role;
create function tst14.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on all functions in schema tst14 to anon, authenticated, service_role;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000008001', 'admin.t14@ua.es'), ('00000000-0000-0000-0000-000000008002', 'd115.t14@ua.es');
update public.perfiles set rol = 'admin' where email = 'admin.t14@ua.es';
insert into public.perfil_titulacion values ('00000000-0000-0000-0000-000000008002', 'D115');
create temporary table base as select codigo, acciones from public.uso_indicadores() where codigo = 'UATR01';
grant select on base to authenticated;
insert into public.acciones (titulacion, anyo, nombre, indicadores) values
  ('D115', 2031, 'Del máster', array['UATR01']),
  ('CEN', 2031, 'Del centro', array['UATR01']);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000008002', false);
select tst14.ok((select acciones from public.uso_indicadores() where codigo = 'UATR01')
                = (select count(*) from public.acciones where 'UATR01' = any (indicadores)),
                'la coordinación solo cuenta las acciones de sus planes');
select tst14.ok((select count(*) from public.acciones where titulacion = 'CEN') = 0, '(no ve el plan del centro)');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000008001', false);
select tst14.ok((select acciones from public.uso_indicadores() where codigo = 'UATR01') = (select acciones from base) + 2,
                'la administración cuenta todas');
reset role;
select set_config('request.jwt.claim.sub', '', false);
