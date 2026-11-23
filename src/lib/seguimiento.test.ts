import { describe, expect, it } from 'vitest'
import { diasHasta, enPlanDelCurso, situacion } from './seguimiento'

describe('enPlanDelCurso', () => {
  it('incluye las del curso en cualquier estado', () => {
    expect(enPlanDelCurso({ anyo: 2026, estado: 'completada' }, 2026)).toBe(true)
  })
  it('incluye anteriores abiertas y excluye anteriores finalizadas y posteriores', () => {
    expect(enPlanDelCurso({ anyo: 2024, estado: 'en_proceso' }, 2026)).toBe(true)
    expect(enPlanDelCurso({ anyo: 2025, estado: 'pendiente' }, 2026)).toBe(true)
    expect(enPlanDelCurso({ anyo: 2025, estado: 'cancelada' }, 2026)).toBe(false)
    expect(enPlanDelCurso({ anyo: 2027, estado: 'pendiente' }, 2026)).toBe(false)
  })
})

describe('situacion', () => {
  const hoy = '2026-11-20'
  const a = (estado: 'pendiente' | 'en_proceso' | 'completada', fecha_inicio: string | null, fecha_fin: string | null) => ({
    estado, fecha_inicio, fecha_fin,
  })
  it('finalizada', () => expect(situacion(a('completada', '2020-01-01', '2020-02-01'), hoy)).toBe('finalizada'))
  it('vencida si la fecha de fin ya pasó y sigue abierta', () => {
    expect(situacion(a('en_proceso', '2026-01-01', '2026-11-19'), hoy)).toBe('vencida')
    expect(situacion(a('pendiente', '2026-01-01', '2026-11-19'), hoy)).toBe('vencida')
  })
  it('el último día no está vencida (vence pronto)', () => expect(situacion(a('en_proceso', '2026-01-01', '2026-11-20'), hoy)).toBe('vence_pronto'))
  it('vence pronto: fin en los próximos 60 días, tenga o no fecha de inicio', () => {
    expect(situacion(a('en_proceso', null, '2027-01-19'), hoy)).toBe('vence_pronto')
    expect(situacion(a('pendiente', null, '2027-01-20'), hoy)).toBe('en_plazo')
    expect(situacion(a('pendiente', '2026-10-01', '2026-12-15'), hoy)).toBe('vence_pronto') // prioridad sobre «debería haber empezado»
  })
  it('sin iniciar si es pendiente y ya debía empezar', () =>
    expect(situacion(a('pendiente', '2026-11-20', '2027-06-30'), hoy)).toBe('sin_iniciar'))
  it('próxima si empieza en los próximos 30 días', () => {
    expect(situacion(a('pendiente', '2026-12-20', '2027-01-31'), hoy)).toBe('proxima')
    expect(situacion(a('pendiente', '2026-12-21', '2027-01-31'), hoy)).toBe('en_plazo')
  })
  it('en proceso dentro de plazo', () => expect(situacion(a('en_proceso', '2026-09-01', '2027-06-30'), hoy)).toBe('en_plazo'))
  it('sin fechas', () => expect(situacion(a('pendiente', null, null), hoy)).toBe('en_plazo'))
})

describe('diasHasta', () => {
  it('cuenta días naturales', () => {
    expect(diasHasta('2026-12-01', '2026-11-20')).toBe(11)
    expect(diasHasta('2026-11-18', '2026-11-20')).toBe(-2)
    expect(diasHasta('2027-03-01', '2027-02-27')).toBe(2)
  })
})
