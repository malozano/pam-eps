-- Pruebas de la fase B: avisos de plazo a las cuentas transversales y preferencias del resumen mensual
create schema if not exists tst10;
grant usage on schema tst10 to anon, authenticated, service_role;
create function tst10.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on all functions in schema tst10 to anon, authenticated, service_role;
create function tst10.n(p_codigo text, p_email text) returns bigint language sql as $$
  select count(*) from public.avisos v join public.acciones a on a.id = v.accion_id join public.perfiles p on p.id = v.perfil_id
  where a.codigo = p_codigo and p.email = p_email
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000004001', 'movilidad.t10@ua.es'),
  ('00000000-0000-0000-0000-000000004002', 'admin.t10@ua.es');
update public.perfiles set rol = 'transversal' where email = 'movilidad.t10@ua.es';
update public.perfiles set rol = 'admin' where email = 'admin.t10@ua.es';
update public.responsables set gestor = '00000000-0000-0000-0000-000000004001' where nombre = 'Coordinación movilidad';
delete from public.avisos;

insert into public.acciones (titulacion, anyo, numero, nombre, responsable, estado, fecha_inicio, fecha_fin) values
  ('CEN', 2027, 1, 'Movilidad, empieza hoy', 'Coordinación movilidad', 'pendiente', '2028-03-01', '2028-06-30'),
  ('CEN', 2027, 2, 'PAT, empieza hoy', 'Coordinación PAT', 'pendiente', '2028-03-01', '2028-06-30');

select public.generar_avisos('2028-03-01');
select tst10.ok(tst10.n('AM-CEN-2027-01', 'movilidad.t10@ua.es') = 1, 'la cuenta transversal recibe el aviso de plazo de su acción');
select tst10.ok(tst10.n('AM-CEN-2027-01', 'admin.t10@ua.es') = 1, 'la administración también recibe el aviso');
select tst10.ok(tst10.n('AM-CEN-2027-02', 'movilidad.t10@ua.es') = 0, 'no recibe avisos de otras responsabilidades');

-- Desactivado en los ajustes: solo la administración
delete from public.avisos;
update public.ajustes_avisos set avisos_plazo_transversal = false;
select public.generar_avisos('2028-03-01');
select tst10.ok(tst10.n('AM-CEN-2027-01', 'movilidad.t10@ua.es') = 0, 'sin avisos de plazo a transversales si se desactiva');
select tst10.ok(tst10.n('AM-CEN-2027-01', 'admin.t10@ua.es') = 1, 'la administración sigue recibiéndolo');
update public.ajustes_avisos set avisos_plazo_transversal = true;

-- Preferencia del resumen mensual (cada uno la suya)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004001', false);
select public.mi_resumen_mensual(false);
select tst10.ok((select count(*) from public.resumenes) = 0, 'resumenes: lectura permitida (vacía)');
reset role;
select tst10.ok((select not resumen_mensual from public.perfiles where email = 'movilidad.t10@ua.es'), 'desactiva su resumen mensual');
select tst10.ok((select resumen_mensual from public.perfiles where email = 'admin.t10@ua.es'), 'sin afectar a los demás');
select tst10.ok((select resumen_dia = 15 and resumen_activo from public.ajustes_avisos), 'resumen el día 15 por defecto');
select set_config('request.jwt.claim.sub', '', false);
