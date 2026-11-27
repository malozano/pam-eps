import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  analizarFilas, booleano, cruzarConExistentes, estado, fecha, importe, leerExcel, ordenEnvio, resultadoFila, valorCelda,
} from './importacion'

const ctx = {
  titulacion: 'D110',
  codigosTitulaciones: ['CEN', 'D110', 'C203'],
  responsables: ['Coordinación titulación', 'Coordinación TFG/M'],
}

const CABECERA = [
  'Código', 'Acción', 'Tareas', 'Responsable / Ámbito', 'Fecha inicio', 'Fecha fin', 'Indicador', 'Origen',
  'Estado', 'Reto / Objetivo', 'Presupuesto', 'Es acción de mejora', 'Observaciones', 'Cerrada',
]

describe('conversión de valores', () => {
  it('celdas de ExcelJS', () => {
    expect(valorCelda({ richText: [{ text: 'Hola ' }, { text: 'mundo' }] })).toBe('Hola mundo')
    expect(valorCelda({ formula: 'A1', result: 5 })).toBe(5)
    expect(valorCelda({ text: 'enlace', hyperlink: 'https://x' })).toBe('enlace')
    expect(valorCelda({ error: '#N/A' })).toBeNull()
  })
  it('fechas', () => {
    expect(fecha(new Date(Date.UTC(2025, 6, 1)))).toBe('2025-07-01')
    expect(fecha('31/12/2025')).toBe('2025-12-31')
    expect(fecha('2025-09-01')).toBe('2025-09-01')
    expect(fecha(45839)).toBe('2025-07-01') // número de serie de Excel
    expect(fecha('')).toBeNull()
    expect(fecha('31/02/2025')).toBeUndefined()
    expect(fecha('mañana')).toBeUndefined()
  })
  it('booleanos', () => {
    expect(booleano(true)).toBe(true)
    expect(booleano('Sí')).toBe(true)
    expect(booleano('NO')).toBe(false)
    expect(booleano(null)).toBeNull()
    expect(booleano('quizá')).toBeUndefined()
  })
  it('importes', () => {
    expect(importe('n/a')).toBeNull()
    expect(importe('N/A')).toBeNull()
    expect(importe(1200)).toBe(1200)
    expect(importe('1.500,50 €')).toBe(1500.5)
    expect(importe('300 euros')).toBe(300)
    expect(importe('0')).toBe(0)
    expect(importe('mucho')).toBeUndefined()
  })
  it('estados', () => {
    expect(estado('1-Pendiente')).toBe('pendiente')
    expect(estado('2-En proceso')).toBe('en_proceso')
    expect(estado('3-Completada')).toBe('completada')
    expect(estado('4-Cancelada')).toBe('cancelada')
    expect(estado('')).toBeNull()
    expect(estado('rara')).toBeUndefined()
  })
})

