-- Pruebas de la generación de avisos de plazos
create schema tst;
grant usage on schema tst to anon, authenticated, service_role;
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
grant execute on all functions in schema tst to anon, authenticated, service_role;
create function tst.n(p_codigo text, p_tipo text) returns bigint language sql as $$
  select count(*) from public.avisos v join public.acciones a on a.id = v.accion_id
  where a.codigo = p_codigo and v.tipo = p_tipo
$$;

-- Usuarios: coordinación de C206 (2 personas), un admin, coordinación de CEN, uno inactivo
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001001', 'c206.a@ua.es'),
  ('00000000-0000-0000-0000-000000001002', 'c206.b@ua.es'),
  ('00000000-0000-0000-0000-000000001003', 'admin.av@ua.es'),
  ('00000000-0000-0000-0000-000000001004', 'cen.av@ua.es'),
  ('00000000-0000-0000-0000-000000001005', 'inactivo.av@ua.es');
update public.perfiles set rol = 'admin' where email = 'admin.av@ua.es';
update public.perfiles set activo = false where email = 'inactivo.av@ua.es';
insert into public.perfil_titulacion values
  ('00000000-0000-0000-0000-000000001001', 'C206'),
  ('00000000-0000-0000-0000-000000001002', 'C206'),
  ('00000000-0000-0000-0000-000000001004', 'CEN'),
  ('00000000-0000-0000-0000-000000001005', 'C206');

select tst.ok((select count(*) from public.destinatarios_plan('C206')) = 2, 'destinatarios de C206: su coordinación activa (no el admin ni inactivos)');
select tst.ok((select bool_and(p.rol = 'admin' or p.email = 'cen.av@ua.es') and bool_or(p.email = 'admin.av@ua.es')
                      and bool_or(p.email = 'cen.av@ua.es')
               from public.destinatarios_plan('CEN') d join public.perfiles p on p.id = d),
              'destinatarios de CEN: su coordinación y la administración');

-- Hoy = 2027-01-15. Ajustes por defecto: inicio el mismo día, fin 30 días antes, vencida 1 día después
insert into public.acciones (titulacion, anyo, numero, nombre, estado, fecha_inicio, fecha_fin) values
  ('C206', 2026, 1, 'Empieza hoy', 'pendiente', '2027-01-15', '2027-06-30'),
  ('C206', 2026, 2, 'Empezó hace 3 días', 'pendiente', '2027-01-12', '2027-06-30'),
  ('C206', 2026, 3, 'Empezó hace 20 días (fuera de ventana)', 'pendiente', '2026-12-26', '2027-06-30'),
  ('C206', 2026, 4, 'Empieza mañana', 'pendiente', '2027-01-16', '2027-06-30'),
  ('C206', 2026, 5, 'Ya en proceso, empezó hoy', 'en_proceso', '2027-01-15', '2027-06-30'),
  ('C206', 2026, 6, 'Termina en 30 días', 'en_proceso', '2026-10-01', '2027-02-14'),
  ('C206', 2026, 7, 'Termina en 31 días', 'en_proceso', '2026-10-01', '2027-02-15'),
  ('C206', 2026, 8, 'Terminó ayer', 'en_proceso', '2026-10-01', '2027-01-14'),
  ('C206', 2026, 9, 'Terminó ayer pero completada', 'completada', '2026-10-01', '2027-01-14'),
  ('C206', 2026, 10, 'Terminó hoy', 'pendiente', '2026-10-01', '2027-01-15'),
  ('CEN', 2026, 1, 'Del centro, empieza hoy', 'pendiente', '2027-01-15', '2027-06-30');

