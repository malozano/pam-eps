import { describe, expect, it } from 'vitest'
import { analizarTasas, aspectosDestacados, mediana, semestresDelBloque } from './analisisTasas'
import type { AsignaturaTasas, Semestre, TasasTitulacion } from './tasas'

const CURSOS = ['2022-23', '2023-24', '2024-25', '2025-26']
/** Asignatura de prueba: éxito y rendimiento por curso (null = sin datos) */
const asig = (
  codigo: string, curso: number, semestre: Semestre, exito: (number | null)[], rend: (number | null)[],
  matr = 50, extra: Partial<AsignaturaTasas> = {},
): AsignaturaTasas => ({
  codigo, nombre: `ASIG ${codigo}`, curso, tipo: 'OBLIGATORIA', semestre, esTrabajoFin: false,
  datos: Object.fromEntries(CURSOS.map((cu, k) => [cu, {
    matriculados: exito[k] === null && rend[k] === null ? null : matr, aprobados: null, presentados: null,
    exito: exito[k], rendimiento: rend[k], no_presentados: null,
  }])),
  ...extra,
})

const t: TasasTitulacion = {
  titulacion: 'GRADO X',
  cursos: CURSOS,
  asignaturas: [
    // 1.er curso, segundo semestre
    asig('A', 1, 'segundo', [0.6, 0.6, 0.6, 0.42], [0.3, 0.3, 0.3, 0.25]),            // rendimiento < 30 %
    asig('B', 1, 'segundo', [0.7, 0.7, 0.4, 0.75], [0.6, 0.6, 0.34, 0.70]),            // cambio +36
    asig('C', 1, 'segundo', [0.8, 0.8, 0.8, 0.8], [0.7, 0.7, 0.7, 0.72]),
    asig('D', 1, 'segundo', [0.9, 0.9, 0.9, 0.95], [0.4, 0.4, 0.4, 0.40]),            // éxito−rend = 55
    asig('E', 1, 'ambos', [0.7, 0.7, 0.7, 0.7], [0.65, 0.65, 0.65, 0.66]),
    asig('P', 1, 'segundo', [1, 1, 1, 0], [1, 1, 1, 0], 2),                             // muestra pequeña: no se destaca
    // 2.º curso: una muy por encima del resto
    asig('F', 2, 'segundo', [0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]),
    asig('G', 2, 'segundo', [0.55, 0.55, 0.55, 0.52], [0.5, 0.5, 0.5, 0.5]),
    asig('H', 2, 'segundo', [0.9, 0.9, 0.95, 1], [0.9, 0.9, 0.95, 1]),                 // atípica (+50 sobre la mediana)
    // TFG (sin semestre): aparte, sin comparar con la mediana
    asig('TFG', 4, 'sin', [1, 1, 1, 1], [0.5, 0.4, 0.4, 0.6], 55, { esTrabajoFin: true, nombre: 'TREBALL DE FI DE GRAU' }),
    // primer semestre (no entra en el bloque del segundo)
    asig('Z', 1, 'primero', [0.2, 0.2, 0.2, 0.2], [0.2, 0.2, 0.2, 0.2]),
    // optativa sin datos en los cursos mostrados
    asig('V', 3, 'segundo', [0.9, null, null, null], [0.9, null, null, null]),
  ],
}

describe('análisis de tasas', () => {
  it('utilidades', () => {
    expect(mediana([0.5, null, 0.9, 0.7])).toBe(0.7)
    expect(mediana([0.4, 0.6])).toBe(0.5)
    expect(mediana([null])).toBeNull()
    expect(semestresDelBloque('segundo')).toEqual(['segundo', 'ambos', 'sin'])
  })

  it('columnas: últimos 3 cursos hasta el analizado; error si falta el analizado', () => {
    expect(analizarTasas(t, '2025-26', 'segundo').cursos).toEqual(['2023-24', '2024-25', '2025-26'])
    expect(analizarTasas(t, '2023-24', 'segundo').cursos).toEqual(['2022-23', '2023-24'])
    expect(() => analizarTasas(t, '2026-27', 'segundo')).toThrow(/no incluye el curso 2026-27/)
  })

  it('bloque del segundo semestre: tablas por curso, TFG aparte, sin primer semestre', () => {
    const a = analizarTasas(t, '2025-26', 'segundo')
    expect(a.tablas.map((x) => [x.titulo, x.filas.map((f) => f.asignatura.codigo)])).toEqual([
      ['1.º curso', ['A', 'B', 'C', 'D', 'E', 'P']],
      ['2.º curso', ['F', 'G', 'H']],
      ['Trabajo fin de grado / máster', ['TFG']],
    ])
    expect(a.avisos).toEqual(['1 asignaturas sin datos en 2023-24, 2024-25, 2025-26 no se incluyen en las tablas.'])
    expect(a.tablas[1].mediana.rendimiento[2]).toBe(0.5)
  })

  it('criterios de destacado', () => {
    const a = analizarTasas(t, '2025-26', 'segundo')
    const f = (c: string) => a.tablas.flatMap((x) => x.filas).find((x) => x.asignatura.codigo === c)!
    expect(f('A').marcas.rendimiento).toContain('baja')
    expect(f('B').marcas.rendimiento).toContain('cambio')
    expect(f('B').detalles.join()).toMatch(/pasa del 34 % al 70 % \(\+36 puntos\)/)
    expect(f('D').marcas.rendimiento).toContain('no_presentados')
    expect(f('H').marcas.exito).toContain('atipica')
    expect(f('C').detalles).toEqual([])
    expect(f('P').detalles).toEqual([]) // 2 matriculados: no se destaca aunque tenga 0 %
    expect(f('TFG').marcas.rendimiento).not.toContain('atipica') // sin comparación con la mediana
    expect(aspectosDestacados(a)[0]).toBe(
      'ASIG A (1.º, 50 matriculados): tasa de rendimiento del 25 % (inferior al 30 %).',
    )
    expect(a.totalDestacadas).toBe(4)
  })

  it('criterios configurables', () => {
    const a = analizarTasas(t, '2025-26', 'segundo', { tasa_baja: 0.5, cambio: 2, desviacion: 2, no_presentados: 2, min_matriculados: 1 })
    const f = (c: string) => a.tablas.flatMap((x) => x.filas).find((x) => x.asignatura.codigo === c)!
    expect(f('D').marcas.rendimiento).toEqual(['baja']) // 40 % < 50 %
    expect(f('P').marcas.rendimiento).toEqual(['baja']) // con mínimo de 1 matriculado ya se destaca
  })

  it('aviso si el curso analizado no tiene datos del semestre', () => {
    const sinUltimo: TasasTitulacion = {
      ...t,
      asignaturas: t.asignaturas.map((a) => ({ ...a, datos: { ...a.datos, '2025-26': { ...a.datos['2025-26'], exito: null, rendimiento: null } } })),
    }
    expect(analizarTasas(sinUltimo, '2025-26', 'segundo').avisos.join()).toMatch(/no tiene tasas de 2025-26/)
  })
})
