-- Pruebas de las revisiones del estado de las acciones
create schema if not exists tst11;
grant usage on schema tst11 to anon, authenticated, service_role;
create function tst11.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function tst11.falla(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'ok - % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLO: se esperaba error: %', msg;
end $$;
grant execute on all functions in schema tst11 to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000005001', 'admin.t11@ua.es'),
  ('00000000-0000-0000-0000-000000005002', 'c207.t11@ua.es'),
  ('00000000-0000-0000-0000-000000005003', 'pat.t11@ua.es');
update public.perfiles set rol = 'admin' where email = 'admin.t11@ua.es';
update public.perfiles set rol = 'transversal' where email = 'pat.t11@ua.es';
insert into public.perfil_titulacion values ('00000000-0000-0000-0000-000000005002', 'C207');
update public.responsables set gestor = '00000000-0000-0000-0000-000000005003' where nombre = 'Coordinación PAT';
-- solo las acciones de esta prueba en los planes afectados
delete from public.acciones where titulacion = 'CEN' or titulacion <> 'C207' and titulacion <> 'CEN';

insert into public.acciones (id, titulacion, anyo, numero, nombre, responsable, estado, created_at) values
  ('00000000-0000-0000-0000-00000000b101', 'C207', 2026, 1, 'Abierta 1', 'Coordinación titulación', 'pendiente', now()),
  ('00000000-0000-0000-0000-00000000b102', 'C207', 2026, 2, 'Abierta 2', 'Coordinación titulación', 'en_proceso', now()),
  ('00000000-0000-0000-0000-00000000b103', 'C207', 2026, 3, 'Completada antes', 'Coordinación titulación', 'completada', now()),
  ('00000000-0000-0000-0000-00000000b104', 'CEN', 2026, 1, 'Del PAT', 'Coordinación PAT', 'pendiente', now());
-- (created_at lo fija el trigger a now(): la revisión empieza «después»)
insert into public.revisiones (ambito, titulo, inicio) values
  ('titulaciones', 'Revisión CEN19', now() + interval '1 second'),
  ('centro', 'Revisión CEN02', now() + interval '1 second');
select tst11.falla($$insert into public.revisiones (ambito, titulo) values ('centro', 'otra')$$, 'una sola revisión en curso por ámbito');
select pg_sleep(1.1);

select tst11.ok((select total = 2 and revisadas = 0 from public.recuento_revision((select id from public.revisiones where ambito = 'titulaciones'))),
                'entran las abiertas creadas antes del inicio (no la completada)');

-- La coordinación ve el estado de su plan y confirma sin cambios
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005002', false);
select tst11.ok((select count(*) from public.estado_revision((select id from public.revisiones where ambito = 'titulaciones'))) = 2,
                'la coordinación ve sus acciones de la revisión');
select tst11.ok((select count(*) from public.estado_revision((select id from public.revisiones where ambito = 'centro'))) = 0,
                'y no las del plan del centro');
select public.registrar_seguimiento('00000000-0000-0000-0000-00000000b101', 'pendiente');
select tst11.ok((select revisada from public.estado_revision((select id from public.revisiones where ambito = 'titulaciones'))
                 where accion_id = '00000000-0000-0000-0000-00000000b101'), 'confirmar el estado actual la marca como revisada');
select public.registrar_seguimiento('00000000-0000-0000-0000-00000000b102', 'completada', 'Hecho');
reset role;
select tst11.ok((select completada is not null from public.revisiones where ambito = 'titulaciones'), 'revisión de titulaciones completada');
select tst11.ok((select count(*) from public.avisos where tipo = 'revision') = (select count(*) from public.perfiles where rol = 'admin' and activo),
                'aviso de revisión completada a la administración');
select tst11.ok((select total = 2 and revisadas = 2 from public.recuento_revision((select id from public.revisiones where ambito = 'titulaciones'))),
                'la completada durante la revisión sigue contando como revisada');

-- Cuenta transversal: confirmar sin cambios no requiere revisión ni avisa; con cambios, sí
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005003', false);
select public.registrar_seguimiento('00000000-0000-0000-0000-00000000b104', 'pendiente');
reset role;
select tst11.ok((select not requiere_revision from public.historial where accion_id = '00000000-0000-0000-0000-00000000b104' and tipo = 'seguimiento'),
                'confirmación sin cambios de una cuenta transversal: no requiere revisión');
select tst11.ok(not exists (select 1 from public.avisos where tipo = 'seguimiento' and accion_id = '00000000-0000-0000-0000-00000000b104'),
                'ni genera aviso de seguimiento');
select tst11.ok((select completada is not null from public.revisiones where ambito = 'centro'), 'revisión del centro completada');

-- Finalizar (solo administración)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005002', false);
select tst11.falla($$select public.finalizar_revision((select id from public.revisiones where ambito = 'centro'))$$, 'la coordinación no finaliza revisiones');
select tst11.falla($$insert into public.revisiones (ambito, titulo) values ('centro', 'x')$$, 'ni las crea');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005001', false);
select public.finalizar_revision((select id from public.revisiones where ambito = 'centro'));
reset role;
select tst11.ok((select fin is not null and total = 1 and revisadas = 1 from public.revisiones where ambito = 'centro'), 'finalizada con su resultado');
insert into public.revisiones (ambito, titulo) values ('centro', 'Nueva revisión');
select tst11.ok(true, 'tras finalizar se puede abrir otra');
select set_config('request.jwt.claim.sub', '', false);
