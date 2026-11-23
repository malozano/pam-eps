import { describe, expect, it } from 'vitest'
import { analizarOrigen, componerOrigen, cursoPropuesto, origenPorDefecto } from './origen'

describe('origen', () => {
  it('compone y analiza', () => {
    const o = { tipo: 'cen10' as const, anyo: 2025, motivo: 'Alta tasa de no presentados en TFM' }
    const t = componerOrigen(o)
    expect(t).toBe('Informe anual de titulación (CEN10) del curso 2025-26. Alta tasa de no presentados en TFM')
    expect(analizarOrigen(t)).toEqual(o)
    expect(componerOrigen({ tipo: 'cen19_1', anyo: 2026, motivo: '' })).toBe(
      'Informe semestral de titulación (CEN19) de primer semestre del curso 2026-27',
    )
    expect(analizarOrigen('Informe anual de centro (CEN02) del curso 2024-25')).toEqual({ tipo: 'cen02', anyo: 2024, motivo: '' })
    expect(analizarOrigen('Informe semestral de titulación (CEN19) de segundo semestre del curso 2025-26. Línea 1\nLínea 2'))
      .toEqual({ tipo: 'cen19_2', anyo: 2025, motivo: 'Línea 1\nLínea 2' })
  })
  it('texto libre', () => {
    expect(analizarOrigen('Informe de seguimiento (CEN19) de primer semestre de 2025-26')).toEqual({
      tipo: null, anyo: null, motivo: 'Informe de seguimiento (CEN19) de primer semestre de 2025-26',
    })
    expect(analizarOrigen(null)).toEqual({ tipo: null, anyo: null, motivo: '' })
    expect(componerOrigen({ tipo: null, anyo: null, motivo: 'Queja de estudiantes' })).toBe('Queja de estudiantes')
  })
  it('curso propuesto', () => {
    expect(cursoPropuesto('cen10', 2026)).toBe(2025)
    expect(cursoPropuesto('cen19_2', 2026)).toBe(2025)
    expect(cursoPropuesto('cen19_1', 2026)).toBe(2026)
  })
  it('origen por defecto según la fecha', () => {
    const d = (s: string, centro = false) => origenPorDefecto(new Date(s + 'T12:00:00'), centro)
    expect(d('2026-11-23')).toEqual({ tipo: 'cen10', anyo: 2025, motivo: '' })
    expect(d('2027-01-15')).toEqual({ tipo: 'cen10', anyo: 2025, motivo: '' })
    expect(d('2027-02-01')).toEqual({ tipo: 'cen19_1', anyo: 2026, motivo: '' })
    expect(d('2027-05-31')).toEqual({ tipo: 'cen19_1', anyo: 2026, motivo: '' })
    expect(d('2027-06-01')).toEqual({ tipo: 'cen19_2', anyo: 2026, motivo: '' })
    expect(d('2027-10-31')).toEqual({ tipo: 'cen19_2', anyo: 2026, motivo: '' })
    expect(d('2026-12-10', true)).toEqual({ tipo: 'cen02', anyo: 2025, motivo: '' })
    expect(d('2027-03-10', true)).toBeNull()
  })
})
