/**
 * Análisis de las tasas de éxito y rendimiento (eficacia) para el informe de seguimiento (CEN19):
 * tablas por curso de la titulación con los últimos cursos académicos disponibles (máx. 3),
 * medianas y valores a destacar según criterios configurables.
 */
import type { AsignaturaTasas, Semestre, TasasTitulacion } from './tasas'

export interface CriteriosTasas {
  /** Tasa (éxito o rendimiento) por debajo de este valor (0-1) */
  tasa_baja: number
  /** Cambio respecto al curso anterior (en tanto por uno: 0.25 = 25 puntos) */
  cambio: number
  /** Diferencia con la mediana de su curso (tanto por uno) */
  desviacion: number
  /** Diferencia éxito − rendimiento que indica muchos no presentados (tanto por uno) */
  no_presentados: number
  /** No se destacan asignaturas con menos matriculados (muestras pequeñas) */
  min_matriculados: number
}

export const CRITERIOS_POR_DEFECTO: CriteriosTasas = {
  tasa_baja: 0.3,
  cambio: 0.25,
  desviacion: 0.35,
  no_presentados: 0.5,
  min_matriculados: 5,
}

export type Motivo = 'baja' | 'cambio' | 'atipica' | 'no_presentados'
export type MetricaTasa = 'exito' | 'rendimiento'

export interface FilaAnalisis {
  asignatura: AsignaturaTasas
  /** Valores por curso académico (mismo orden que `cursos`) */
  exito: (number | null)[]
  rendimiento: (number | null)[]
  /** Matriculados en el curso analizado */
  matriculados: number | null
  /** Motivos por los que se destaca cada tasa del curso analizado */
  marcas: Record<MetricaTasa, Motivo[]>
  /** Frases para el apartado «Aspectos a destacar» */
  detalles: string[]
}

export interface TablaCurso {
  /** Curso de la titulación (1, 2…) o null para «Trabajo fin de grado/máster» */
  curso: number | null
  titulo: string
  filas: FilaAnalisis[]
  /** Medianas por curso académico */
  mediana: Record<MetricaTasa, (number | null)[]>
}

export interface AnalisisTasas {
  cursoAnalizado: string
  /** Cursos académicos de las columnas (los últimos disponibles hasta el analizado, máx. 3) */
  cursos: string[]
  tablas: TablaCurso[]
  /** Avisos sobre los datos (no son valores destacados) */
  avisos: string[]
  totalDestacadas: number
}

export function semestresDelBloque(bloque: 'primero' | 'segundo'): Semestre[] {
  // «Ambos semestres» y las asignaturas sin semestre se analizan en el bloque del segundo
  return bloque === 'primero' ? ['primero'] : ['segundo', 'ambos', 'sin']
}

