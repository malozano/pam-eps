import { describe, expect, it } from 'vitest'
import { analizarCatalogo, generarExcelCatalogo } from './catalogo'
import { leerExcel } from './importacion'
import type { IndicadorCatalogo, Procedimiento } from './indicadores'

const procedimientos: Procedimiento[] = [
  { codigo: 'PC01', nombre: 'Desarrollo y seguimiento de las enseñanzas', orden: 101 },
  { codigo: 'PA02', nombre: 'Satisfacción de los grupos de interés', orden: 202 },
  { codigo: 'PE03', nombre: 'Revisión, análisis y mejora del SC', orden: 3 },
]
const ind = (codigo: string, nombre: string, procedimiento: string, extra: Partial<IndicadorCatalogo> = {}): IndicadorCatalogo => ({
  codigo, nombre, definicion: `Def ${codigo}`, procedimiento, procedimientos: [procedimiento], activo: true, orden: 1, ...extra,
})
const actual = {
  procedimientos,
  indicadores: [
    ind('ISV2', 'Tasa de abandono del título (AVAP)', 'PC01'),
    ind('UAS01', 'Satisfacción del estudiantado con la titulación', 'PA02', { procedimientos: ['PA02', 'PE03'] }),
    ind('UATR01', 'Tasa de respuesta', 'PA02'),
    ind('VIEJO1', 'Ya inactivo', 'PC01', { activo: false }),
  ],
}
const CAB = ['Procedimiento (grupo)', 'Código', 'Indicador', 'Definición / forma de cálculo', 'Otros procedimientos']

describe('analizarCatalogo', () => {
  it('clasifica nuevos, modificados, sin cambios y ausentes', () => {
    const r = analizarCatalogo(
      [
        CAB,
        ['PC01 · Desarrollo y seguimiento de las enseñanzas', 'ISV2', 'Tasa de abandono del título (AVAP)', 'Def ISV2', ''],
        ['PA02', 'UAS01', 'Satisfacción del estudiantado con la titulación (rev.)', 'Def UAS01', 'PE03'],
        ['PC09 · Nuevo procedimiento', 'uanew1', 'Indicador nuevo', null, 'PA02'],
        ['PC01', 'VIEJO1', 'Ya inactivo', 'Def VIEJO1', ''],
      ],
      actual,
    )
    expect(r.error).toBeNull()
    expect(r.filas.map((f) => [f.codigo, f.tipo])).toEqual([
      ['ISV2', 'igual'], ['UAS01', 'modificado'], ['UANEW1', 'nuevo'], ['VIEJO1', 'modificado'],
    ])
    expect(r.filas[1].cambios).toEqual(['Nombre: «Satisfacción del estudiantado con la titulación» → «Satisfacción del estudiantado con la titulación (rev.)»'])
    expect(r.filas[2].datos).toMatchObject({ procedimiento: 'PC09', procedimientos: ['PA02', 'PC09'], definicion: null })
    expect(r.filas[3].cambios).toEqual(['Se reactiva (estaba inactivo)'])
    expect(r.procedimientos).toEqual([
      { codigo: 'PC01', nombre: 'Desarrollo y seguimiento de las enseñanzas', nuevo: false },
      { codigo: 'PC09', nombre: 'Nuevo procedimiento', nuevo: true },
    ])
    expect(r.ausentes.map((i) => i.codigo)).toEqual(['UATR01'])
  })

  it('errores por fila', () => {
    const r = analizarCatalogo(
      [
        CAB,
        ['PC01', '', 'Sin código', '', ''],
        ['PC01', 'ISV3/VER03', 'Doble', '', ''],
        ['PC01', 'ISV2', '', '', ''],
        ['PX01', 'AB1', 'Proc. malo', '', ''],
        ['PC10', 'AB2', 'Proc. nuevo sin nombre', '', ''],
        ['PC01', 'AB3', 'Otro desconocido', '', 'PA99'],
        ['PC01', 'AB4', 'Uno', '', ''],
        ['PC01', 'AB4', 'Repetido', '', ''],
      ],
      actual,
    )
    const e = r.filas.map((f) => f.errores.join(' | '))
    expect(e[0]).toMatch(/Falta el código/)
    expect(e[1]).toMatch(/no válido/)
    expect(e[2]).toMatch(/Falta el nombre/)
    expect(e[3]).toMatch(/Procedimiento «PX01» no válido/)
    expect(e[4]).toMatch(/PC10 es nuevo/)
    expect(e[5]).toMatch(/PA99 desconocido/)
    expect(e[6]).toBe('')
    expect(e[7]).toMatch(/repetido \(fila 8\)/)
  })

  it('un procedimiento nuevo basta con nombrarlo en una fila', () => {
    const r = analizarCatalogo(
      [CAB, ['PC09', 'AB1', 'Primero', '', ''], ['PC09 · Nuevo procedimiento', 'AB2', 'Segundo', '', '']],
      actual,
    )
    expect(r.filas.map((f) => f.tipo)).toEqual(['nuevo', 'nuevo'])
  })

  it('acepta la hoja de revisión inicial («Grupo en el selector…»)', () => {
    const r = analizarCatalogo(
      [
        ['Grupo en el selector (procedimiento)', 'Código', 'Códigos alternativos', 'Indicador (nombre que se muestra)',
          'Definición / forma de cálculo (ayuda al elegir)', 'Procedimientos donde aparece'],
        ['PA02 · Satisfacción de los grupos de interés', 'UAS01', '', 'Satisfacción del estudiantado con la titulación', 'Def UAS01', 'PE03, PA02'],
      ],
      actual,
    )
    expect(r.filas[0].tipo).toBe('igual')
  })
})

describe('exportación del catálogo', () => {
  it('ida y vuelta sin cambios (solo activos)', async () => {
    const buf = await generarExcelCatalogo(actual.indicadores, procedimientos)
    const r = analizarCatalogo(await leerExcel(buf), actual)
    expect(r.filas.map((f) => [f.codigo, f.tipo])).toEqual([['ISV2', 'igual'], ['UAS01', 'igual'], ['UATR01', 'igual']])
    expect(r.ausentes).toEqual([])
  })
})
