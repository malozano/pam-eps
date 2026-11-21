/**
 * Lectura del Excel de tasas por asignatura (exportación del sistema de información de la UA:
 * «Tasas de Éxito, Rendimiento y No presentados por Asignatura»).
 *
 * Estructura esperada (una titulación por fichero):
 * - Cabecera con «Plan Asig.» → nombre de la titulación.
 * - Una fila con los bloques de métricas (Matriculados, Aprobados, Presentados, Tasa de Éxito,
 *   Tasa de Rendimiento, Tasa No presentados), celdas combinadas sobre sus cursos.
 * - La fila siguiente con los cursos académicos («2023-24», …).
 * - Filas de asignaturas: semestre («Cuando se imparte?», celdas combinadas por grupo), código,
 *   nombre, curso (1, 2, 3…) y tipo de crédito.
 * Las tasas vienen como fracciones (0-1); los huecos son cursos sin datos.
 */
import { normalizar, valorCelda } from './importacion'

export type Metrica = 'matriculados' | 'aprobados' | 'presentados' | 'exito' | 'rendimiento' | 'no_presentados'
export type Semestre = 'primero' | 'segundo' | 'ambos' | 'sin'

export interface DatosCurso {
  matriculados: number | null
  aprobados: number | null
  presentados: number | null
  exito: number | null //        0-1
  rendimiento: number | null //  0-1
  no_presentados: number | null
}

export interface AsignaturaTasas {
  codigo: string
  nombre: string
  curso: number | null //  curso de la titulación (1.º, 2.º…)
  tipo: string
  semestre: Semestre
  /** Trabajo fin de grado / máster: se analiza aparte */
  esTrabajoFin: boolean
  datos: Record<string, DatosCurso> // por curso académico («2025-26»)
}

export interface TasasTitulacion {
  titulacion: string | null
  /** Cursos académicos presentes en el fichero, ordenados */
  cursos: string[]
  asignaturas: AsignaturaTasas[]
}

export type Celda = (fila: number, col: number) => unknown

function metricaDe(texto: string): Metrica | null {
  const t = normalizar(texto)
  if (!t) return null
  if (t.includes('matricul')) return 'matriculados'
  if (t.includes('aprobad')) return 'aprobados'
  if (t.includes('no presentad')) return 'no_presentados'
  if (t.includes('presentad')) return 'presentados'
  if (t.includes('exito')) return 'exito'
  if (t.includes('rendimiento') || t.includes('eficacia')) return 'rendimiento'
  return null
}

export function semestreDe(texto: string): Semestre {
  const t = normalizar(texto)
  if (t.includes('ambos') || t.includes('anual')) return 'ambos'
  if (t.includes('primer') || t.startsWith('1')) return 'primero'
  if (t.includes('segundo') || t.startsWith('2')) return 'segundo'
  return 'sin'
}

