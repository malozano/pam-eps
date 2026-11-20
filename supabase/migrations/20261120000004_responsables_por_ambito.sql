-- Catálogo de responsables diferenciado para los planes de titulación y el plan del centro.
-- Un mismo responsable puede servir para ambos.
alter table public.responsables
  add column para_titulaciones boolean not null default true,
  add column para_centro       boolean not null default false;

-- Responsables comunes a ambos planes
update public.responsables set para_centro = true
 where nombre in ('Coordinación asignatura', 'Coordinación titulación', 'Delegación estudiantes',
                  'Dirección departamentos', 'Secretaría');

-- Responsables exclusivos del plan del centro
insert into public.responsables (nombre, orden, para_titulaciones, para_centro) values
  ('Coordinación calidad', 100, false, true),
  ('Coordinación comunicación', 100, false, true),
  ('Coordinación EPS', 100, false, true),
  ('Coordinación movilidad', 100, false, true),
  ('Coordinación PAT', 100, false, true),
  ('Coordinación postgrado', 100, false, true),
  ('Coordinación prácticas', 100, false, true),
  ('Coordinación cultura', 100, false, true),
  ('Coordinación igualdad', 100, false, true),
  ('Coordinación estudiantes', 100, false, true),
  ('Coordinación innovación tecnológica y docente', 100, false, true),
  ('Coordinación infraestructuras', 100, false, true),
  ('Equipo directivo', 100, false, true);

comment on column public.responsables.para_titulaciones is 'Aparece en los planes de las titulaciones';
comment on column public.responsables.para_centro is 'Aparece en el plan del centro (CEN)';
