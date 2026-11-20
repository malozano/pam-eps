-- Pruebas de registrar_seguimiento y marcar_cerradas
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
  ('00000000-0000-0000-0000-0000000000f1', 'seg.c201@ua.es'),
  ('00000000-0000-0000-0000-0000000000f2', 'seg.c204@ua.es');
insert into public.perfil_titulacion values
  ('00000000-0000-0000-0000-0000000000f1', 'C201'),
  ('00000000-0000-0000-0000-0000000000f2', 'C204');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
set role authenticated;
insert into public.acciones (titulacion, anyo, nombre, fecha_inicio, fecha_fin)
values ('C201', 2026, 'Seguimiento A', '2026-09-01', '2026-12-31'),
       ('C201', 2026, 'Seguimiento B', '2026-09-01', '2026-12-31');
select tst.ok((select tipo from public.historial h join public.acciones a on a.id = h.accion_id
               where a.codigo = 'AM-C201-2026-01') = 'alta', 'el alta queda registrada con tipo alta');

-- en proceso con reprogramación de la fecha de fin
select public.registrar_seguimiento(
  (select id from public.acciones where codigo = 'AM-C201-2026-01'), 'en_proceso',
  'Enviados los emails; quedan los carteles', 'https://example.org/acta.pdf', null, '2027-02-28');
select tst.ok((select estado = 'en_proceso' and fecha_fin = '2027-02-28' and observaciones like 'Enviados%'
               from public.acciones where codigo = 'AM-C201-2026-01'), 'en proceso, observaciones y nueva fecha de fin');
select tst.ok((select count(*) from public.historial h join public.acciones a on a.id = h.accion_id
               where a.codigo = 'AM-C201-2026-01') = 2, 'una sola entrada nueva en el historial (sin duplicar por el trigger)');
select tst.ok((select tipo = 'seguimiento' and estado_anterior = 'pendiente' and estado_nuevo = 'en_proceso'
                      and h.fecha_fin = '2027-02-28' and h.fecha_inicio is null and h.evidencias like 'https://%'
               from public.historial h join public.acciones a on a.id = h.accion_id
               where a.codigo = 'AM-C201-2026-01' and h.tipo = 'seguimiento'),
              'el historial guarda estados, evidencias y solo la fecha que cambió');

-- nota de seguimiento sin cambio de estado
select public.registrar_seguimiento((select id from public.acciones where codigo = 'AM-C201-2026-01'),
                                    'en_proceso', 'Carteles encargados');
select tst.ok((select count(*) from public.historial h join public.acciones a on a.id = h.accion_id
               where a.codigo = 'AM-C201-2026-01' and h.tipo = 'seguimiento') = 2,
              'se puede registrar seguimiento sin cambiar de estado');

select tst.falla($q$select public.registrar_seguimiento((select id from public.acciones where codigo = 'AM-C201-2026-01'), 'completada', '  ')$q$,
                 'completar exige observaciones');
select tst.falla($q$select public.registrar_seguimiento((select id from public.acciones where codigo = 'AM-C201-2026-01'), 'en_proceso', null, null, '2027-06-01', null)$q$,
                 'no se puede dejar el inicio después del fin');
select tst.falla($q$select public.marcar_cerradas(array[(select id from public.acciones where codigo = 'AM-C201-2026-01')])$q$,
                 'no se puede cerrar una acción en proceso');

select public.registrar_seguimiento((select id from public.acciones where codigo = 'AM-C201-2026-01'), 'completada', 'Hecho todo');
select public.registrar_seguimiento((select id from public.acciones where codigo = 'AM-C201-2026-02'), 'cancelada', 'Ya no procede');
select tst.ok(public.marcar_cerradas(array(select id from public.acciones where titulacion = 'C201')) = 2,
              'cierra en bloque las dos acciones finalizadas');
select tst.ok(public.marcar_cerradas(array(select id from public.acciones where titulacion = 'C201')) = 0,
              'volver a cerrarlas no hace nada');
select tst.ok((select count(*) from public.historial where tipo = 'cierre') = 2, 'el cierre queda en el historial');

-- reabrir una acción cerrada le quita la marca
select public.registrar_seguimiento((select id from public.acciones where codigo = 'AM-C201-2026-01'), 'en_proceso', 'Se retoma');
select tst.ok((select not cerrada from public.acciones where codigo = 'AM-C201-2026-01'), 'reabrir quita la marca de cerrada');
select tst.ok(public.marcar_cerradas(array[(select id from public.acciones where codigo = 'AM-C201-2026-02')], false) = 1,
              'se puede quitar la marca de cerrada');
reset role;

-- otro coordinador no puede tocar estas acciones
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
create temp table ids as select id, codigo from public.acciones where titulacion = 'C201';
grant select on ids to authenticated;
set role authenticated;
select tst.falla($q$select public.registrar_seguimiento((select id from ids where codigo = 'AM-C201-2026-01'), 'cancelada', 'x')$q$,
                 'otro coordinador no puede registrar seguimiento');
select tst.falla($q$select public.marcar_cerradas(array(select id from ids))$q$,
                 'otro coordinador no puede cerrar acciones ajenas');
reset role;
set role anon;
select tst.falla($q$select public.marcar_cerradas(array[]::uuid[])$q$, 'anon no puede cerrar acciones');
reset role;

set client_min_messages = warning;
drop schema tst cascade;
