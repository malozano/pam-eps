import { describe, expect, it } from 'vitest'
import { porPrioridad, prioridad } from './prioridad'
import type { Accion } from './tipos'

const HOY = '2026-11-23'
const a = (id: string, estado: Accion['estado'], fecha_inicio: string | null, fecha_fin: string | null) =>
  ({ id, codigo: id, estado, fecha_inicio, fecha_fin }) as Accion

describe('prioridad', () => {
  it('niveles', () => {
    expect(prioridad(a('x', 'en_proceso', '2026-01-01', '2026-11-22'), HOY)).toBe('vencida')
    expect(prioridad(a('x', 'pendiente', '2026-01-01', '2026-11-23'), HOY)).toBe('vence_pronto') // vence hoy
    expect(prioridad(a('x', 'pendiente', '2027-01-10', '2027-01-22'), HOY)).toBe('vence_pronto') // 60 días, aunque no haya empezado
    expect(prioridad(a('x', 'pendiente', '2026-09-01', '2027-01-23'), HOY)).toBe('en_curso') // 61 días
    expect(prioridad(a('x', 'pendiente', null, null), HOY)).toBe('en_curso')
    expect(prioridad(a('x', 'en_proceso', '2026-11-23', '2027-06-30'), HOY)).toBe('en_curso')
    expect(prioridad(a('x', 'pendiente', '2026-11-24', '2027-06-30'), HOY)).toBe('futura')
    expect(prioridad(a('x', 'completada', null, '2020-01-01'), HOY)).toBeNull()
  })
  it('agrupa y ordena', () => {
    const g = porPrioridad([
      a('v2', 'pendiente', null, '2026-10-01'),
      a('v1', 'pendiente', null, '2026-09-01'),
      a('f2', 'pendiente', '2027-03-01', '2027-09-01'),
      a('f1', 'pendiente', '2027-02-01', '2027-09-30'),
      a('c', 'cancelada', null, null),
    ], HOY)
    expect(g.vencida.map((x) => x.id)).toEqual(['v1', 'v2'])
    expect(g.futura.map((x) => x.id)).toEqual(['f1', 'f2'])
    expect(g.en_curso).toEqual([])
  })
})
