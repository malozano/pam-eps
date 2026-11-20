/**
 * Mantenimiento del catálogo de indicadores mediante Excel: exportación del catálogo actual
 * y análisis de un fichero actualizado (nuevos, modificados, sin cambios y ausentes).
 */
import { normalizar, valorCelda } from './importacion'
import type { IndicadorCatalogo, Procedimiento } from './indicadores'

export const CABECERA_CATALOGO = [
  'Procedimiento (grupo)',
  'Código',
  'Indicador',
  'Definición / forma de cálculo',
  'Otros procedimientos',
]

type Campo = 'procedimiento' | 'codigo' | 'nombre' | 'definicion' | 'otros'

function campo(cab: string): Campo | null {
  const h = normalizar(cab)
  if (h === 'codigo') return 'codigo'
  if (h.startsWith('grupo') || h.startsWith('procedimiento (grupo)') || h === 'procedimiento') return 'procedimiento'
  if (h.startsWith('indicador')) return 'nombre'
  if (h.startsWith('definicion')) return 'definicion'
  if (h.startsWith('otros procedimientos') || h.startsWith('procedimientos donde')) return 'otros'
  return null
}

const texto = (v: unknown): string => {
  const x = valorCelda(v)
  return x === null ? '' : String(x).replace(/\s+/g, ' ').trim()
}

export interface FilaCatalogo {
  fila: number
  codigo: string
  datos: { codigo: string; nombre: string; definicion: string | null; procedimiento: string; procedimientos: string[] } | null
  tipo: 'nuevo' | 'modificado' | 'igual' | 'error'
  cambios: string[]
  errores: string[]
}

export interface AnalisisCatalogo {
  error: string | null
  filas: FilaCatalogo[]
  /** Procedimientos que aparecen en el fichero con nombre (los nuevos se crearán) */
  procedimientos: { codigo: string; nombre: string; nuevo: boolean }[]
  /** Indicadores activos del catálogo que no están en el fichero */
  ausentes: IndicadorCatalogo[]
}

