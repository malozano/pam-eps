-- Catálogo de indicadores del Sistema de Calidad (documento «Indicadores por procedimiento»,
-- V04 sep. 2026) y varios indicadores por acción.

-- ---------------------------------------------------------------------
-- Procedimientos y catálogo de indicadores
-- ---------------------------------------------------------------------
create table public.procedimientos (
  codigo text primary key check (codigo ~ '^P[ACE][0-9]{2}$'),
  nombre text not null,
  orden  integer not null default 100
);

create table public.catalogo_indicadores (
  codigo         text primary key check (codigo ~ '^[A-Z0-9]+$'),
  nombre         text not null check (length(trim(nombre)) > 0),
  definicion     text,
  procedimiento  text not null references public.procedimientos (codigo) on update cascade,
  procedimientos text[] not null default '{}',
  activo         boolean not null default true,
  orden          integer not null default 1000
);
comment on table public.catalogo_indicadores is 'Indicadores con código del Sistema de Calidad, agrupados por procedimiento';
comment on column public.catalogo_indicadores.procedimiento is 'Grupo en el que se muestra en el selector';
comment on column public.catalogo_indicadores.procedimientos is 'Todos los procedimientos en los que aparece';

alter table public.procedimientos enable row level security;
alter table public.catalogo_indicadores enable row level security;
create policy procedimientos_lectura on public.procedimientos for select using (true);
create policy procedimientos_admin on public.procedimientos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy catalogo_indicadores_lectura on public.catalogo_indicadores for select using (true);
create policy catalogo_indicadores_admin on public.catalogo_indicadores for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- Varios indicadores por acción: indicador (texto) -> indicadores (lista)
-- ---------------------------------------------------------------------
alter table public.acciones add column indicadores text[] not null default '{}';

-- Un texto con varios códigos separados por comas, punto y coma, saltos de línea o «/» se separa;
-- cualquier otro texto se conserva como un único indicador (escrito a mano).
create function public.separar_indicadores(p_texto text)
returns text[]
language sql
immutable
as $$
  with partes as (
    select array_remove(array(
      -- separadores: coma, punto y coma, salto de línea y «/» entre códigos (ISV3/VER03)
      select trim(x) from regexp_split_to_table(coalesce(p_texto, ''), '[,;\n]|(?<=[0-9])\s*/\s*(?=[A-Za-z])') as x
    ), '') as p
  )
  select case
    when cardinality(p) = 0 then '{}'::text[]
    when (select bool_and(x ~* '^([A-Z]{2,6}[0-9]{1,3}|s[ií] ?/ ?no)$') from unnest(p) as x)
      then array(select case when x ~* '^s[ií] ?/ ?no$' then 'Si / No' else upper(x) end from unnest(p) as x)
    else array[trim(p_texto)]
  end
  from partes;
$$;

update public.acciones set indicadores = public.separar_indicadores(indicador);

