-- Pruebas de: código automático, contador, historial, RLS y plan público
\set QUIET on
create schema tst;
grant usage on schema tst to anon, authenticated;
create function tst.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on function tst.ok(boolean, text) to anon, authenticated;
create function tst.falla(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (%)', msg, sqlerrm;
    return;
  end;
  raise exception 'FALLO: se esperaba error: %', msg;
end $$;
grant execute on function tst.falla(text, text) to anon, authenticated;

-- ---------------------------------------------------------------- datos
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@ua.es'),
  ('00000000-0000-0000-0000-0000000000d1', 'coord.d110@ua.es'),
  ('00000000-0000-0000-0000-0000000000c3', 'coord.c203@ua.es');
select tst.ok((select count(*) from public.perfiles) = 3, 'el trigger crea un perfil por usuario');
update public.perfiles set rol = 'admin' where email = 'admin@ua.es';
insert into public.perfil_titulacion values
  ('00000000-0000-0000-0000-0000000000d1', 'D110'),
  ('00000000-0000-0000-0000-0000000000c3', 'C203');

-- ------------------------------------------------- coordinador de D110
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;

insert into public.acciones (titulacion, anyo, nombre, responsable, fecha_inicio, fecha_fin)
values ('D110', 2026, 'Mejorar la difusión de la encuesta docente', 'Coordinación titulación', '2026-09-01', '2026-12-31');
select tst.ok((select codigo from public.acciones where nombre like 'Mejorar la difusión%') = 'AM-D110-2026-01',
              'primer código generado AM-D110-2026-01');

insert into public.acciones (titulacion, anyo, nombre) values ('D110', 2026, 'Segunda acción');
insert into public.acciones (titulacion, anyo, nombre) values ('D110', 2026, 'Tercera acción');
select tst.ok((select codigo from public.acciones where nombre = 'Tercera acción') = 'AM-D110-2026-03',
              'numeración consecutiva');

delete from public.acciones where nombre = 'Tercera acción';
insert into public.acciones (titulacion, anyo, nombre) values ('D110', 2026, 'Cuarta acción');
select tst.ok((select codigo from public.acciones where nombre = 'Cuarta acción') = 'AM-D110-2026-04',
              'no se reutilizan números de acciones borradas');

-- importación con código antiguo (siglas)
insert into public.acciones (titulacion, anyo, numero, codigo, nombre, estado)
values ('D110', 2023, 1, 'AM-MUDSDM-2023-01', 'Acción antigua pendiente', 'pendiente'),
       ('D110', 2023, 2, 'AM-MUDSDM-2023-02', 'Acción antigua completada', 'completada');
insert into public.acciones (titulacion, anyo, nombre) values ('D110', 2023, 'Nueva en 2023');
select tst.ok((select codigo from public.acciones where nombre = 'Nueva en 2023') = 'AM-D110-2023-03',
              'tras importar, el contador continúa (AM-D110-2023-03)');
select tst.ok((select codigo from public.acciones where nombre = 'Acción antigua pendiente') = 'AM-MUDSDM-2023-01',
              'se conserva el código original importado');

insert into public.acciones (titulacion, anyo, nombre, es_mejora) values ('D110', 2026, 'Acción que no es de mejora', false);

select tst.ok((select created_by from public.acciones where codigo = 'AM-D110-2026-01')
              = '00000000-0000-0000-0000-0000000000d1', 'created_by se rellena automáticamente');

select tst.falla($$insert into public.acciones (titulacion, anyo, nombre) values ('C203', 2026, 'Intrusa')$$,
                 'un coordinador no puede crear acciones de otra titulación');
select tst.falla($$update public.acciones set anyo = 2025 where codigo = 'AM-D110-2026-01'$$,
                 'un coordinador no puede cambiar el año (código) de una acción');
select tst.falla($$update public.acciones set codigo = 'AM-D110-2026-99' where codigo = 'AM-D110-2026-01'$$,
                 'un coordinador no puede cambiar el código');
select tst.falla($$insert into public.historial (accion_id, comentario) select id, 'x' from public.acciones limit 1$$,
                 'no se puede escribir directamente en el historial');
select tst.falla($$select * from public.contadores$$, 'no se puede leer la tabla de contadores');

-- seguimiento: cambio de estado con observaciones y evidencias
select public.cambiar_estado(
  (select id from public.acciones where codigo = 'AM-D110-2026-01'),
  'en_proceso', 'Enviado el primer email recordatorio', 'https://example.org/email.pdf');
select tst.ok((select estado = 'en_proceso' and observaciones = 'Enviado el primer email recordatorio'
               from public.acciones where codigo = 'AM-D110-2026-01'), 'cambiar_estado actualiza estado y observaciones');
select tst.ok((select count(*) from public.historial h join public.acciones a on a.id = h.accion_id
               where a.codigo = 'AM-D110-2026-01') = 2, 'historial: alta + cambio de estado');
select tst.ok((select h.estado_anterior = 'pendiente' and h.estado_nuevo = 'en_proceso'
                      and h.evidencias = 'https://example.org/email.pdf' and h.usuario_email = 'coord.d110@ua.es'
               from public.historial h join public.acciones a on a.id = h.accion_id
               where a.codigo = 'AM-D110-2026-01' and h.estado_anterior is not null),
              'historial guarda estados, evidencias y usuario');
select public.cambiar_estado((select id from public.acciones where codigo = 'AM-D110-2026-02'), 'cancelada', null, null);
select tst.ok((select observaciones is null from public.acciones where codigo = 'AM-D110-2026-02'),
              'cambiar_estado sin observaciones no borra las existentes');

update public.perfiles set rol = 'admin' where id = auth.uid();
reset role;
select tst.ok((select rol = 'coordinador' from public.perfiles where email = 'coord.d110@ua.es'),
              'un coordinador no puede hacerse administrador');

-- ------------------------------------------------- coordinador de C203
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
set role authenticated;
select tst.ok((select count(*) from public.acciones) = 0, 'coordinador de C203 no ve acciones de D110');
select tst.ok((select count(*) from public.historial) = 0, 'ni su historial');
select tst.falla($$select public.cambiar_estado((select id from public.acciones limit 1), 'completada')$$,
                 'no puede cambiar el estado de acciones ajenas');
delete from public.acciones;
reset role;
select tst.ok((select count(*) from public.acciones where titulacion = 'D110') = 7, 'no puede borrar acciones ajenas');

-- ------------------------------------------------- administrador
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select tst.ok((select count(*) from public.acciones) = 7, 'el administrador ve todas las acciones');
insert into public.acciones (titulacion, anyo, nombre) values ('CEN', 2026, 'Acción del centro');
select tst.ok((select codigo from public.acciones where titulacion = 'CEN') = 'AM-CEN-2026-01', 'código del centro AM-CEN-2026-01');
update public.acciones set numero = 9 where codigo = 'AM-CEN-2026-01';
select tst.ok(exists (select 1 from public.acciones where codigo = 'AM-CEN-2026-09'), 'el administrador puede renumerar (código regenerado)');
select tst.ok((select count(*) from public.perfiles) = 3, 'el administrador ve todos los perfiles');
reset role;

-- ------------------------------------------------- usuario desactivado
update public.perfiles set activo = false where email = 'coord.d110@ua.es';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
select tst.ok((select count(*) from public.acciones) = 0, 'un usuario desactivado pierde el acceso');
reset role;
update public.perfiles set activo = true where email = 'coord.d110@ua.es';

-- ------------------------------------------------- acceso público (anon)
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.falla($$select * from public.acciones$$, 'anon no puede leer la tabla de acciones');
select tst.falla($$select * from public.perfiles$$, 'anon no puede leer perfiles');
select tst.ok((select count(*) from public.titulaciones) = 28, 'anon puede leer las titulaciones');
select tst.ok((select array_agg(codigo order by codigo) from public.plan_publico('D110', 2026))
              = array['AM-D110-2023-03', 'AM-D110-2026-01', 'AM-D110-2026-02', 'AM-D110-2026-04', 'AM-MUDSDM-2023-01'],
              'plan público 2026-27: acciones de mejora de 2026 + anteriores pendientes/en proceso');
select tst.ok((select count(*) from public.plan_publico('D110', 2025)) = 2,
              'plan público 2025-26: solo las de años anteriores no finalizadas');
select tst.falla($$select public.cambiar_estado(gen_random_uuid(), 'completada')$$, 'anon no puede cambiar estados');
reset role;

set client_min_messages = warning;
drop schema tst cascade;