describe('analizarFilas', () => {
  const fila = (o: Partial<Record<string, unknown>>) =>
    CABECERA.map((h) => (h in o ? o[h] : null))
  const base = {
    'Código': 'AM-D110-2025-01',
    'Acción': 'Estudiar la cuenta de Apple Developer',
    'Tareas': ' -\tConsulta al servicio.\n-\tPlan de organización. ',
    'Responsable / Ámbito': 'Coordinación titulación',
    'Fecha inicio': new Date(Date.UTC(2025, 6, 1)),
    'Fecha fin': new Date(Date.UTC(2025, 6, 31)),
    'Indicador': 'Si / No',
    'Origen': 'Informe CEN19',
    'Estado': '1-Pendiente',
    'Reto / Objetivo': 'Reto 1',
    'Presupuesto': 'n/a',
    'Es acción de mejora': true,
    'Cerrada': false,
  }

  it('fila válida con el formato actual', () => {
    const r = analizarFilas([CABECERA, fila(base)], ctx)
    expect(r.error).toBeNull()
    expect(r.columnasIgnoradas).toEqual(['Reto / Objetivo'])
    expect(r.filas).toHaveLength(1)
    const f = r.filas[0]
    expect(f.fila).toBe(2)
    expect(f.errores).toEqual([])
    expect(f.avisos).toEqual([])
    expect(f.datos).toEqual({
      codigo: 'AM-D110-2025-01', anyo: 2025, numero: 1,
      nombre: 'Estudiar la cuenta de Apple Developer',
      tareas: '- Consulta al servicio.\n- Plan de organización.',
      responsable: 'Coordinación titulación',
      fecha_inicio: '2025-07-01', fecha_fin: '2025-07-31',
      indicadores: ['Si / No'], origen: 'Informe CEN19', estado: 'pendiente',
      presupuesto: null, es_mejora: true, observaciones: null, cerrada: false,
    })
  })

  it('cabecera desplazada y filas vacías', () => {
    const r = analizarFilas([['Plan de mejora D110'], [], CABECERA, fila(base), [null, ''], []], ctx)
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0].fila).toBe(4)
  })

  it('sin cabecera', () => {
    expect(analizarFilas([['a', 'b']], ctx).error).toMatch(/cabecera/)
  })

  it('código antiguo con siglas: aviso, se conserva', () => {
    const r = analizarFilas([CABECERA, fila({ ...base, 'Código': 'AM-MUDSDM-2023-01' })], ctx)
    expect(r.filas[0].errores).toEqual([])
    expect(r.filas[0].avisos[0]).toMatch(/MUDSDM/)
    expect(r.filas[0].datos).toMatchObject({ codigo: 'AM-MUDSDM-2023-01', anyo: 2023, numero: 1 })
  })

  it('errores: otra titulación, formato, duplicado, sin nombre, fechas, estado', () => {
    const r = analizarFilas(
      [
        CABECERA,
        fila({ ...base, 'Código': 'AM-C203-2025-01' }),
        fila({ ...base, 'Código': 'AM-D110-25-1' }),
        fila(base),
        fila(base),
        fila({ ...base, 'Código': 'AM-D110-2025-02', 'Acción': '  ' }),
        fila({ ...base, 'Código': 'AM-D110-2025-03', 'Fecha fin': new Date(Date.UTC(2025, 0, 1)) }),
        fila({ ...base, 'Código': 'AM-D110-2025-04', 'Estado': 'Quién sabe' }),
      ],
      ctx,
    )
    const e = r.filas.map((f) => f.errores.join(' | '))
    expect(e[0]).toMatch(/otra titulación/)
    expect(e[1]).toMatch(/formato no válido/)
    expect(e[2]).toBe('')
    expect(e[3]).toMatch(/repetido en el fichero \(fila 4\)/)
    expect(e[4]).toMatch(/Falta el nombre/)
    expect(e[5]).toMatch(/anterior a la de inicio/)
    expect(e[6]).toMatch(/Estado no reconocido/)
    expect(r.filas.filter((f) => f.datos).length).toBe(1)
    expect(r.filas[0].nombre).toBe(base['Acción']) // el nombre se conserva aunque haya errores
  })

  it('avisos: sin estado, responsable fuera de catálogo, presupuesto raro', () => {
    const r = analizarFilas(
      [CABECERA, fila({ ...base, 'Estado': null, 'Responsable / Ámbito': 'Decanato', 'Presupuesto': 'algo' })],
      ctx,
    )
    const f = r.filas[0]
    expect(f.errores).toEqual([])
    expect(f.avisos.join(' ')).toMatch(/Pendiente.*Decanato.*Presupuesto/s)
    expect(f.datos?.estado).toBe('pendiente')
    expect(f.datos?.presupuesto).toBeNull()
  })

  it('varios indicadores en una celda y aviso de códigos fuera de catálogo', () => {
    const r = analizarFilas([CABECERA, fila({ ...base, 'Indicador': 'ISV2, VER02, XYZ99' })], {
      ...ctx, indicadores: ['ISV2', 'VER02'],
    })
    expect(r.filas[0].datos?.indicadores).toEqual(['ISV2', 'VER02', 'XYZ99'])
    expect(r.filas[0].avisos).toEqual(['Indicador «XYZ99» no está en el catálogo'])
  })

  it('normaliza el responsable al nombre del catálogo', () => {
    const r = analizarFilas([CABECERA, fila({ ...base, 'Responsable / Ámbito': 'coordinacion titulacion' })], ctx)
    expect(r.filas[0].datos?.responsable).toBe('Coordinación titulación')
  })
})

