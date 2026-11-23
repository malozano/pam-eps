-- Pruebas de las cuentas de coordinación transversal (responsabilidades del plan del centro)
create schema if not exists tst9;
grant usage on schema tst9 to anon, authenticated, service_role;
create function tst9.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function tst9.falla(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'ok - % (%)', msg, sqlerrm; return; end;
  raise exception 'FALLO: se esperaba error: %', msg;
end $$;
grant execute on all functions in schema tst9 to anon, authenticated, service_role;

-- t1: transversal (Coordinación calidad y Dirección departamentos), t2: transversal sin asignar,
-- adm: administración, c: coordinación de C210
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000003001', 'calidad.t9@ua.es'),
  ('00000000-0000-0000-0000-000000003002', 'otra.t9@ua.es'),
  ('00000000-0000-0000-0000-000000003003', 'admin.t9@ua.es'),
  ('00000000-0000-0000-0000-000000003004', 'c210.t9@ua.es');
update public.perfiles set rol = 'transversal' where email in ('calidad.t9@ua.es', 'otra.t9@ua.es');
update public.perfiles set rol = 'admin' where email = 'admin.t9@ua.es';
insert into public.perfil_titulacion values ('00000000-0000-0000-0000-000000003004', 'C210');
update public.responsables set gestor = '00000000-0000-0000-0000-000000003001'
 where nombre in ('Coordinación calidad', 'Dirección departamentos');

insert into public.acciones (id, titulacion, anyo, numero, nombre, responsable, estado) values
  ('00000000-0000-0000-0000-00000000a901', 'CEN', 2026, 91, 'Encuesta de satisfacción', 'Coordinación calidad', 'pendiente'),
  ('00000000-0000-0000-0000-00000000a902', 'CEN', 2026, 92, 'Revisión de guías', 'Dirección departamentos', 'en_proceso'),
  ('00000000-0000-0000-0000-00000000a903', 'CEN', 2026, 93, 'Plan de movilidad', 'Coordinación movilidad', 'pendiente'),
  ('00000000-0000-0000-0000-00000000a904', 'C210', 2026, 91, 'De titulación con el mismo rol', 'Coordinación calidad', 'pendiente');

-- Cuenta transversal con responsabilidades
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003001', false);
select tst9.ok(public.es_transversal(), 'es_transversal');
select tst9.ok((select array_agg(numero order by numero) from public.acciones) = array[91, 92],
               've solo las acciones del CEN de sus responsabilidades (no las de titulación con el mismo nombre)');
select tst9.ok((select count(*) from public.historial where accion_id = '00000000-0000-0000-0000-00000000a901') = 1,
               've el historial de sus acciones');
select tst9.ok((select count(*) from public.historial where accion_id = '00000000-0000-0000-0000-00000000a903') = 0,
               'no ve el historial de otras acciones');
update public.acciones set nombre = 'cambiado' where id = '00000000-0000-0000-0000-00000000a901';
reset role;
select tst9.ok((select nombre from public.acciones where id = '00000000-0000-0000-0000-00000000a901') = 'Encuesta de satisfacción',
               'no puede editar la acción directamente');
set role authenticated;
select tst9.falla($$insert into public.acciones (titulacion, anyo, nombre) values ('CEN', 2026, 'nueva')$$, 'no puede crear acciones');
select tst9.falla($$select public.registrar_seguimiento('00000000-0000-0000-0000-00000000a903', 'en_proceso', 'x')$$,
                  'no registra seguimiento de acciones de otros responsables');
select tst9.falla($$select public.registrar_seguimiento('00000000-0000-0000-0000-00000000a904', 'en_proceso', 'x')$$,
                  'no registra seguimiento en planes de titulación');
select tst9.falla($$select public.marcar_cerradas(array['00000000-0000-0000-0000-00000000a902'::uuid])$$, 'no puede cerrar acciones');
select tst9.falla($$select public.marcar_revisados(array[1::bigint])$$, 'no puede marcar revisados');
select public.registrar_seguimiento('00000000-0000-0000-0000-00000000a901', 'en_proceso', 'Encuesta enviada', null, null, '2027-05-31');
select public.registrar_seguimiento('00000000-0000-0000-0000-00000000a902', 'cancelada', 'No es viable este curso');
reset role;
select tst9.ok((select estado = 'en_proceso' and fecha_fin = '2027-05-31' from public.acciones where id = '00000000-0000-0000-0000-00000000a901'),
               'registra el seguimiento (estado y nueva fecha de fin)');
select tst9.ok((select estado from public.acciones where id = '00000000-0000-0000-0000-00000000a902') = 'cancelada', 'puede cancelar');
select tst9.ok((select count(*) from public.historial where requiere_revision and revisado is null
                and accion_id in ('00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000a902')) = 2,
               'los seguimientos quedan pendientes de revisar');
select tst9.ok((select count(*) from public.avisos v join public.perfiles p on p.id = v.perfil_id
                where v.tipo = 'seguimiento' and v.historial_id is not null
                  and v.accion_id = '00000000-0000-0000-0000-00000000a901') = (select count(*) from public.perfiles where rol = 'admin' and activo)
               and not exists (select 1 from public.avisos v join public.perfiles p on p.id = v.perfil_id
                               where v.tipo = 'seguimiento' and p.rol <> 'admin'),
               'aviso de seguimiento a cada administrador activo');

-- Cuenta transversal sin responsabilidades
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003002', false);
select tst9.ok((select count(*) from public.acciones) = 0, 'sin responsabilidades no ve acciones');

-- Administración: su seguimiento no requiere revisión; revisa los de la cuenta transversal
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003003', false);
select public.registrar_seguimiento('00000000-0000-0000-0000-00000000a903', 'en_proceso', 'Lo llevo yo');
select tst9.ok((select not requiere_revision from public.historial where accion_id = '00000000-0000-0000-0000-00000000a903' and tipo = 'seguimiento'),
               'el seguimiento de la administración no requiere revisión');
select tst9.ok(public.marcar_revisados((select array_agg(id) from public.historial where requiere_revision)) = 2, 'marca revisados');
reset role;
select tst9.ok((select bool_and(revisado is not null and revisado_por = '00000000-0000-0000-0000-000000003003')
                from public.historial where requiere_revision), 'queda constancia de quién revisó');

-- Coordinación de titulación: sin cambios (no ve el CEN)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003004', false);
select tst9.ok((select array_agg(titulacion) from public.acciones) = array['C210'], 'la coordinación de titulación solo ve su plan');
select public.registrar_seguimiento('00000000-0000-0000-0000-00000000a904', 'en_proceso', 'ok');
reset role;
select tst9.ok((select not requiere_revision from public.historial where accion_id = '00000000-0000-0000-0000-00000000a904' and tipo = 'seguimiento'),
               'el seguimiento de la coordinación de titulación no requiere revisión');

-- Al desactivar la cuenta o quitarle la responsabilidad deja de ver las acciones
update public.perfiles set activo = false where id = '00000000-0000-0000-0000-000000003001';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003001', false);
select tst9.ok((select count(*) from public.acciones) = 0, 'cuenta desactivada: no ve acciones');
reset role;

-- Recuperación de contraseña: un correo cada 10 minutos por dirección
select tst9.ok(public.permitir_recuperacion('Alguien@UA.es'), 'primera solicitud permitida');
select tst9.ok(not public.permitir_recuperacion('alguien@ua.es '), 'segunda solicitud inmediata bloqueada');
update privado.recuperaciones set ultima = now() - interval '11 minutes';
select tst9.ok(public.permitir_recuperacion('alguien@ua.es'), 'pasados 10 minutos se permite');
select tst9.ok(not exists (select 1 from information_schema.role_routine_grants
                           where routine_name = 'permitir_recuperacion' and grantee in ('anon', 'authenticated')),
               'permitir_recuperacion no es accesible desde la API');
select set_config('request.jwt.claim.sub', '', false);
