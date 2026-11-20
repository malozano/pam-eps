/**
 * Exportación de un plan de acciones a Excel con el formato común de la EPS
 * (hoja «Acciones» + hoja «Datos» con las listas de los desplegables).
 * El fichero generado se puede volver a importar.
 */
import { etiquetaCurso } from './cursos'
import { unirIndicadores } from './indicadores'
import type { EstadoAccion } from './tipos'

export const ESTADOS_EXCEL: Record<EstadoAccion, string> = {
  pendiente: '1-Pendiente',
  en_proceso: '2-En proceso',
  completada: '3-Completada',
  cancelada: '4-Cancelada',
}

export interface AccionExportable {
  codigo: string
  nombre: string
  tareas: string | null
  responsable: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  indicadores: string[]
  origen: string | null
  estado: EstadoAccion
  presupuesto: number | null
  es_mejora?: boolean
  observaciones: string | null
  cerrada?: boolean
}

export interface OpcionesExportacion {
  titulacion: string
  nombreTitulacion: string
  anyo: number | null // null = todas las acciones
  responsables: string[]
  /** Versión pública: sin las columnas internas («Es acción de mejora», «Cerrada») */
  publico?: boolean
}

interface Columna {
  titulo: string
  ancho: number
  valor: (a: AccionExportable) => string | number | boolean | Date | null
  fecha?: boolean
  importe?: boolean
  interna?: boolean
}

function aFecha(iso: string | null): Date | null {
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

const COLUMNAS: Columna[] = [
  { titulo: 'Código', ancho: 20, valor: (a) => a.codigo },
  { titulo: 'Acción', ancho: 45, valor: (a) => a.nombre },
  { titulo: 'Tareas', ancho: 60, valor: (a) => a.tareas },
  { titulo: 'Responsable / Ámbito', ancho: 26, valor: (a) => a.responsable },
  { titulo: 'Fecha inicio', ancho: 13, valor: (a) => aFecha(a.fecha_inicio), fecha: true },
  { titulo: 'Fecha fin', ancho: 13, valor: (a) => aFecha(a.fecha_fin), fecha: true },
  { titulo: 'Indicador', ancho: 18, valor: (a) => unirIndicadores(a.indicadores) || null },
  { titulo: 'Origen', ancho: 36, valor: (a) => a.origen },
  { titulo: 'Estado', ancho: 15, valor: (a) => ESTADOS_EXCEL[a.estado] },
  { titulo: 'Presupuesto', ancho: 13, valor: (a) => a.presupuesto ?? 'n/a', importe: true },
  { titulo: 'Es acción de mejora', ancho: 12, valor: (a) => a.es_mejora ?? true, interna: true },
  { titulo: 'Observaciones', ancho: 60, valor: (a) => a.observaciones },
  { titulo: 'Cerrada', ancho: 10, valor: (a) => a.cerrada ?? false, interna: true },
]

export function nombreFichero(titulacion: string, anyo: number | null, publico = false): string {
  return `AM-${titulacion}-${anyo === null ? 'todas' : etiquetaCurso(anyo)}${publico ? '-publico' : ''}.xlsx`
}

export async function generarExcel(acciones: AccionExportable[], op: OpcionesExportacion): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Planes de acciones de mejora · EPS'
  wb.created = new Date()
  const columnas = COLUMNAS.filter((c) => !(op.publico && c.interna))

  const ws = wb.addWorksheet('Acciones', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho }))
  const cab = ws.getRow(1)
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cab.alignment = { vertical: 'middle', wrapText: true }
  cab.height = 30
  cab.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
  })

  for (const a of acciones) {
    const fila = ws.addRow(columnas.map((c) => c.valor(a)))
    fila.alignment = { vertical: 'top', wrapText: true }
    columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1)
      if (c.fecha) celda.numFmt = 'dd/mm/yyyy'
      if (c.importe && typeof celda.value === 'number') celda.numFmt = '#,##0.00 €'
    })
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }

  // Hoja de datos con las listas de los desplegables (como en la plantilla original)
  const datos = wb.addWorksheet('Datos')
  datos.columns = [
    { header: 'Estados', width: 16 },
    { header: 'Responsables', width: 40 },
  ]
  datos.getRow(1).font = { bold: true }
  const estados = Object.values(ESTADOS_EXCEL)
  const filasDatos = Math.max(estados.length, op.responsables.length)
  for (let i = 0; i < filasDatos; i++) datos.addRow([estados[i] ?? null, op.responsables[i] ?? null])

  // Desplegables en las filas existentes y en 200 filas libres para añadir acciones
  const ultima = Math.max(acciones.length + 1, 2) + 200
  const col = (titulo: string) => columnas.findIndex((c) => c.titulo === titulo) + 1
  const lista = (columna: number, rango: string) => {
    for (let r = 2; r <= ultima; r++)
      ws.getCell(r, columna).dataValidation = { type: 'list', allowBlank: true, formulae: [rango] }
  }
  lista(col('Estado'), `Datos!$A$2:$A$${estados.length + 1}`)
  if (op.responsables.length) lista(col('Responsable / Ámbito'), `Datos!$B$2:$B$${op.responsables.length + 1}`)
  for (const titulo of ['Fecha inicio', 'Fecha fin']) {
    const c = col(titulo)
    for (let r = 2; r <= ultima; r++) {
      ws.getCell(r, c).dataValidation = {
        type: 'date',
        operator: 'greaterThan',
        allowBlank: true,
        formulae: [new Date(Date.UTC(2000, 0, 1))],
        showErrorMessage: true,
        error: 'Introduce una fecha (dd/mm/aaaa)',
      }
      ws.getCell(r, c).numFmt = 'dd/mm/yyyy'
    }
  }
  for (const titulo of op.publico ? [] : ['Es acción de mejora', 'Cerrada']) {
    const c = col(titulo)
    for (let r = 2; r <= ultima; r++)
      ws.getCell(r, c).dataValidation = { type: 'list', allowBlank: true, formulae: ['"TRUE,FALSE"'] }
  }

  wb.title = `Plan de acciones de mejora ${op.titulacion}${op.anyo ? ' ' + etiquetaCurso(op.anyo) : ''}`
  wb.subject = op.nombreTitulacion
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

/** Descarga un ArrayBuffer como fichero en el navegador. */
export function descargar(datos: ArrayBuffer, nombre: string) {
  const blob = new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