export function mediana(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`)
const puntos = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} puntos`
const NOMBRE: Record<MetricaTasa, string> = { exito: 'éxito', rendimiento: 'rendimiento' }

export function analizarTasas(
  t: TasasTitulacion,
  cursoAnalizado: string,
  bloque: 'primero' | 'segundo',
  c: CriteriosTasas = CRITERIOS_POR_DEFECTO,
): AnalisisTasas {
  if (!t.cursos.includes(cursoAnalizado))
    throw new Error(
      `El fichero no incluye el curso ${cursoAnalizado} (cursos disponibles: ${t.cursos.join(', ') || 'ninguno'}).`,
    )
  const cursos = t.cursos.filter((x) => x <= cursoAnalizado).slice(-3)
  const i = cursos.length - 1 // columna del curso analizado
  const semestres = semestresDelBloque(bloque)
  const asignaturas = t.asignaturas.filter((a) => semestres.includes(a.semestre))
  const avisos: string[] = []

  // Asignaturas sin ningún dato en los cursos mostrados (p. ej. optativas no ofertadas): se omiten
  const conDatos = asignaturas.filter((a) =>
    cursos.some((cu) => a.datos[cu]?.exito !== null || a.datos[cu]?.rendimiento !== null),
  )
  const omitidas = asignaturas.length - conDatos.length
  if (omitidas) avisos.push(`${omitidas} asignaturas sin datos en ${cursos.join(', ')} no se incluyen en las tablas.`)
  if (asignaturas.length && !conDatos.some((a) => a.datos[cursoAnalizado]?.rendimiento !== null || a.datos[cursoAnalizado]?.exito !== null))
    avisos.push(
      `El fichero no tiene tasas de ${cursoAnalizado} para las asignaturas de este semestre (¿se exportó antes del cierre de actas?).`,
    )
  if (!asignaturas.length) avisos.push('El fichero no tiene asignaturas de este semestre.')

  const fila = (a: AsignaturaTasas): FilaAnalisis => ({
    asignatura: a,
    exito: cursos.map((cu) => a.datos[cu]?.exito ?? null),
    rendimiento: cursos.map((cu) => a.datos[cu]?.rendimiento ?? null),
    matriculados: a.datos[cursoAnalizado]?.matriculados ?? null,
    marcas: { exito: [], rendimiento: [] },
    detalles: [],
  })
  const medianas = (filas: FilaAnalisis[]) => ({
    exito: cursos.map((_, k) => mediana(filas.map((f) => f.exito[k]))),
    rendimiento: cursos.map((_, k) => mediana(filas.map((f) => f.rendimiento[k]))),
  })

  /** Aplica los criterios a una fila (`med` = medianas de su curso; null para TFG/TFM, que no se comparan). */
  function marcar(f: FilaAnalisis, med: ReturnType<typeof medianas> | null) {
    if ((f.matriculados ?? 0) < c.min_matriculados) return
    for (const m of ['exito', 'rendimiento'] as const) {
      const v = f[m][i]
      if (v === null) continue
      if (v < c.tasa_baja) {
        f.marcas[m].push('baja')
        f.detalles.push(`tasa de ${NOMBRE[m]} del ${pct(v)} (inferior al ${pct(c.tasa_baja)})`)
      }
      const anterior = f[m].slice(0, i).reverse().find((x) => x !== null) ?? null
      if (anterior !== null && Math.abs(v - anterior) >= c.cambio) {
        f.marcas[m].push('cambio')
        f.detalles.push(`la tasa de ${NOMBRE[m]} pasa del ${pct(anterior)} al ${pct(v)} (${puntos(v - anterior)})`)
      }
      const md = med?.[m][i] ?? null
      if (md !== null && Math.abs(v - md) >= c.desviacion) {
        f.marcas[m].push('atipica')
        f.detalles.push(`tasa de ${NOMBRE[m]} del ${pct(v)}, muy alejada de la mediana de su curso (${pct(md)})`)
      }
    }
    const e = f.exito[i]
    const r = f.rendimiento[i]
    if (e !== null && r !== null && e - r >= c.no_presentados) {
      f.marcas.rendimiento.push('no_presentados')
      f.detalles.push(`éxito del ${pct(e)} frente a rendimiento del ${pct(r)}: alta tasa de no presentados`)
    }
  }

  const ordenar = (l: AsignaturaTasas[]) => [...l].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const tablas: TablaCurso[] = []
  const nCursos = [...new Set(conDatos.filter((a) => !a.esTrabajoFin).map((a) => a.curso))].sort(
    (a, b) => (a ?? 99) - (b ?? 99),
  )
  for (const n of nCursos) {
    const filas = ordenar(conDatos.filter((a) => !a.esTrabajoFin && a.curso === n)).map(fila)
    const med = medianas(filas)
    filas.forEach((f) => marcar(f, med))
    tablas.push({ curso: n, titulo: n ? `${n}.º curso` : 'Sin curso asignado', filas, mediana: med })
  }
  const tf = ordenar(conDatos.filter((a) => a.esTrabajoFin)).map(fila)
  if (tf.length) {
    tf.forEach((f) => marcar(f, null)) // se analizan aparte: sin comparación con la mediana
    tablas.push({ curso: null, titulo: 'Trabajo fin de grado / máster', filas: tf, mediana: medianas(tf) })
  }

  return {
    cursoAnalizado,
    cursos,
    tablas,
    avisos,
    totalDestacadas: tablas.reduce((n, tb) => n + tb.filas.filter((f) => f.detalles.length).length, 0),
  }
}

/** Frases del borrador «Aspectos a destacar»: una por asignatura destacada. */
export function aspectosDestacados(a: AnalisisTasas): string[] {
  const res: string[] = []
  for (const tb of a.tablas)
    for (const f of tb.filas)
      if (f.detalles.length) {
        const contexto = [tb.curso ? `${tb.curso}.º` : null, f.matriculados !== null ? `${f.matriculados} matriculados` : null]
          .filter(Boolean)
          .join(', ')
        res.push(`${f.asignatura.nombre} (${contexto}): ${f.detalles.join('; ')}.`)
      }
  return res
}

/** Ajustes guardados (puntos porcentuales) → criterios del análisis (tanto por uno). */
export interface AjustesInforme {
  tasa_baja: number
  cambio: number
  desviacion: number
  no_presentados: number
  min_matriculados: number
}
export function criteriosDesdeAjustes(a: AjustesInforme | null | undefined): CriteriosTasas {
  if (!a) return CRITERIOS_POR_DEFECTO
  return {
    tasa_baja: a.tasa_baja / 100,
    cambio: a.cambio / 100,
    desviacion: a.desviacion / 100,
    no_presentados: a.no_presentados / 100,
    min_matriculados: a.min_matriculados,
  }
}