export function analizarCatalogo(
  filas: unknown[][],
  actual: { indicadores: IndicadorCatalogo[]; procedimientos: Procedimiento[] },
): AnalisisCatalogo {
  const vacio = { filas: [], procedimientos: [], ausentes: [] }
  const iCab = filas.slice(0, 10).findIndex((f) => f.some((c) => normalizar(texto(c)) === 'codigo'))
  if (iCab < 0) return { ...vacio, error: 'No se encuentra la fila de cabecera (columna «Código»).' }
  const cols = new Map<Campo, number>()
  filas[iCab].forEach((c, i) => {
    const k = campo(texto(c))
    if (k && !cols.has(k)) cols.set(k, i)
  })
  for (const [k, nombre] of [['nombre', 'Indicador'], ['procedimiento', 'Procedimiento']] as const)
    if (!cols.has(k)) return { ...vacio, error: `No se encuentra la columna «${nombre}».` }
  const celda = (f: unknown[], k: Campo) => (cols.has(k) ? texto(f[cols.get(k)!]) : '')

  const procExistentes = new Map(actual.procedimientos.map((p) => [p.codigo, p.nombre]))
  const procFichero = new Map<string, string>()
  const porCodigo = new Map(actual.indicadores.map((i) => [i.codigo, i]))
  const vistos = new Map<string, number>()
  const resultado: FilaCatalogo[] = []
  const RE_PROC = /^(P[ACE]\d{2})\s*(?:[·.\-:]\s*(.*))?$/i

  // Primera pasada: nombres de procedimientos («PC09 · Nombre») en cualquier fila
  for (const f of filas.slice(iCab + 1)) {
    const m = RE_PROC.exec(celda(f, 'procedimiento'))
    if (m?.[2]?.trim()) procFichero.set(m[1].toUpperCase(), m[2].trim())
  }

  filas.slice(iCab + 1).forEach((f, idx) => {
    if (f.every((c) => texto(c) === '')) return
    const fila = iCab + idx + 2
    const errores: string[] = []
    const codigo = celda(f, 'codigo').toUpperCase().replace(/\s/g, '')
    const nombre = celda(f, 'nombre')
    const definicion = celda(f, 'definicion') || null

    if (!codigo) errores.push('Falta el código (los indicadores sin código no se incluyen en el catálogo)')
    else if (!/^[A-Z0-9]+$/.test(codigo)) errores.push(`Código «${codigo}» no válido: solo letras y números (un indicador por fila)`)
    if (codigo && vistos.has(codigo)) errores.push(`Código repetido (fila ${vistos.get(codigo)})`)
    else if (codigo) vistos.set(codigo, fila)
    if (!nombre) errores.push('Falta el nombre del indicador')

    // «PC01 · Desarrollo y seguimiento…» o solo «PC01»
    const m = RE_PROC.exec(celda(f, 'procedimiento'))
    let procedimiento = ''
    if (!m) errores.push(`Procedimiento «${celda(f, 'procedimiento')}» no válido (p. ej. «PC01 · Desarrollo…»)`)
    else {
      procedimiento = m[1].toUpperCase()
      if (!procExistentes.has(procedimiento) && !procFichero.has(procedimiento))
        errores.push(`El procedimiento ${procedimiento} es nuevo: indica también su nombre («${procedimiento} · Nombre»)`)
    }
    const otros = (celda(f, 'otros').toUpperCase().match(/P[ACE]\d{2}/g) ?? []).filter((p) => p !== procedimiento)
    for (const p of otros)
      if (!procExistentes.has(p) && !procFichero.has(p))
        errores.push(`Procedimiento ${p} desconocido en «Otros procedimientos»`)
    const procedimientos = procedimiento ? Array.from(new Set([procedimiento, ...otros])).sort() : []

    if (errores.length) {
      resultado.push({ fila, codigo, datos: null, tipo: 'error', cambios: [], errores })
      return
    }
    const datos = { codigo, nombre, definicion, procedimiento, procedimientos }
    const ant = porCodigo.get(codigo)
    const cambios: string[] = []
    if (ant) {
      if (ant.nombre !== nombre) cambios.push(`Nombre: «${ant.nombre}» → «${nombre}»`)
      if ((ant.definicion ?? null) !== definicion) cambios.push('Definición modificada')
      if (ant.procedimiento !== procedimiento) cambios.push(`Grupo: ${ant.procedimiento} → ${procedimiento}`)
      if ([...ant.procedimientos].sort().join() !== procedimientos.join())
        cambios.push(`Procedimientos: ${[...ant.procedimientos].sort().join(', ')} → ${procedimientos.join(', ')}`)
      if (!ant.activo) cambios.push('Se reactiva (estaba inactivo)')
    }
    resultado.push({ fila, codigo, datos, tipo: !ant ? 'nuevo' : cambios.length ? 'modificado' : 'igual', cambios, errores })
  })

  const enFichero = new Set(resultado.map((f) => f.codigo))
  return {
    error: resultado.length ? null : 'El fichero no contiene indicadores.',
    filas: resultado,
    procedimientos: Array.from(procFichero, ([codigo, nombre]) => ({ codigo, nombre, nuevo: !procExistentes.has(codigo) })),
    ausentes: actual.indicadores.filter((i) => i.activo && !enFichero.has(i.codigo)),
  }
}

/** Excel con el catálogo actual (indicadores activos), listo para editar y volver a subir. */
export async function generarExcelCatalogo(indicadores: IndicadorCatalogo[], procedimientos: Procedimiento[]) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const nombreProc = new Map(procedimientos.map((p) => [p.codigo, p.nombre]))
  const ordenProc = new Map(procedimientos.map((p) => [p.codigo, p.orden]))
  const ws = wb.addWorksheet('Indicadores', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [44, 12, 50, 80, 20].map((width, i) => ({ header: CABECERA_CATALOGO[i], width }))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
  })
  const activos = indicadores
    .filter((i) => i.activo)
    .sort((a, b) => (ordenProc.get(a.procedimiento) ?? 0) - (ordenProc.get(b.procedimiento) ?? 0) || a.orden - b.orden)
  for (const i of activos) {
    const r = ws.addRow([
      `${i.procedimiento} · ${nombreProc.get(i.procedimiento) ?? ''}`,
      i.codigo,
      i.nombre,
      i.definicion,
      i.procedimientos.filter((p) => p !== i.procedimiento).join(', '),
    ])
    r.alignment = { vertical: 'top', wrapText: true }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CABECERA_CATALOGO.length } }
  const wp = wb.addWorksheet('Procedimientos')
  wp.columns = [
    { header: 'Código', width: 12 },
    { header: 'Nombre', width: 80 },
  ]
  wp.getRow(1).font = { bold: true }
  for (const p of procedimientos) wp.addRow([p.codigo, p.nombre])
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