-- plan_publico devuelve ahora la lista de indicadores
drop function public.plan_publico(text, integer);
create function public.plan_publico(p_titulacion text, p_anyo integer)
returns table (
  codigo        text,
  anyo          integer,
  numero        integer,
  nombre        text,
  tareas        text,
  responsable   text,
  fecha_inicio  date,
  fecha_fin     date,
  indicadores   text[],
  origen        text,
  estado        public.estado_accion,
  presupuesto   numeric,
  observaciones text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.codigo, a.anyo, a.numero, a.nombre, a.tareas, a.responsable,
         a.fecha_inicio, a.fecha_fin, a.indicadores, a.origen, a.estado,
         a.presupuesto, a.observaciones
  from public.acciones a
  join public.titulaciones t on t.codigo = a.titulacion and t.activa
  where a.titulacion = p_titulacion
    and a.es_mejora
    and (a.anyo = p_anyo
         or (a.anyo < p_anyo and a.estado in ('pendiente', 'en_proceso')))
  order by a.anyo desc, a.numero;
$$;
revoke execute on function public.plan_publico(text, integer) from public;
grant execute on function public.plan_publico(text, integer) to anon, authenticated;

-- importar_acciones recibe 'indicadores' como array JSON
create or replace function public.importar_acciones(
  p_titulacion text,
  p_acciones   jsonb,
  p_actualizar boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r          jsonb;
  v_id       uuid;
  v_ind      text[];
  v_insert   integer := 0;
  v_update   integer := 0;
  v_omitidas integer := 0;
begin
  if not public.puede_gestionar(p_titulacion) then
    raise exception 'Sin permisos sobre la titulación %', p_titulacion using errcode = '42501';
  end if;
  if jsonb_typeof(p_acciones) is distinct from 'array' then
    raise exception 'p_acciones debe ser un array JSON';
  end if;

  perform set_config('app.comentario_historial', 'Importada desde Excel', true);

  for r in select value from jsonb_array_elements(p_acciones) loop
    v_ind := case when jsonb_typeof(r -> 'indicadores') = 'array'
                  then array(select jsonb_array_elements_text(r -> 'indicadores'))
                  else '{}'::text[] end;
    select id into v_id from public.acciones
     where codigo = r ->> 'codigo' and titulacion = p_titulacion;

    if v_id is null then
      insert into public.acciones (
        titulacion, anyo, numero, codigo, nombre, tareas, responsable, fecha_inicio, fecha_fin,
        indicadores, origen, estado, presupuesto, es_mejora, observaciones, cerrada)
      values (
        p_titulacion, (r ->> 'anyo')::integer, (r ->> 'numero')::integer, r ->> 'codigo', r ->> 'nombre',
        r ->> 'tareas', r ->> 'responsable', (r ->> 'fecha_inicio')::date, (r ->> 'fecha_fin')::date,
        v_ind, r ->> 'origen', coalesce((r ->> 'estado')::public.estado_accion, 'pendiente'),
        (r ->> 'presupuesto')::numeric, coalesce((r ->> 'es_mejora')::boolean, true), r ->> 'observaciones',
        coalesce((r ->> 'cerrada')::boolean, false));
      v_insert := v_insert + 1;
    elsif p_actualizar then
      update public.acciones set
        nombre        = r ->> 'nombre',
        tareas        = r ->> 'tareas',
        responsable   = r ->> 'responsable',
        fecha_inicio  = (r ->> 'fecha_inicio')::date,
        fecha_fin     = (r ->> 'fecha_fin')::date,
        indicadores   = v_ind,
        origen        = r ->> 'origen',
        estado        = coalesce((r ->> 'estado')::public.estado_accion, estado),
        presupuesto   = (r ->> 'presupuesto')::numeric,
        es_mejora     = coalesce((r ->> 'es_mejora')::boolean, es_mejora),
        observaciones = r ->> 'observaciones',
        cerrada       = coalesce((r ->> 'cerrada')::boolean, cerrada)
      where id = v_id;
      v_update := v_update + 1;
    else
      v_omitidas := v_omitidas + 1;
    end if;
  end loop;

  perform set_config('app.comentario_historial', '', true);
  return jsonb_build_object('insertadas', v_insert, 'actualizadas', v_update, 'omitidas', v_omitidas);
end;
$$;

alter table public.acciones drop column indicador;

-- ---------------------------------------------------------------------
-- Datos: procedimientos e indicadores con código (generado desde el documento V04;
-- correcciones: UAT03 de PC08 -> UATI03; ISV3/VER03 e ISV4/VER01 como indicadores separados)
-- ---------------------------------------------------------------------
insert into public.procedimientos (codigo, nombre, orden) values
  ('PE01', 'Política de calidad y objetivos', 0),
  ('PE02', 'Diseño y extinción de títulos oficiales', 1),
  ('PE03', 'Revisión, análisis y mejora del SC', 2),
  ('PC01', 'Desarrollo y seguimiento de las enseñanzas', 3),
  ('PC02', 'Perfiles de ingreso, acceso, admisión y matrícula', 4),
  ('PC03', 'Orientación a estudiantes', 5),
  ('PC04', 'Movilidad de estudiantes', 6),
  ('PC05', 'Gestión de las prácticas externas', 7),
  ('PC06', 'Análisis de la inserción laboral', 8),
  ('PC07', 'Información pública y rendición de cuentas', 9),
  ('PC08', 'Coordinación e integración de datos en el seguimiento de títulos interuniversitarios', 10),
  ('PA01', 'Gestión de quejas y sugerencias', 11),
  ('PA02', 'Satisfacción de los grupos de interés', 12),
  ('PA03', 'Gestión de PDI', 13),
  ('PA04', 'Gestión de PTGAS', 14),
  ('PA05', 'Gestión de los recursos materiales', 15),
  ('PA06', 'Gestión de los servicios', 16),
  ('PA08', 'Auditorías internas', 17);

insert into public.catalogo_indicadores (codigo, nombre, definicion, procedimiento, procedimientos, orden) values
  ('UAS01', 'Satisfacción del estudiantado con la titulación', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) de los resultados generales de todas las titulaciones del centro.', 'PA02', array['PE03', 'PA02'], 0),
  ('UAS05', 'Satisfacción del profesorado con la titulación', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) de los resultados generales de todas las titulaciones del centro.', 'PA02', array['PE03', 'PA02'], 1),
  ('IAV1', 'Tasa de oferta y demanda (AVAP)', 'Relación porcentual entre el número de estudiantes que solicitaron en la preinscripción cursar la titulación en primera opción y el número de plazas oficiales ofertadas.', 'PC01', array['PC01'], 2),
  ('IAV4', 'Tasa de matriculación (AVAP)', 'Relación porcentual entre el número de estudiantes que han ingresados en las titulaciones del centro (en primer curso u otros) y el número total de plazas oficiales ofertadas para esas titulaciones.', 'PC01', array['PC01'], 3),
  ('IAV6', 'Estimación de la duración media de estudios (AVAP)', 'Producto de la duración teórica de la titulación y la tasa de eficiencia ISV3. Cálculo: Promedio de la duración teórica de las titulaciones del centro / Promedio de la tasa de eficiencia ISV3 para las titulaciones del centro.', 'PC01', array['PC01'], 4),
  ('ISV1', 'Tasa de rendimiento del título (AVAP)', 'Relación porcentual entre el número de créditos aptos y el número total de créditos matriculados en las titulaciones del centro.', 'PC01', array['PC01'], 5),
  ('ISV3', 'Tasa de eficiencia (AVAP)', 'Relación porcentual entre el total de créditos necesarios para graduarse en las titulaciones del centro y el total de créditos matriculados por quienes se gradúan en estas titulaciones.', 'PC01', array['PC01'], 6),
  ('VER03', 'Tasa de eficiencia (VERIFICA-ANECA)', 'Relación porcentual entre el total de créditos necesarios para graduarse en las titulaciones del centro y el total de créditos matriculados por quienes se gradúan en estas titulaciones.', 'PC01', array['PC01'], 7),
  ('ISV2', 'Tasa de abandono del título (AVAP)', 'Relación porcentual entre el número de estudiantes de una cohorte de ingreso y quienes (de la misma cohorte) abandonan (no se matriculan) en ninguno de los dos cursos posteriores a su ingreso. Cálculo: Siendo X el curso de ingreso, Número de estudiantes que ingresan en X y no se matriculan en X+1 ni en X+2 / Número de estudiantes que ingresan en X.', 'PC01', array['PC01'], 8),
  ('VER02', 'Tasa de abandono (VERIFICA-ANECA)', 'Relación porcentual entre el número de estudiantes de una cohorte de ingreso y quienes (de la misma cohorte) abandonan (no se matriculan) en su curso de graduación teórico ni en el anterior. Cálculo: Siendo X el curso de ingreso y d la duración teórica del estudio, Número de estudiantes que ingresan en X y que no se matriculan en X+d-2 ni en X+d-1 / Número de estudiantes que ingresan en X.', 'PC01', array['PC01'], 9),
  ('ISV4', 'Tasa de graduación del título (AVAP)', 'Relación porcentual entre el número de estudiantes de una cohorte de ingreso que se titulan en la duración teórica del plan de estudios (o la duración teórica más un año) y el número de estudiantes que han ingresado en esa misma cohorte. Cálculo: Siendo X el curso de ingreso y d la duración teórica del estudio, Número de estudiantes de las titulaciones del centro que ingresan en X y se titulan en X+d-1 o en X+d / Número de estudiantes que ingresan en las titulaciones del centro en X.', 'PC01', array['PC01'], 10),
  ('VER01', 'Tasa de graduación (VERIFICA-ANECA)', 'Relación porcentual entre el número de estudiantes de una cohorte de ingreso que se titulan en la duración teórica del plan de estudios (o la duración teórica más un año) y el número de estudiantes que han ingresado en esa misma cohorte. Cálculo: Siendo X el curso de ingreso y d la duración teórica del estudio, Número de estudiantes de las titulaciones del centro que ingresan en X y se titulan en X+d-1 o en X+d / Número de estudiantes que ingresan en las titulaciones del centro en X.', 'PC01', array['PC01'], 11),
  ('UAT10', 'Dedicación Lectiva media', 'Relación entre el número de créditos totales matriculados y el número de estudiantes que se matriculan en las titulaciones del centro.', 'PC01', array['PC01'], 12),
  ('UAT11', 'Tasa de éxito', 'Relación porcentual entre el número de créditos aprobados y el número de créditos presentados por quienes se matriculan en las titulaciones del centro.', 'PC01', array['PC01'], 13),
  ('UAT12', 'Tasa de no presentados', 'Porcentaje de créditos no presentados en ninguna convocatoria de los créditos totales de quienes se matriculan en las titulaciones del centro.', 'PC01', array['PC01'], 14),
  ('UAT13', 'Duración media de los estudios', 'Promedio del número de años que emplean en titularse quienes se gradúan en las titulaciones del centro.', 'PC01', array['PC01'], 15),
  ('UAT14', 'Duración media de los estudios (estudiantado a tiempo completo)', 'Promedio del número de años que emplean en titularse quienes se gradúan en las titulaciones del centro a tiempo completo.', 'PC01', array['PC01'], 16),
  ('UAT15', 'Duración media de los estudios (estudiantado a tiempo parcial)', 'Promedio del número de años que emplean en titularse quienes se gradúan en las titulaciones del centro a tiempo parcial (Sólo en grados).', 'PC01', array['PC01'], 17),
  ('UAT28', 'Ratio Estudiantado/PDI', 'Cociente entre el número de Estudiantes con matrícula en la titulación y el número de PDI en Equivalencia a Tiempo Completo.', 'PC01', array['PC01'], 18),
  ('UAT01', 'Número de plazas ofertadas', 'Número de plazas oficiales ofertadas en las titulaciones del centro para estudiantes de nuevo ingreso.', 'PC02', array['PC02'], 19),
  ('UAT02', 'Estudiantado de nuevo ingreso', 'Número de estudiantes que acceden por primera vez a las titulaciones del centro (incluso quienes tienes reconocimiento de créditos).', 'PC02', array['PC02'], 20),
  ('UAT03', 'Estudiantado de nuevo ingreso en 1º', 'Número de estudiantes que acceden por primera vez a las titulaciones del centro en primer curso.', 'PC02', array['PC02'], 21),
  ('UAT04', 'Estudiantado de nuevo ingreso en1º, en 1ª opción', 'Porcentaje de estudiantes de nuevo ingreso en primer curso que solicitaron cursar las titulaciones del centro en primera opción en el proceso de preinscripción.', 'PC02', array['PC02'], 22),
  ('UAT05', 'Exceso de Oferta', 'Porcentaje de plazas oficiales que no son cubiertas.', 'PC02', array['PC02'], 23),
  ('UAT06', 'Demanda insatisfecha en 1ª opción', 'Porcentaje de estudiantes que solicitaron el estudio en primera opción de preinscripción y que no han sido admitidos/as por exceder el número de plazas ofertadas oficiales.', 'PC02', array['PC02'], 24),
  ('UAT07', 'Estudiantado total', 'Número de estudiantes que se matriculan en las titulaciones del centro.', 'PC02', array['PC02'], 25),
  ('UAT08', 'Estudiantado a tiempo completo', 'Número de estudiantes que se matriculan de 48 o más créditos en las titulaciones del centro.', 'PC02', array['PC02'], 26),
  ('UAT09', 'Estudiantado a tiempo parcial', 'Número de estudiantes que se matriculan de menos de 48 créditos en las titulaciones del centro (Solo en grados)', 'PC02', array['PC02'], 27),
  ('UAPT01', 'Estudiantado inscrito en PAT (Programa de Acción Tutorial)', 'Número de estudiantes inscritos en PAT en los grados del centro en el curso académico.', 'PC03', array['PC03'], 28),
  ('UAPT11', 'Estudiantado participante en PAT (Programa de Acción Tutorial)', 'Número de estudiantes que participan en PAT en los grados del centro en el curso académico.', 'PC03', array['PC03'], 29),
  ('UAS09', 'Cumplimiento de expectativas del estudiantado del PAT', 'Porcentaje de estudiantes que indican que el desarrollo del PAT ha cumplido las expectativas mucho, adecuadamente o bastante.', 'PC03', array['PC03'], 30),
  ('UAPT04', 'Estudiantado acogido en programas de movilidad', 'Número de estudiantes de otras universidades que han participado en programas de movilidad en grados del centro.', 'PC04', array['PC04'], 31),
  ('UAPT05', 'Estudiantado enviado en programas de movilidad', 'Número de estudiantes de grados del centro que han participado en programas de movilidad en otras universidades.', 'PC04', array['PC04'], 32),
  ('UATR05', 'Tasa de respuesta de la encuesta de satisfacción con los programas de movilidad', 'Número de respuestas valorando la movilidad en las titulaciones de grado del centro / Número de estudiantes que han participado en programas de movilidad en las titulaciones de grado del centro.', 'PC04', array['PC04'], 33),
  ('UAS13', 'Satisfacción del estudiantado con los programas de movilidad', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) de los resultados generales.', 'PC04', array['PC04'], 34),
  ('UAPT06', 'Estudiantado extranjero', 'Número de estudiantes de nacionalidad no española con matrícula en el conjunto de los másteres del centro.', 'PC04', array['PC04'], 35),
  ('UAPT02', 'Estudiantado en prácticas en empresa', 'Número de prácticas en empresa realizadas por estudiantes con matrícula en las titulaciones del centro.', 'PC05', array['PC05'], 36),
  ('UAPT03', 'Número de tutores/as de empresa', 'Número de tutores/as en empresas con estudiantes en prácticas en las titulaciones del centro.', 'PC05', array['PC05'], 37),
  ('UATR03', 'Tasa de respuesta de la encuesta de satisfacción del estudiantado con las prácticas en empresa', 'Número de respuestas valorando las prácticas en titulaciones del centro / Número de prácticas en empresa realizadas en las titulaciones del centro.', 'PC05', array['PC05'], 38),
  ('UATR04', 'Tasa de respuesta de la encuesta de satisfacción de tutores/as empresa', 'Número de respuestas valorando las prácticas en titulaciones del centro / Número de tutores/as en empresas con estudiantes en prácticas.', 'PC05', array['PC05'], 39),
  ('UAS10', 'Satisfacción del estudiantado con las prácticas en empresa', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) de los resultados generales.', 'PC05', array['PC05'], 40),
  ('UAS11', 'Satisfacción de tutores/as de empresa', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) de los resultados generales.', 'PC05', array['PC05'], 41),
  ('UAS12', 'Valoración del tutor/a de empresa sobre la adecuación de la formación académica del estudiantado', 'Valoración (de 0-mínima a 10-máxima) de la adecuación de la formación académica de estudiantes a las necesidades de la empresa/institución', 'PC05', array['PC05'], 42),
  ('UAL01', 'Índice de ocupación del estudiantado egresado', 'Porcentaje de estudiantes que se egresan y trabajan por cuenta propia o ajena en el momento de realización de la encuesta.', 'PC06', array['PC06'], 43),
  ('UAL02', 'Porcentaje de ocupación: tiene empleo o continúa estudios', 'Porcentaje de estudiantes que se egresan y trabajan por cuenta propia o ajena o continúan estudios en el momento de realización de la encuesta.', 'PC06', array['PC06'], 44),
  ('UAL03', 'Número de meses en encontrar el primer empleo tras graduarse', 'Número medio de meses hasta encontrar el primer empleo desde la finalización del título cursado.', 'PC06', array['PC06'], 45),
  ('UAL04', 'Índice de adecuación del nivel de estudios', 'Porcentaje de estudiantes que se egresan y que ocupan un empleo que requiere titulación universitaria en el momento de realización de la encuesta.', 'PC06', array['PC06'], 46),
  ('UAS02', 'Satisfacción del estudiantado con la información pública sobre la titulación', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) del ítem Información sobre la titulación en la página web de la UA de todas las titulaciones del centro.', 'PC07', array['PC07'], 47),
  ('UAS06', 'Satisfacción del profesorado con la información pública sobre la titulación', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) del ítem Información sobre la titulación en la página web de la UA de todas las titulaciones del centro.', 'PC07', array['PC07'], 48),
  ('UATI01', 'Titulaciones interuniversitarias responsabilidad del centro', 'Número de titulaciones interuniversitarias coordinadas por la UA adscritas al centro', 'PC08', array['PC08'], 49),
  ('UATI02', 'Número de universidades que participan en los programas interuniversitarios del centro', 'Número de universidades que participan en programa interuniversitarios del centro coordinados por la UA', 'PC08', array['PC08'], 50),
  ('UATI03', 'Porcentaje de universidades que envían los indicadores solicitados', 'Porcentaje de universidades que envían los indicadores solicitados respecto al total de universidades que participan en los programas interuniversitarios del centro coordinados por la UA.', 'PC08', array['PC08'], 51),
  ('UATR01', 'Tasa de respuesta de la encuesta de satisfacción del estudiantado con la titulación', 'Número de respuestas valorando las titulaciones del centro / Número de estudiantes que han solicitado la expedición del título de las titulaciones del centro por el sistema de eAdministración en el período de referencia.', 'PA02', array['PA02'], 52),
  ('UATR02', 'Tasa de respuesta de la encuesta de satisfacción del profesorado con la titulación', 'Número de respuestas valorando las titulaciones del centro / Número de PDI perteneciente a la UA que ha impartido docencia en el curso de referencia en alguna de las asignaturas ofertadas en las titulaciones del centro.', 'PA02', array['PA02'], 53),
  ('UAS04', 'Satisfacción del estudiantado con el profesorado', 'Media de la valoración global en la Encuesta Docente (Escala: de 0-Totalmente en desacuerdo a 10-Totalmente de acuerdo) del profesorado adscrito al centro.', 'PA02', array['PA02'], 54),
  ('UAS08', 'Recomendación del estudiantado de la titulación', 'Porcentaje de estudiantado que recomendaría estudiar en la UA la titulación.', 'PA02', array['PA02'], 55),
  ('UAS19', 'Satisfacción del estudiantado egresado con las asignaturas de la titulación', 'Media (Escala: de 0-mínima a 10-máxima) de la Calidad de las asignaturas y contenidos formativos de las titulaciones del centro.', 'PA02', array['PA02'], 56),
  ('UAS20', 'Satisfacción del estudiantado egresado con la docencia en la titulación', 'Media (Escala: de 0-mínima a 10-máxima) de la Calidad de la docencia de las titulaciones del centro.', 'PA02', array['PA02'], 57),
  ('UAS21', 'Satisfacción del estudiantado egresado con la titulación', 'Media (Escala: de 0-mínima a 10-máxima) de la Calidad de los aspectos formativos de la titulación de todas las titulaciones del centro.', 'PA02', array['PA02'], 58),
  ('UAS22', 'Recomendación del estudiantado egresado de la titulación cursada', 'Porcentaje de estudiantado egresado que recomendaría estudiar en la UA las titulaciones del centro cursadas.', 'PA02', array['PA02'], 59),
  ('UAS23', 'Satisfacción media del estudiantado con la atención a tutorías por el PDI', 'Media (Escala: de 0-mínima a 10-máxima) de la atención a tutorías', 'PA02', array['PA02'], 60),
  ('UAS24', 'Satisfacción del PTGAS con la gestión de las titulaciones', 'Media (Escala: de 0-mínima a 10-máxima) de la satisfacción con las titulaciones del centro', 'PA02', array['PA02'], 61),
  ('IAV2', 'Tasa de PDI doctor (AVAP)', 'Relación porcentual entre el número de PDI doctor con docencia en las titulaciones del centro y el número total de PDI con docencia en las titulaciones del centro. Cálculo: Número de PDI doctor con docencia en las titulaciones del centro / Número total de PDI con docencia en las titulaciones del centro.', 'PA03', array['PA03'], 62),
  ('IAV3', 'Tasa de PDI a tiempo completo (AVAP)', 'Relación porcentual entre el número de PDI a tiempo completo con docencia en las titulaciones del centro y el número total de PDI con docencia en las titulaciones del centro. Cálculo: Número de PDI a tiempo completo con docencia en las titulaciones del centro / Número total de PDI con docencia en las titulaciones del centro.', 'PA03', array['PA03'], 63),
  ('UAPE01', 'Número de quinquenios totales', 'Número total de méritos docentes (quinquenios) del PDI adscrito al centro.', 'PA03', array['PA03'], 64),
  ('UAPE02', 'Número medio de quinquenios', 'Número total de quinquenios / Número total de PDI adscrito al centro.', 'PA03', array['PA03'], 65),
  ('UAPE03', 'Número de sexenios totales', 'Número total de sexenios (incluye sexenios de investigación y de transferencia) del PDI adscrito al centro.', 'PA03', array['PA03'], 66),
  ('UAPE04', 'Número medio de sexenios', 'Número total de sexenios / Número total de PDI adscrito al centro.', 'PA03', array['PA03'], 67),
  ('UAPE05', 'PDI que participa en cursos de formación', 'Porcentaje de PDI que participa en cursos de formación en el curso académico (1 septiembre - 31 agosto). Cálculo: Número de PDI adscrito al centro con formación en el periodo / Número de PDI adscrito al centro a 31 de diciembre.', 'PA03', array['PA03'], 68),
  ('UAPE09', 'Tasa de PDI permanente', 'Relación porcentual entre el número de PDI con contrato permanente y docencia en la titulación, y el número total de PDI con docencia en la titulación', 'PA03', array['PA03'], 69),
  ('UAPE10', 'Créditos impartidos por PDI Doctor', 'Relación porcentual entre el número total de créditos impartidos en la titulación por PDI doctor y el número total de créditos impartidos en la titulación', 'PA03', array['PA03'], 70),
  ('UAPE11', 'Ratio Sexenios / Quinquenios', 'Cociente entre el número de sexenios y el número de quinquenios del PDI con docencia en la titulación', 'PA03', array['PA03'], 71),
  ('UAPE12', 'Sexenios vivos', 'Número de sexenios vivos del PDI con docencia en la titulación', 'PA03', array['PA03'], 72),
  ('UAPE06', 'PTGAS que participa en cursos de formación', 'Porcentaje de PTGAS que participa en cursos de formación en el curso académico (1 septiembre-31 agosto). Cálculo: Número de PTGAS con destino en la secretaría administrativa del centro con formación en el periodo / Número de PTGAS con destino en la secretaría administrativa del centro a 31 de diciembre.', 'PA04', array['PA04'], 73),
  ('UAS15', 'Satisfacción del personal con su trabajo', 'Media (Escala: de 0-mínima a 10-máxima) de la satisfacción laboral del PTGAS (clima laboral) de la Secretaría administrativa del centro.', 'PA04', array['PA04'], 74),
  ('UAS03', 'Satisfacción del estudiantado con los recursos', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) del apartado INFRAESTRUCTURAS Y RECURSOS.', 'PA05', array['PA05'], 75),
  ('UAS07', 'Satisfacción del profesorado con los recursos', 'Media (Escala: de 0-mínima a 10-máxima satisfacción) del ítem Instalaciones e infraestructuras asignadas al grado.', 'PA05', array['PA05'], 76),
  ('UAS14', 'Satisfacción con el servicio', 'Media (Escala: de 0-mínima a 10-máxima) de la valoración de la secretaría administrativa del centro.', 'PA06', array['PA06'], 77),
  ('UAS16', 'Satisfacción con la conserjería', 'Media (Escala: de 0-mínima a 10-máxima) de la valoración de la/s conserjería/s del centro.', 'PA06', array['PA06'], 78);