describe('cruce con acciones existentes', () => {
  const r = analizarFilas(
    [
      CABECERA,
      ['AM-D110-2025-01', 'Existe'],
      ['AM-D110-2025-02', 'Nueva'],
      ['AM-MUDSDM-2023-01', 'Choca con AM-D110-2023-01'],
    ],
    ctx,
  )
  const filas = cruzarConExistentes(r.filas, [
    { codigo: 'AM-D110-2025-01', anyo: 2025, numero: 1 },
    { codigo: 'AM-D110-2023-01', anyo: 2023, numero: 1 },
  ])
  it('clasifica nuevas, existentes y conflictos', () => {
    expect(filas.map((f) => resultadoFila(f, false))).toEqual(['omitir', 'nueva', 'error'])
    expect(filas.map((f) => resultadoFila(f, true))).toEqual(['actualizar', 'nueva', 'error'])
    expect(filas[2].errores.at(-1)).toMatch(/AM-D110-2023-01/)
  })
})

describe('leerExcel', () => {
  it('lee la hoja «Acciones» de un .xlsx aunque no sea la primera', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Datos').addRow(['Estados', 'Responsables'])
    const ws = wb.addWorksheet('Acciones')
    ws.addRow(CABECERA)
    ws.addRow([
      'AM-D110-2025-01', { richText: [{ text: 'Acción ' }, { text: 'enriquecida' }] }, null, 'Coordinación titulación',
      new Date(Date.UTC(2025, 8, 1)), new Date(Date.UTC(2025, 11, 31)), 'UATR01', null, '2-En proceso', null, 1500,
      true, 'Hecho', false,
    ])
    const buf = await wb.xlsx.writeBuffer()
    const filas = await leerExcel(buf as ArrayBuffer)
    const r = analizarFilas(filas, ctx)
    expect(r.error).toBeNull()
    expect(r.filas[0].errores).toEqual([])
    expect(r.filas[0].datos).toMatchObject({
      nombre: 'Acción enriquecida', fecha_inicio: '2025-09-01', fecha_fin: '2025-12-31', estado: 'en_proceso',
      presupuesto: 1500, es_mejora: true, observaciones: 'Hecho', cerrada: false,
    })
  })
})

describe('acciones sin código', () => {
  const filas = [
    CABECERA,
    [null, 'Sin código A'],
    ['AM-D110-2026-07', 'Con código'],
    ['', 'Ya existe con este nombre'],
    [null, 'Sin código A'],
  ]
  it('sin curso elegido, el código es obligatorio', () => {
    expect(analizarFilas(filas, ctx).filas[0].errores).toEqual(['Falta el código'])
  })
  it('se numeran a continuación del último número (contador, existentes y fichero)', () => {
    const a = analizarFilas(filas, { ...ctx, anyoSinCodigo: 2026 })
    expect(a.filas[0].datos).toMatchObject({ codigo: null, anyo: 2026, numero: null })
    const c = cruzarConExistentes(
      a.filas,
      [{ codigo: 'AM-D110-2026-03', anyo: 2026, numero: 3, nombre: 'Ya existe con este nombre' }],
      { titulacion: 'D110', siguiente: { 2026: 5 } }, // el 4 se borró
    )
    expect(c.map((f) => f.codigoAsignado ?? f.codigo)).toEqual([
      'AM-D110-2026-08', 'AM-D110-2026-07', 'AM-D110-2026-09', 'AM-D110-2026-10',
    ])
    expect(c[2].avisos).toContain('Ya existe una acción con el mismo nombre (AM-D110-2026-03): se creará otra')
    expect(c[3].avisos).toContain('Mismo nombre que la fila 2 del fichero')
    expect(c.map((f) => resultadoFila(f, false))).toEqual(['nueva', 'nueva', 'nueva', 'nueva'])
    expect(ordenEnvio(c).map((f) => f.nombre)).toEqual(['Con código', 'Sin código A', 'Ya existe con este nombre', 'Sin código A'])
  })
})

describe('mismo año y número con códigos distintos', () => {
  it('se marca como error en la vista previa', () => {
    const a = analizarFilas(
      [CABECERA, ['AM-MUDSDM-2023-01', 'Antigua'], ['AM-D110-2023-01', 'Nueva'], ['AM-D110-2023-001', 'Otra forma'], ['AM-D110-2023-02', 'Distinta']],
      ctx,
    )
    const c = cruzarConExistentes(a.filas, [])
    expect(c.map((f) => resultadoFila(f, false))).toEqual(['nueva', 'error', 'error', 'nueva'])
    expect(c[1].errores.at(-1)).toMatch(/^Mismo año y número que la fila 2 \(AM-MUDSDM-2023-01\)/)
  })
})
