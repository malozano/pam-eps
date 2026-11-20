import { describe, expect, it } from 'vitest'
import { anyoPorDefecto, anyosSeleccionables, codigoAccion, etiquetaCurso, parsearCodigo } from './cursos'

describe('cursos', () => {
  it('etiqueta del curso', () => {
    expect(etiquetaCurso(2026)).toBe('2026-27')
    expect(etiquetaCurso(2099)).toBe('2099-00')
  })
  it('año por defecto = año natural actual', () => {
    expect(anyoPorDefecto(new Date('2026-11-20'))).toBe(2026)
    expect(anyosSeleccionables(new Date('2026-03-01'))).toEqual([2025, 2026, 2027])
  })
  it('código de acción con dos dígitos mínimo', () => {
    expect(codigoAccion('D110', 2026, 1)).toBe('AM-D110-2026-01')
    expect(codigoAccion('CEN', 2026, 123)).toBe('AM-CEN-2026-123')
  })
  it('parsea códigos actuales y antiguos con siglas', () => {
    expect(parsearCodigo('AM-D110-2024-03')).toEqual({ prefijo: 'D110', anyo: 2024, numero: 3 })
    expect(parsearCodigo(' am-mudsdm-2021-05 ')).toEqual({ prefijo: 'MUDSDM', anyo: 2021, numero: 5 })
    expect(parsearCodigo('AM-D110-24-03')).toBeNull()
  })
})
