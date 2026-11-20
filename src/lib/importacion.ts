/**
 * Análisis de un plan de acciones en Excel (formato común de la EPS) para importarlo.
 * Funciones puras: reciben las filas ya extraídas de la hoja (valores de celda) y devuelven,
 * para cada fila, los datos normalizados junto con errores (impiden importarla) y avisos.
 */
import { parsearCodigo } from './cursos'
import { esCodigo, separarIndicadores } from './indicadores'
import type { EstadoAccion } from './tipos'

export interface AccionImportable {
  codigo: string
  anyo: number
  numero: number
  nombre: string
  tareas: string | null
  responsable: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  indicadores: string[]
  origen: string | null
  estado: EstadoAccion
  presupuesto: number | null
  es_mejora: boolean
  observaciones: string | null
  cerrada: boolean
}

export type Resultado = 'nueva' | 'actualizar' | 'omitir' | 'error'

export interface FilaAnalizada {
  /** Número de fila en la hoja Excel (1 = primera fila) */
  fila: number
  codigo: string
  /** Nombre de la acción tal como aparece en el fichero (también en filas con errores) */
  nombre: string | null
  datos: AccionImportable | null
  errores: string[]
  avisos: string[]
  /** true si ya existe una acción con este código en la titulación */
  existente: boolean
}

export interface AnalisisExcel {
  filas: FilaAnalizada[]
  columnasIgnoradas: string[]
  /** Error global (p.ej. no se encuentra la fila de cabecera) */
  error: string | null
}

export interface ContextoImportacion {
  titulacion: string
  /** Todos los códigos de titulación conocidos, para detectar ficheros de otra titulación */
  codigosTitulaciones: string[]
  responsables: string[]
  /** Códigos del catálogo de indicadores (para avisar de códigos desconocidos) */
  indicadores?: string[]
}

type Campo =
  | 'codigo' | 'nombre' | 'tareas' | 'responsable' | 'fecha_inicio' | 'fecha_fin' | 'indicador'
  | 'origen' | 'estado' | 'presupuesto' | 'es_mejora' | 'observaciones' | 'cerrada'

/** Quita tildes, pasa a minúsculas y compacta espacios. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function campoDeCabecera(cabecera: string): Campo | null {
  const h = normalizar(cabecera)
  if (h === 'codigo') return 'codigo'
  if (h === 'accion' || h === 'nombre' || h === 'nombre de la accion') return 'nombre'
  if (h.startsWith('tarea')) return 'tareas'
  if (h.startsWith('responsable')) return 'responsable'
  if (h.startsWith('fecha inicio') || h.startsWith('fecha de inicio')) return 'fecha_inicio'
  if (h.startsWith('fecha fin') || h.startsWith('fecha de fin')) return 'fecha_fin'
  if (h.startsWith('indicador')) return 'indicador'
  if (h.startsWith('origen')) return 'origen'
  if (h === 'estado') return 'estado'
  if (h.startsWith('presupuesto')) return 'presupuesto'
  if (h.includes('accion de mejora')) return 'es_mejora'
  if (h.startsWith('observaciones')) return 'observaciones'
  if (h === 'cerrada') return 'cerrada'
  return null
}

/** Convierte el valor de una celda de ExcelJS (texto enriquecido, fórmulas, enlaces…) a un valor simple. */
export function valorCelda(v: unknown): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('')
    if ('result' in o) return valorCelda(o.result)
    if ('text' in o) return valorCelda(o.text)
    if ('error' in o) return null
  }
  return String(v)
}

function texto(v: unknown): string | null {
  const x = valorCelda(v)
  if (x === null) return null
  const s = (x instanceof Date ? fechaISO(x) : String(x))
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[  ]+\n/g, '\n')
    .trim()
  return s === '' ? null : s
}

function fechaISO(d: Date): string {
  // ExcelJS devuelve las fechas como medianoche UTC
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function fechaValida(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return fechaISO(f)
}

/** Fecha de Excel (Date, número de serie o texto dd/mm/aaaa o aaaa-mm-dd) a 'aaaa-mm-dd'. `undefined` = no válida. */
export function fecha(v: unknown): string | null | undefined {
  const x = valorCelda(v)
  if (x === null || (typeof x === 'string' && x.trim() === '')) return null
  if (x instanceof Date) return isNaN(x.getTime()) ? undefined : fechaISO(x)
  if (typeof x === 'number') {
    if (x < 1 || x > 100000) return undefined
    return fechaISO(new Date(Date.UTC(1899, 11, 30) + Math.round(x) * 86400000))
  }
  const s = String(x).trim()
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) return fechaValida(+m[3], +m[2], +m[1]) ?? undefined
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return fechaValida(+m[1], +m[2], +m[3]) ?? undefined
  return undefined
}

