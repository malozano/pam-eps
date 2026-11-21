-- Criterios para destacar tasas en el informe de seguimiento (CEN19). Una sola fila; valores en
-- puntos porcentuales (30 = 30 %). Editable por administración.
create table public.ajustes_informe (
  id               boolean primary key default true check (id),
  tasa_baja        integer not null default 30 check (tasa_baja between 0 and 100),
  cambio           integer not null default 25 check (cambio between 1 and 100),
  desviacion       integer not null default 35 check (desviacion between 1 and 100),
  no_presentados   integer not null default 50 check (no_presentados between 1 and 100),
  min_matriculados integer not null default 5  check (min_matriculados between 1 and 1000)
);
insert into public.ajustes_informe default values;
comment on table public.ajustes_informe is 'Criterios para destacar tasas en el informe de seguimiento (puntos porcentuales)';

alter table public.ajustes_informe enable row level security;
create policy ajustes_informe_lectura on public.ajustes_informe for select to authenticated using (true);
create policy ajustes_informe_admin on public.ajustes_informe for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
revoke all on public.ajustes_informe from anon;
