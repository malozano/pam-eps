-- Publicación de los planes (centro / titulaciones)
create schema if not exists tst13;
grant usage on schema tst13 to anon, authenticated, service_role;
create function tst13.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function tst13.falla(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'ok - % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLO: se esperaba error: %', msg;
end $$;
grant execute on all functions in schema tst13 to anon, authenticated, service_role;

insert into public.acciones (titulacion, anyo, nombre) values ('CEN', 2030, 'Del centro'), ('C214', 2030, 'De titulación');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000007001', 'admin.t13@ua.es'), ('00000000-0000-0000-0000-000000007002', 'c214.t13@ua.es');
update public.perfiles set rol = 'admin' where email = 'admin.t13@ua.es';
insert into public.perfil_titulacion values ('00000000-0000-0000-0000-000000007002', 'C214');

set role anon;
select tst13.ok((select centro and titulaciones from public.ajustes_publicacion), 'por defecto, todo publicado (y se puede leer sin sesión)');
select tst13.ok((select count(*) from public.plan_publico('CEN', 2030) where codigo = 'AM-CEN-2030-01') = 1 and (select count(*) from public.plan_publico('C214', 2030)) = 1, 'planes visibles');
select tst13.falla($$update public.ajustes_publicacion set centro = false$$, 'sin sesión no se cambia');
reset role;

-- La coordinación no puede cambiarlo
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007002', false);
update public.ajustes_publicacion set titulaciones = false;
reset role;
select tst13.ok((select titulaciones from public.ajustes_publicacion), 'la coordinación no lo cambia');

-- La administración despublica el plan del centro
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007001', false);
update public.ajustes_publicacion set centro = false;
reset role;
set role anon;
select tst13.ok((select count(*) from public.plan_publico('CEN', 2030)) = 0, 'plan del centro no publicado: no devuelve nada');
select tst13.ok((select count(*) from public.plan_publico('C214', 2030)) = 1, 'los de titulación siguen publicados');
select tst13.ok(not public.plan_publicado('CEN') and public.plan_publicado('C214'), 'plan_publicado');
reset role;
update public.ajustes_publicacion set centro = true, titulaciones = true;
select set_config('request.jwt.claim.sub', '', false);
