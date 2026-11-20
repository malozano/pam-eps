import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { generarExcel, nombreFichero, type AccionExportable } from './exportacion'
import { analizarFilas, leerExcel } from './importacion'

const responsables = ['Coordinación titulación', 'Coordinación TFG/M']
const acciones: AccionExportable[] = [
  {
    codigo: 'AM-D110-2026-01', nombre: 'Mejorar la difusión', tareas: '(1) Emails\n(2) Carteles',
    responsable: 'Coordinación titulación', fecha_inicio: '2026-09-01', fecha_fin: '2027-03-31',
    indicadores: ['ISV2', 'VER02'], origen: 'CEN19', estado: 'en_proceso', presupuesto: 1500.5, es_mejora: true,
    observaciones: 'Emails enviados', cerrada: false,
  },
  {
    codigo: 'AM-MUDSDM-2023-01', nombre: 'Antigua', tareas: null, responsable: 'Coordinación TFG/M',
    fecha_inicio: '2023-09-01', fecha_fin: '2023-10-31', indicadores: ['Si / No'], origen: null, estado: 'completada',
    presupuesto: null, es_mejora: false, observaciones: null, cerrada: true,
  },
]

describe('exportación a Excel', () => {
  it('nombre del fichero', () => {
    expect(nombreFichero('D110', 2026)).toBe('AM-D110-2026-27.xlsx')
    expect(nombreFichero('CEN', null)).toBe('AM-CEN-todas.xlsx')
    expect(nombreFichero('C203', 2026, true)).toBe('AM-C203-2026-27-publico.xlsx')
  })

  it('genera el formato común (columnas, estados, fechas, desplegables)', async () => {
    const buf = await generarExcel(acciones, { titulacion: 'D110', nombreTitulacion: 'MUDSDM', anyo: 2026, responsables })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Acciones', 'Datos'])
    const ws = wb.getWorksheet('Acciones')!
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Código', 'Acción', 'Tareas', 'Responsable / Ámbito', 'Fecha inicio', 'Fecha fin', 'Indicador', 'Origen',
      'Estado', 'Presupuesto', 'Es acción de mejora', 'Observaciones', 'Cerrada',
    ])
    expect(ws.getCell('I2').value).toBe('2-En proceso')
    expect(ws.getCell('G2').value).toBe('ISV2, VER02')
    expect(ws.getCell('E2').value).toEqual(new Date(Date.UTC(2026, 8, 1)))
    expect(ws.getCell('E2').numFmt).toBe('dd/mm/yyyy')
    expect(ws.getCell('J3').value).toBe('n/a')
    expect(ws.getCell('I2').dataValidation).toMatchObject({ type: 'list', formulae: ['Datos!$A$2:$A$5'] })
    expect(ws.getCell('D50').dataValidation).toMatchObject({ type: 'list', formulae: ['Datos!$B$2:$B$3'] })
    expect(wb.getWorksheet('Datos')!.getCell('A5').value).toBe('4-Cancelada')
  })

  it('la versión pública no incluye columnas internas', async () => {
    const buf = await generarExcel(acciones, {
      titulacion: 'D110', nombreTitulacion: 'MUDSDM', anyo: 2026, responsables, publico: true,
    })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const cab = (wb.getWorksheet('Acciones')!.getRow(1).values as unknown[]).slice(1)
    expect(cab).not.toContain('Cerrada')
    expect(cab).not.toContain('Es acción de mejora')
  })

  it('ida y vuelta: lo exportado se vuelve a importar igual', async () => {
    const buf = await generarExcel(acciones, { titulacion: 'D110', nombreTitulacion: 'MUDSDM', anyo: 2026, responsables })
    const r = analizarFilas(await leerExcel(buf), {
      titulacion: 'D110', codigosTitulaciones: ['D110', 'CEN'], responsables,
    })
    expect(r.error).toBeNull()
    expect(r.columnasIgnoradas).toEqual([])
    expect(r.filas.map((f) => f.errores)).toEqual([[], []])
    expect(r.filas.map((f) => f.datos)).toEqual(
      acciones.map((a) => ({
        codigo: a.codigo, anyo: Number(a.codigo.split('-')[2]), numero: Number(a.codigo.split('-')[3]),
        nombre: a.nombre, tareas: a.tareas, responsable: a.responsable, fecha_inicio: a.fecha_inicio,
        fecha_fin: a.fecha_fin, indicadores: a.indicadores, origen: a.origen, estado: a.estado,
        presupuesto: a.presupuesto, es_mejora: a.es_mejora, observaciones: a.observaciones, cerrada: a.cerrada,
      })),
    )
  })
})