/** `undefined` = valor no reconocido */
export function booleano(v: unknown): boolean | null | undefined {
  const x = valorCelda(v)
  if (x === null) return null
  if (typeof x === 'boolean') return x
  if (typeof x === 'number') return x !== 0
  const s = normalizar(String(x))
  if (s === '') return null
  if (['si', 's', 'x', 'true', 'verdadero', '1', 'yes'].includes(s)) return true
  if (['no', 'n', 'false', 'falso', '0'].includes(s)) return false
  return undefined
}

/** `undefined` = valor no reconocido */
export function importe(v: unknown): number | null | undefined {
  const x = valorCelda(v)
  if (x === null) return null
  if (typeof x === 'number') return x
  let s = normalizar(String(x)).replace(/€|eur(os)?/g, '').replace(/\s/g, '')
  if (['', 'n/a', 'na', '-', '--', 'no', 'ninguno', '0'].includes(s)) return s === '0' ? 0 : null
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.') // 1.500,50
  else if (/^\d+(,\d+)?$/.test(s)) s = s.replace(',', '.') // 1500,50
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '') // 1,500.50
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** `undefined` = valor no reconocido; `null` = vacío */
export function estado(v: unknown): EstadoAccion | null | undefined {
  const s = texto(v)
  if (s === null) return null
  const n = normalizar(s)
  if (n.includes('pend')) return 'pendiente'
  if (n.includes('proces') || n.includes('curso')) return 'en_proceso'
  if (n.includes('complet') || n.includes('finaliz') || n.includes('realiz')) return 'completada'
  if (n.includes('cancel') || n.includes('anul') || n.includes('descart')) return 'cancelada'
  return undefined
}

function vacia(fila: unknown[]): boolean {
  return fila.every((c) => texto(c) === null)
}

export function analizarFilas(filas: unknown[][], ctx: ContextoImportacion): AnalisisExcel {
  // 1. Localizar la fila de cabecera (la que contiene "Código")
  const iCab = filas.slice(0, 15).findIndex((f) => f.some((c) => normalizar(texto(c) ?? '') === 'codigo'))
  if (iCab < 0)
    return { filas: [], columnasIgnoradas: [], error: 'No se encuentra la fila de cabecera (columna «Código»).' }

  const columnas = new Map<Campo, number>()
  const columnasIgnoradas: string[] = []
  filas[iCab].forEach((c, i) => {
    const t = texto(c)
    if (!t) return
    const campo = campoDeCabecera(t)
    if (campo && !columnas.has(campo)) columnas.set(campo, i)
    else columnasIgnoradas.push(t)
  })
  if (!columnas.has('nombre'))
    return { filas: [], columnasIgnoradas, error: 'No se encuentra la columna «Acción».' }

  const celda = (f: unknown[], campo: Campo) => {
    const i = columnas.get(campo)
    return i === undefined ? null : f[i]
  }

  const vistos = new Map<string, number>()
  const resultado: FilaAnalizada[] = []

  filas.slice(iCab + 1).forEach((f, idx) => {
    if (vacia(f)) return
    const numFila = iCab + idx + 2
    const errores: string[] = []
    const avisos: string[] = []

    // Código
    const codigo = (texto(celda(f, 'codigo')) ?? '').toUpperCase().replace(/\s/g, '')
    const partes = parsearCodigo(codigo)
    if (!codigo) errores.push('Falta el código')
    else if (!partes) errores.push(`Código «${codigo}» con formato no válido (AM-<titulación>-<año>-<nn>)`)
    else if (partes.prefijo !== ctx.titulacion) {
      if (ctx.codigosTitulaciones.includes(partes.prefijo))
        errores.push(`El código pertenece a otra titulación (${partes.prefijo})`)
      else avisos.push(`Código antiguo con prefijo «${partes.prefijo}»: se conservará tal cual`)
    }
    if (codigo && vistos.has(codigo)) errores.push(`Código repetido en el fichero (fila ${vistos.get(codigo)})`)
    else if (codigo) vistos.set(codigo, numFila)

    // Nombre
    const nombre = texto(celda(f, 'nombre'))
    if (!nombre) errores.push('Falta el nombre de la acción')

    // Fechas
    const fi = fecha(celda(f, 'fecha_inicio'))
    const ff = fecha(celda(f, 'fecha_fin'))
    if (fi === undefined) errores.push(`Fecha de inicio no válida: «${texto(celda(f, 'fecha_inicio'))}»`)
    if (ff === undefined) errores.push(`Fecha de fin no válida: «${texto(celda(f, 'fecha_fin'))}»`)
    if (fi === null) avisos.push('Sin fecha de inicio')
    if (ff === null) avisos.push('Sin fecha de fin')
    if (fi && ff && ff < fi) errores.push('La fecha de fin es anterior a la de inicio')

    // Estado
    let est = estado(celda(f, 'estado'))
    if (est === undefined) errores.push(`Estado no reconocido: «${texto(celda(f, 'estado'))}»`)
    if (est === null) {
      avisos.push('Sin estado: se importará como Pendiente')
      est = 'pendiente'
    }

    // Responsable
    const responsable = texto(celda(f, 'responsable'))
    if (!responsable) avisos.push('Sin responsable')
    else if (!ctx.responsables.some((r) => normalizar(r) === normalizar(responsable)))
      avisos.push(`Responsable «${responsable}» no está en el catálogo`)

    // Indicadores (una celda puede tener varios códigos separados por comas)
    const indicadores = separarIndicadores(texto(celda(f, 'indicador')))
    if (ctx.indicadores?.length)
      for (const x of indicadores)
        if (esCodigo(x) && !ctx.indicadores.includes(x)) avisos.push(`Indicador «${x}» no está en el catálogo`)

    // Presupuesto y casillas
    const presupuesto = importe(celda(f, 'presupuesto'))
    if (presupuesto === undefined)
      avisos.push(`Presupuesto no numérico «${texto(celda(f, 'presupuesto'))}»: se dejará vacío`)
    const esMejora = booleano(celda(f, 'es_mejora'))
    if (esMejora === undefined) avisos.push('Valor no reconocido en «Es acción de mejora»: se marcará como acción de mejora')
    const cerrada = booleano(celda(f, 'cerrada'))
    if (cerrada === undefined) avisos.push('Valor no reconocido en «Cerrada»: se marcará como no cerrada')

    const datos: AccionImportable | null =
      errores.length === 0 && partes && nombre && est
        ? {
            codigo,
            anyo: partes.anyo,
            numero: partes.numero,
            nombre,
            tareas: texto(celda(f, 'tareas')),
            responsable: responsable
              ? (ctx.responsables.find((r) => normalizar(r) === normalizar(responsable)) ?? responsable)
              : null,
            fecha_inicio: fi ?? null,
            fecha_fin: ff ?? null,
            indicadores,
            origen: texto(celda(f, 'origen')),
            estado: est,
            presupuesto: presupuesto ?? null,
            es_mejora: esMejora ?? true,
            observaciones: texto(celda(f, 'observaciones')),
            cerrada: cerrada ?? false,
          }
        : null

    resultado.push({ fila: numFila, codigo, nombre, datos, errores, avisos, existente: false })
  })

  return { filas: resultado, columnasIgnoradas, error: null }
}

