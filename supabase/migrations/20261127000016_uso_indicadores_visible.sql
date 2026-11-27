-- El uso de cada indicador cuenta solo las acciones que puede ver quien consulta (RLS): la
-- administración, todas; cada coordinación, las de sus planes. Antes contaba las de todos los
-- planes y una coordinación veía acciones que no encontraba en su plan.
create or replace function public.uso_indicadores()
returns table (codigo text, acciones bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.codigo, count(a.id)
  from public.catalogo_indicadores c
  left join public.acciones a on c.codigo = any (a.indicadores)
  group by c.codigo;
$$;
