import { describe, expect, it } from 'vitest'
import {
  accionesPorResponsable, accionesPorTitulacionYCurso, estadoPlanPorTitulacion, evolucionPorCurso, FILTROS_VACIOS,
  filtrarAcciones, pendientesPorResponsable, textoListado,
} from './consultas'
import type { Accion } from './tipos'

const HOY = '2026-11-20'
let n = 0
const a = (titulacion: string, anyo: number, extra: Partial<Accion> = {}): Accion => {
  n++
  return {
    id: `id${n}`, titulacion, anyo, numero: n, codigo: `AM-${titulacion}-${anyo}-${String(n).padStart(2, '0')}`,
    nombre: `Acción ${n}`, tareas: null, responsable: 'Coordinación titulación', fecha_inicio: `${anyo}-09-01`,
    fecha_fin: `${anyo + 1}-06-30`, indicadores: [], origen: null, estado: 'pendiente', presupuesto: null,
    es_mejora: true, observaciones: null, cerrada: false, created_at: '', updated_at: '', ...extra,
  }
}

const acciones = [
  a('CEN', 2026, { responsable: 'Coordinación calidad', estado: 'en_proceso', fecha_fin: '2026-10-31', observaciones: 'Encuesta\nenviada' }), // vencida
  a('CEN', 2026, { responsable: 'Coordinación calidad', fecha_fin: '2027-03-31' }),
  a('CEN', 2026, { responsable: 'Equipo directivo', estado: 'completada' }),
  a('CEN', 2025, { responsable: 'Coordinación movilidad', fecha_fin: '2026-06-30' }), // vencida
  a('D110', 2026, { indicadores: ['UATR01'] }),
  a('D110', 2025, { estado: 'cancelada', cerrada: true }),
  a('C203', 2026, { responsable: null, es_mejora: false }),
]

describe('consultas', () => {
  it('filtros', () => {
    const f = (x: Partial<typeof FILTROS_VACIOS>) => filtrarAcciones(acciones, { ...FILTROS_VACIOS, ...x }, HOY).map((y) => y.id)
    expect(f({}).length).toBe(7)
    expect(f({ titulaciones: ['CEN'] }).length).toBe(4)
    expect(f({ anyos: [2025] })).toEqual(['id4', 'id6'])
    expect(f({ estados: ['completada', 'cancelada'] })).toEqual(['id3', 'id6'])
    expect(f({ responsables: ['Coordinación calidad'] })).toEqual(['id1', 'id2'])
    expect(f({ situaciones: ['vencida'] })).toEqual(['id1', 'id4'])
    expect(f({ texto: 'uatr01' })).toEqual(['id5'])
    expect(f({ soloMejora: true }).length).toBe(6)
    expect(f({ incluirCerradas: false }).length).toBe(6)
    // activas en algún momento entre el 1 y el 30 de noviembre de 2026
    expect(f({ desde: '2026-11-01', hasta: '2026-11-30' })).toEqual(['id2', 'id3', 'id5', 'id7'])
  })

  it('pendientes por responsable (un plan)', () => {
    const g = pendientesPorResponsable(acciones.filter((x) => x.titulacion === 'CEN'), false, HOY)
    expect(g.map((x) => [x.responsable, x.acciones.map((y) => y.id), x.vencidas])).toEqual([
      ['Coordinación calidad', ['id1', 'id2'], 1], // vencida primero
      ['Coordinación movilidad', ['id4'], 1],
    ]) // «Equipo directivo» solo tiene una completada: no aparece
  })

  it('pendientes por plan y responsable (varios planes)', () => {
    const g = pendientesPorResponsable(acciones, true, HOY)
    expect(g.map((x) => x.clave)).toEqual([
      'CEN|Coordinación calidad', 'CEN|Coordinación movilidad', 'C203|Sin responsable asignado', 'D110|Coordinación titulación',
    ])
  })

  it('texto para copiar', () => {
    const [g] = pendientesPorResponsable(acciones.filter((x) => x.titulacion === 'CEN'), false, HOY)
    expect(textoListado(g, 'https://x/pam-eps/', HOY)).toBe(
      'Acciones abiertas de Coordinación calidad: 2, 1 con el plazo vencido\n\n' +
        '• AM-CEN-2026-01. Acción 1\n   Estado: En proceso. PLAZO VENCIDO el 31/10/2026 (hace 20 días).\n   Situación registrada: Encuesta enviada\n   https://x/pam-eps/gestion/CEN/accion/id1\n\n' +
        '• AM-CEN-2026-02. Acción 2\n   Estado: Pendiente. Plazo: 01/09/2026 – 31/03/2027.\n   https://x/pam-eps/gestion/CEN/accion/id2',
    )
  })

  it('estadísticas', () => {
    const m = accionesPorTitulacionYCurso(acciones)
    expect(m.cursos).toEqual(['2025-26', '2026-27'])
    expect(m.filas.get('CEN')).toEqual({ 2025: 1, 2026: 3 })
    expect(m.max).toBe(3)
    const e = estadoPlanPorTitulacion(acciones, 2026, HOY)
    expect(e.get('CEN')).toMatchObject({ total: 4, completada: 1, en_proceso: 1, pendiente: 2, vencidas: 2 })
    expect(e.get('D110')).toMatchObject({ total: 1 }) // la cancelada de 2025 no entra en el plan 2026-27
    const r = accionesPorResponsable(acciones, HOY)
    expect(r[0]).toMatchObject({ responsable: 'Coordinación calidad', total: 2, abiertas: 2, vencidas: 1, planes: 1 })
    expect(r.find((x) => x.responsable === 'Coordinación titulación')).toMatchObject({ total: 2, planes: 1 })
    expect(evolucionPorCurso(acciones).map((x) => [x.curso, x.total, x.completada])).toEqual([['2025-26', 2, 0], ['2026-27', 5, 1]])
  })
})