const RE_CURSO = /^\d{4}-\d{2}$/
const texto = (v: unknown) => {
  const x = valorCelda(v)
  return x === null ? '' : String(x).replace(/\s+/g, ' ').trim()
}
const numero = (v: unknown): number | null => {
  const x = valorCelda(v)
  if (x === null || x === '') return null
  const n = typeof x === 'number' ? x : Number(String(x).replace('%', '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function esTrabajoFin(nombre: string, tipo: string): boolean {
  const t = normalizar(`${tipo} ${nombre}`)
  return /trabajo (de )?fin de (grado|master)|treball de fi de (grau|master)|\btfg\b|\btfm\b/.test(t)
}

/**
 * Interpreta la hoja a partir de una función de acceso a celdas (1-indexada; en celdas
 * combinadas debe devolver el valor de la celda principal).
 */
export function interpretarTasas(celda: Celda, filas: number, columnas: number): TasasTitulacion {
  // 1. Fila de bloques de métricas y fila de cursos
  let filaMetricas = -1
  for (let r = 1; r <= Math.min(filas, 20) && filaMetricas < 0; r++)
    for (let c = 1; c <= columnas; c++)
      if (metricaDe(texto(celda(r, c))) === 'matriculados' && RE_CURSO.test(texto(celda(r + 1, c)))) {
        filaMetricas = r
        break
      }
  if (filaMetricas < 0)
    throw new Error('No se reconoce el formato: no se encuentra la fila «Matriculados / Aprobados / … / Tasa de Éxito» con los cursos debajo.')
  const filaCursos = filaMetricas + 1

  const columnaDe = new Map<string, number>() // `${metrica}|${curso}` -> columna
  const cursos = new Set<string>()
  let metrica: Metrica | null = null
  for (let c = 1; c <= columnas; c++) {
    metrica = metricaDe(texto(celda(filaMetricas, c))) ?? metrica
    const curso = texto(celda(filaCursos, c))
    if (metrica && RE_CURSO.test(curso)) {
      columnaDe.set(`${metrica}|${curso}`, c)
      cursos.add(curso)
    }
  }
  for (const m of ['exito', 'rendimiento'] as const)
    if (![...columnaDe.keys()].some((k) => k.startsWith(m + '|')))
      throw new Error(`No se encuentra el bloque «${m === 'exito' ? 'Tasa de Éxito' : 'Tasa de Rendimiento'}» en el fichero.`)

  // 2. Columnas de identificación (por los rótulos; si no, posición habitual A-E)
  const primeraDatos = Math.min(...columnaDe.values())
  // (se toma la primera aparición: un rótulo combinado sobre varias columnas se repite en todas)
  const encontradas: Record<string, number> = {}
  for (let r = 1; r < filaCursos + 1; r++)
    for (let c = 1; c < primeraDatos; c++) {
      const t = normalizar(texto(celda(r, c)))
      const clave =
        t.startsWith('cuando se imparte') || t === 'semestre' ? 'semestre'
        : t === 'asignatura' ? 'codigo'
        : t === 'curso' ? 'curso'
        : t.startsWith('tipo credito') || t === 'tipo' ? 'tipo'
        : null
      if (clave && !(clave in encontradas)) encontradas[clave] = c
    }
  const colSemestre = encontradas.semestre ?? 1
  const colCodigo = encontradas.codigo ?? 2
  const colCurso = encontradas.curso ?? 4
  const colTipo = encontradas.tipo ?? 5
  let titulacion: string | null = null
  for (let r = 1; r < filaMetricas; r++)
    for (let c = 1; c <= columnas; c++)
      if (normalizar(texto(celda(r, c))).startsWith('plan asig')) {
        for (let k = c + 1; k <= columnas && !titulacion; k++) titulacion = texto(celda(r, k)) || null
      }

  // 3. Asignaturas
  const lista = [...cursos].sort()
  const asignaturas: AsignaturaTasas[] = []
  for (let r = filaCursos + 1; r <= filas; r++) {
    const codigo = texto(celda(r, colCodigo))
    const nombre = texto(celda(r, colCodigo + 1))
    if (!codigo && !nombre) continue
    const tipo = texto(celda(r, colTipo))
    const datos: Record<string, DatosCurso> = {}
    for (const curso of lista) {
      const v = (m: Metrica) => {
        const c = columnaDe.get(`${m}|${curso}`)
        return c === undefined ? null : numero(celda(r, c))
      }
      // tasas como fracción (si vinieran en %, se convierten)
      const tasa = (m: Metrica) => {
        const x = v(m)
        return x === null ? null : x > 1.0001 ? x / 100 : x
      }
      datos[curso] = {
        matriculados: v('matriculados'),
        aprobados: v('aprobados'),
        presentados: v('presentados'),
        exito: tasa('exito'),
        rendimiento: tasa('rendimiento'),
        no_presentados: tasa('no_presentados'),
      }
    }
    asignaturas.push({
      codigo,
      nombre,
      curso: numero(celda(r, colCurso)),
      tipo,
      semestre: semestreDe(texto(celda(r, colSemestre))),
      esTrabajoFin: esTrabajoFin(nombre, tipo),
      datos,
    })
  }
  if (!asignaturas.length) throw new Error('El fichero no contiene asignaturas.')
  return { titulacion, cursos: lista, asignaturas }
}

/**
 * Algunas exportaciones (como la de la UA) llaman a las hojas «xl/worksheets/worksheet1.xml» en vez
 * del habitual «sheet1.xml»; Excel lo admite, pero ExcelJS solo reconoce el segundo. Se renombran
 * las hojas dentro del .xlsx (sin tocar los datos).
 */
export async function normalizarXlsx(datos: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: PizZip } = await import('pizzip')
  const zip = new PizZip(datos)
  const rutaRels = 'xl/_rels/workbook.xml.rels'
  let rels = zip.file(rutaRels)?.asText()
  let tipos = zip.file('[Content_Types].xml')?.asText()
  if (!rels || !tipos) return datos
  const destinos = [...rels.matchAll(/Target="(?:\/?xl\/)?(worksheets\/[^"]+\.xml)"/g)].map((m) => m[1])
  if (destinos.every((d) => /^worksheets\/sheet\d+\.xml$/.test(d))) return datos
  destinos.forEach((origen, i) => {
    const nuevo = `worksheets/sheet${i + 1}.xml`
    if (origen === nuevo) return
    const contenido = zip.file(`xl/${origen}`)?.asUint8Array()
    if (!contenido) return
    zip.remove(`xl/${origen}`)
    zip.file(`xl/${nuevo}`, contenido)
    const relsHoja = origen.replace(/worksheets\/(.*)$/, 'worksheets/_rels/$1.rels')
    const r = zip.file(`xl/${relsHoja}`)?.asUint8Array()
    if (r) {
      zip.remove(`xl/${relsHoja}`)
      zip.file(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, r)
    }
    rels = rels!.split(origen).join(nuevo)
    tipos = tipos!.split(origen).join(nuevo)
  })
  zip.file(rutaRels, rels)
  zip.file('[Content_Types].xml', tipos)
  return zip.generate({ type: 'arraybuffer' })
}

/** Lee el fichero .xlsx (ExcelJS se carga bajo demanda). Usa la primera hoja con el formato reconocido. */
export async function leerTasas(datos: ArrayBuffer): Promise<TasasTitulacion> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await normalizarXlsx(datos))
  let ultimoError: unknown = null
  for (const ws of wb.worksheets) {
    try {
      // En ExcelJS, las celdas combinadas devuelven el valor de la celda principal
      return interpretarTasas((f, c) => ws.getCell(f, c).value, ws.rowCount, ws.columnCount)
    } catch (e) {
      ultimoError = e
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error('El fichero no contiene ninguna hoja legible.')
}

/** ¿El nombre de la titulación del fichero coincide con el de la aplicación? */
export function mismaTitulacion(enFichero: string | null, nombre: string): boolean {
  if (!enFichero) return true // sin nombre en el fichero: no se puede comprobar
  return normalizar(enFichero) === normalizar(nombre)
}
