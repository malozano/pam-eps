import { describe, expect, it } from 'vitest'
import { etiquetaIndicador, separarIndicadores, unirIndicadores, type IndicadorCatalogo } from './indicadores'

describe('indicadores', () => {
  it('separa como la función SQL', () => {
    expect(separarIndicadores('UATR01')).toEqual(['UATR01'])
    expect(separarIndicadores(' uas01, UAS05 ;ISV2 ')).toEqual(['UAS01', 'UAS05', 'ISV2'])
    expect(separarIndicadores('ISV3/VER03')).toEqual(['ISV3', 'VER03'])
    expect(separarIndicadores('Si / No')).toEqual(['Si / No'])
    expect(separarIndicadores('sí/no')).toEqual(['Si / No'])
    expect(separarIndicadores('UAS01\nSi / No')).toEqual(['UAS01', 'Si / No'])
    expect(separarIndicadores('Número de propuestas, aprobadas')).toEqual(['Número de propuestas, aprobadas'])
    expect(separarIndicadores('Tasa 2020/Abandono')).toEqual(['Tasa 2020/Abandono'])
    expect(separarIndicadores(null)).toEqual([])
    expect(separarIndicadores('  ')).toEqual([])
  })
  it('une y etiqueta', () => {
    expect(unirIndicadores(['ISV2', 'VER02'])).toBe('ISV2, VER02')
    const cat = new Map<string, IndicadorCatalogo>([
      ['UATR01', { codigo: 'UATR01', nombre: 'Tasa de respuesta', definicion: null, procedimiento: 'PA02', procedimientos: [], activo: true, orden: 1 }],
    ])
    expect(etiquetaIndicador('UATR01', cat)).toBe('UATR01 · Tasa de respuesta')
    expect(etiquetaIndicador('Si / No', cat)).toBe('Si / No')
  })
})