export interface AccionExistente {
  codigo: string
  anyo: number
  numero: number
}

/**
 * Cruza el análisis con las acciones que ya existen en la titulación: marca las existentes
 * (mismo código) y da error si el año y número coinciden con otra acción de distinto código.
 */
export function cruzarConExistentes(filas: FilaAnalizada[], existentes: AccionExistente[]): FilaAnalizada[] {
  const porCodigo = new Set(existentes.map((e) => e.codigo))
  const porNumero = new Map(existentes.map((e) => [`${e.anyo}-${e.numero}`, e.codigo]))
  return filas.map((f) => {
    if (!f.datos) return f
    if (porCodigo.has(f.codigo)) return { ...f, existente: true }
    const otro = porNumero.get(`${f.datos.anyo}-${f.datos.numero}`)
    if (otro)
      return {
        ...f,
        datos: null,
        errores: [...f.errores, `Ya existe la acción ${otro} con el mismo año y número`],
      }
    return f
  })
}

export function resultadoFila(f: FilaAnalizada, actualizar: boolean): Resultado {
  if (!f.datos || f.errores.length) return 'error'
  if (f.existente) return actualizar ? 'actualizar' : 'omitir'
  return 'nueva'
}

/** Lee la primera hoja con cabecera «Código» de un fichero .xlsx (ExcelJS se carga bajo demanda). */
export async function leerExcel(datos: ArrayBuffer): Promise<unknown[][]> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(datos)
  const hojas = wb.worksheets
  const extraer = (ws: (typeof hojas)[number]) => {
    const filas: unknown[][] = []
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const valores = row.values as unknown[] // índice 0 vacío (columnas desde 1)
      filas[n - 1] = valores.slice(1)
    })
    return Array.from(filas, (f) => f ?? [])
  }
  for (const ws of hojas) {
    const filas = extraer(ws)
    if (filas.slice(0, 15).some((f) => f.some((c) => normalizar(String(valorCelda(c) ?? '')) === 'codigo')))
      return filas
  }
  return hojas.length ? extraer(hojas[0]) : []
}
