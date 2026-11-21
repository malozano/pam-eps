import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { esTrabajoFin, leerTasas, mismaTitulacion, semestreDe } from './tasas'

const CURSOS = ['2022-23', '2023-24', '2024-25', '2025-26']
const BLOQUES = ['Matriculados', 'Aprobados', 'Presentados', 'Tása de Éxito', 'Tasa de Rendimiento', 'Tasa No presentados']

/** Excel sintético con la estructura de la exportación de la UA (celdas combinadas, huecos…). */
async function excelSintetico(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Tasas de Éxito, Rendimiento y N')
  ws.getCell('A1').value = 'Tasas de Éxito, Rendimiento y No presentados por Asignatura'
  ws.getCell('A3').value = 'Cuando se imparte?'
  ws.getCell('B3').value = 'Asignatura'
  ws.getCell('D3').value = 'Curso'
  ws.getCell('E3').value = 'Centro'
  ws.getCell('F3').value = 'Escuela Politécnica Superior'
  ws.getCell('E6').value = 'Plan Asig.'
  ws.getCell('F6').value = 'GRADO EN INGENIERÍA CIVIL'
  ws.getCell('E8').value = 'Tipo Crédito'
  ws.mergeCells('A3:A8')
  ws.mergeCells('B3:C3') // como en la exportación real: «Asignatura» abarca código y nombre
  ws.mergeCells('D3:D8')
  BLOQUES.forEach((b, i) => {
    const c0 = 6 + i * CURSOS.length
    ws.getCell(7, c0).value = b
    ws.mergeCells(7, c0, 7, c0 + CURSOS.length - 1)
    CURSOS.forEach((cu, j) => (ws.getCell(8, c0 + j).value = cu))
  })
  // [semestre del grupo, código, nombre, curso, tipo, matriculados por curso, éxito por curso, rendimiento por curso]
  const filas: [string | null, number, string, number, string, (number | null)[], (number | null)[], (number | null)[]][] = [
    ['Ambos semestres', 34541, 'ANGLÈS I', 3, 'OPTATIVA', [10, 8, 9, 7], [1, 1, 1, 0.9], [0.8, 1, 1, 0.857]],
    ['primer semestre', 33510, "CÀLCUL D'ESTRUCTURES I", 2, 'OBLIGATORIA', [40, 39, 65, 64], [0.6, 0.55, 0.57, 0.5], [0.4, 0.4, 0.41, 0.38]],
    [null, 33555, 'GEOTÈCNIA APLICADA', 4, 'OPTATIVA', [null, 2, null, null], [null, 1, null, null], [null, 1, null, null]],
    ['segundo semestre', 33506, "MECÀNICA APLICADA A L'ENGINYERIA CIVIL", 1, 'BÁSICA', [150, 140, 152, 148], [0.6, 0.6, 0.4, 0.42], [0.3, 0.3, 0.2, 0.25]],
    ['', 33569, 'TREBALL DE FI DE GRAU', 4, 'TRABAJO FIN DE GRADO', [40, 43, 49, 55], [1, 0.94, 1, 1], [0.5, 0.4, 0.4, 0.6]],
  ]
  let r = 9
  for (const [sem, cod, nom, cur, tipo, matr, ex, ren] of filas) {
    ws.getCell(r, 1).value = sem
    ws.getCell(r, 2).value = cod
    ws.getCell(r, 3).value = nom
    ws.getCell(r, 4).value = cur
    ws.getCell(r, 5).value = tipo
    CURSOS.forEach((_, j) => {
      ws.getCell(r, 6 + j).value = matr[j]
      ws.getCell(r, 6 + 3 * CURSOS.length + j).value = ex[j]
      ws.getCell(r, 6 + 4 * CURSOS.length + j).value = ren[j]
    })
    r++
  }
  ws.mergeCells('A10:A11') // grupo «primer semestre» de dos filas: la segunda no tiene valor propio
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

describe('lectura del Excel de tasas', () => {
  it('interpreta titulación, cursos, semestres, tipos y datos', async () => {
    const t = await leerTasas(await excelSintetico())
    expect(t.titulacion).toBe('GRADO EN INGENIERÍA CIVIL')
    expect(t.cursos).toEqual(CURSOS)
    expect(t.asignaturas.map((a) => [a.codigo, a.semestre, a.curso, a.esTrabajoFin])).toEqual([
      ['34541', 'ambos', 3, false],
      ['33510', 'primero', 2, false],
      ['33555', 'primero', 4, false], // celda combinada con la anterior
      ['33506', 'segundo', 1, false],
      ['33569', 'sin', 4, true],
    ])
    const m = t.asignaturas.find((a) => a.codigo === '33506')!
    expect(m.nombre).toBe("MECÀNICA APLICADA A L'ENGINYERIA CIVIL")
    expect(m.datos['2025-26']).toMatchObject({ matriculados: 148, exito: 0.42, rendimiento: 0.25 })
    expect(t.asignaturas.find((a) => a.codigo === '33555')!.datos['2025-26']).toMatchObject({ matriculados: null, exito: null })
  })

  it('formato no reconocido', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('x').addRow(['Código', 'Acción'])
    await expect(leerTasas((await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(/No se reconoce el formato/)
  })

  it('utilidades', () => {
    expect(semestreDe('Ambos semestres')).toBe('ambos')
    expect(semestreDe('primer semestre')).toBe('primero')
    expect(semestreDe('Segundo semestre')).toBe('segundo')
    expect(semestreDe('')).toBe('sin')
    expect(esTrabajoFin('TREBALL DE FI DE GRAU', 'TRABAJO FIN DE GRADO')).toBe(true)
    expect(esTrabajoFin('TRABAJO FIN DE MÁSTER', 'OBLIGATORIA')).toBe(true)
    expect(esTrabajoFin('PRÀCTIQUES ACADÈMIQUES EXTERNES I', 'OPTATIVA')).toBe(false)
    expect(mismaTitulacion('GRADO EN INGENIERÍA CIVIL', 'Grado en Ingeniería Civil')).toBe(true)
    expect(mismaTitulacion('GRADO EN INGENIERÍA CIVIL', 'Grado en Ingeniería Informática')).toBe(false)
  })
})
