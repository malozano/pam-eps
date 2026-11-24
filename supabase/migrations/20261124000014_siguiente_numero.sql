-- Siguiente número libre de un plan y curso (para mostrar en la importación los códigos que se
-- asignarán a las acciones sin código). Tiene en cuenta los números de acciones borradas, que no
-- se reutilizan.
create function public.siguiente_numero(p_titulacion text, p_anyo integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.puede_gestionar(p_titulacion) then
    coalesce((select ultimo from public.contadores where titulacion = p_titulacion and anyo = p_anyo), 0) + 1
  end;
$$;
revoke execute on function public.siguiente_numero(text, integer) from public, anon;
grant execute on function public.siguiente_numero(text, integer) to authenticated;