select tst.ok(public.generar_avisos('2027-01-15') > 0, 'genera avisos');
select tst.ok(tst.n('AM-C206-2026-01', 'inicio') = 2, 'inicio hoy: un aviso por cada coordinador/a');
select tst.ok(tst.n('AM-C206-2026-02', 'inicio') = 2, 'inicio hace 3 días (dentro de la ventana de 7)');
select tst.ok(tst.n('AM-C206-2026-03', 'inicio') = 0, 'inicio hace 20 días: fuera de ventana, no se avisa');
select tst.ok(tst.n('AM-C206-2026-04', 'inicio') = 0, 'inicio mañana: todavía no');
select tst.ok(tst.n('AM-C206-2026-05', 'inicio') = 0, 'ya en proceso: no se avisa del inicio');
select tst.ok(tst.n('AM-C206-2026-06', 'fin_proximo') = 2, 'termina en 30 días: aviso de fin próximo');
select tst.ok(tst.n('AM-C206-2026-07', 'fin_proximo') = 0, 'termina en 31 días: todavía no');
select tst.ok(tst.n('AM-C206-2026-08', 'vencida') = 2, 'terminó ayer sin completar: plazo vencido');
select tst.ok(tst.n('AM-C206-2026-09', 'vencida') = 0, 'completada: no se avisa');
select tst.ok(tst.n('AM-C206-2026-10', 'vencida') = 0, 'termina hoy: aún no vencida');
select tst.ok(tst.n('AM-CEN-2026-01', 'inicio') = (select count(*) from public.destinatarios_plan('CEN')),
              'plan del centro: coordinación y administración');
select tst.ok((select count(*) from public.avisos v join public.perfiles p on p.id = v.perfil_id
               where p.email = 'admin.av@ua.es') = 1, 'la administración solo recibe avisos del plan del centro');

-- Una sola vez por acción y evento
select tst.ok(public.generar_avisos('2027-01-15') = 0, 'volver a ejecutar el mismo día no repite avisos');
select public.generar_avisos('2027-01-16');
select tst.ok(tst.n('AM-C206-2026-04', 'inicio') = 2 and tst.n('AM-C206-2026-07', 'fin_proximo') = 2
              and tst.n('AM-C206-2026-10', 'vencida') = 2 and tst.n('AM-C206-2026-01', 'inicio') = 2,
              'al día siguiente solo los eventos nuevos (empieza, a un mes del fin, recién vencida), sin repetir los de ayer');
-- Si la acción se reprograma, hay aviso para la nueva fecha
update public.acciones set fecha_fin = '2027-01-20' where codigo = 'AM-C206-2026-08';
select public.generar_avisos('2027-01-21');
select tst.ok(tst.n('AM-C206-2026-08', 'vencida') = 4, 'reprogramada y vuelve a vencer: aviso nuevo para la nueva fecha');

-- Ajustes configurables y desactivación
update public.ajustes_avisos set dias_antes_inicio = 7;
insert into public.acciones (titulacion, anyo, numero, nombre, estado, fecha_inicio, fecha_fin)
values ('C206', 2026, 11, 'Empieza en una semana', 'pendiente', '2027-02-01', '2027-06-30');
select public.generar_avisos('2027-01-25');
select tst.ok(tst.n('AM-C206-2026-11', 'inicio') = 2, 'aviso de inicio con 7 días de antelación (configurable)');
update public.ajustes_avisos set activo = false;
select tst.ok(public.generar_avisos('2027-03-01') = 0, 'con los avisos desactivados no se genera nada');
update public.ajustes_avisos set activo = true, dias_antes_inicio = 0;

-- Permisos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', false);
set role authenticated;
select tst.ok((select count(*) from public.avisos) > 0
              and not exists (select 1 from public.avisos where perfil_id <> auth.uid()), 'cada usuario ve solo sus avisos');
select tst.falla($q$select public.generar_avisos()$q$, 'un usuario no puede lanzar la generación');
select tst.falla($q$select public.config_privada('secreto_tarea')$q$, 'un usuario no puede leer la configuración privada');
select tst.falla($q$select * from privado.config$q$, 'ni acceder al esquema privado');
update public.ajustes_avisos set activo = false, dias_antes_fin = 99;
select public.mis_preferencias_avisos(false, true);
select tst.ok((select not avisos_push and avisos_email from public.perfiles where id = auth.uid()), 'cada usuario cambia sus preferencias');
insert into public.suscripciones_push (perfil_id, endpoint, p256dh, auth) values (auth.uid(), 'https://push.example/1', 'k', 'a');
select tst.falla($q$insert into public.suscripciones_push (perfil_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-000000001002', 'https://push.example/2', 'k', 'a')$q$,
                 'no se pueden registrar suscripciones de otro usuario');
reset role;
select tst.ok((select activo and dias_antes_fin = 30 from public.ajustes_avisos), 'un coordinador no puede cambiar los ajustes');

set role service_role;
select tst.ok(length(public.config_privada('secreto_tarea')) = 64, 'la Edge Function (service_role) lee el secreto de la tarea');
reset role;

set client_min_messages = warning;
drop schema tst cascade;
