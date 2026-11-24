-- Importación de acciones sin código: se numeran a continuación del último número del curso
create schema if not exists tst12;
grant usage on schema tst12 to anon, authenticated, service_role;
create function tst12.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on all functions in schema tst12 to anon, authenticated, service_role;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000006001', 'c213.t12@ua.es');
insert into public.perfil_titulacion values ('00000000-0000-0000-0000-000000006001', 'C213');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000006001', false);

select tst12.ok(public.siguiente_numero('C213', 2026) = 1, 'sin acciones: el siguiente es el 1');
insert into public.acciones (titulacion, anyo, nombre) values ('C213', 2026, 'Manual 1'), ('C213', 2026, 'Manual 2');
delete from public.acciones where titulacion = 'C213' and nombre = 'Manual 2';
select tst12.ok(public.siguiente_numero('C213', 2026) = 3, 'los números borrados no se reutilizan');
select tst12.ok(public.siguiente_numero('D110', 2026) is null, 'sin permisos sobre otro plan: nada');

-- Con código (número 5) y sin código: las sin código van después del 5 si se envían después
select public.importar_acciones('C213', '[
  {"codigo": "AM-C213-2026-05", "anyo": 2026, "numero": 5, "nombre": "Con código", "estado": "pendiente"},
  {"codigo": null, "anyo": 2026, "numero": null, "nombre": "Sin código A", "estado": "pendiente"},
  {"codigo": null, "anyo": 2026, "numero": null, "nombre": "Sin código B", "estado": "en_proceso"}
]'::jsonb);
select tst12.ok((select array_agg(codigo order by numero) from public.acciones where titulacion = 'C213')
                = array['AM-C213-2026-01', 'AM-C213-2026-05', 'AM-C213-2026-06', 'AM-C213-2026-07'],
                'las acciones sin código continúan la numeración del curso');
select tst12.ok((select count(*) from public.historial h join public.acciones a on a.id = h.accion_id
                 where a.titulacion = 'C213' and h.tipo = 'importacion') = 3, 'quedan como importadas en el historial');
reset role;
select set_config('request.jwt.claim.sub', '', false);
