// Pruebas del resumen mensual por correo (módulo de la Edge Function «enviar-avisos»)
import { describe, expect, it } from 'vitest'
import { bloquesPara, NIVELES, prioridad, redactarResumen, textoPlazo, type AccionR } from '../../supabase/functions/enviar-avisos/resumen'
import { GRUPOS_SITUACION, situacion } from './seguimiento'
import type { EstadoAccion } from './tipos'

const HOY = '2026-11-15'
let n = 0
const a = (titulacion: string, responsable: string | null, extra: Partial<AccionR> = {}): AccionR => {
  n++
  return {
    id: `id${n}`, codigo: `AM-${titulacion}-2026-${String(n).padStart(2, '0')}`, nombre: `Acción ${n}`, tareas: null,
    titulacion, responsable, estado: 'pendiente', fecha_inicio: '2026-09-01', fecha_fin: '2027-06-30', ...extra,
  }
}
const acciones = [
  a('CEN', 'Coordinación movilidad', { fecha_fin: '2026-10-31', estado: 'en_proceso', tareas: '- Convocar\n- Resolver' }), // vencida
  a('CEN', 'Coordinación movilidad', { fecha_fin: '2026-12-15' }), // vence pronto
  a('CEN', 'Coordinación PAT'), // sin cuenta
  a('CEN', null, { fecha_inicio: '2027-02-01' }), // sin responsable, futura
  a('CEN', 'Coordinación movilidad', { estado: 'completada' }),
  a('C203', 'Coordinación titulación'),
  a('D110', 'Coordinación titulación', { fecha_fin: '2026-11-01' }),
]
const conCuenta = new Set(['Coordinación movilidad'])
const nombre = (c: string) => ({ C203: 'Grado en Ingeniería Civil', D110: 'Máster' })[c] ?? c

describe('resumen mensual', () => {
  it('prioridades y plazos', () => {
    expect(acciones.map((x) => prioridad(x, HOY))).toEqual(['vencida', 'vence_pronto', 'sin_iniciar', 'futura', null, 'sin_iniciar', 'vencida'])
    expect(textoPlazo(acciones[0], 'vencida', HOY)).toBe('Venció el 31/10/2026 (hace 15 días)')
    expect(textoPlazo(acciones[1], 'vence_pronto', HOY)).toBe('Vence el 15/12/2026 (en 30 días)')
    expect(textoPlazo(acciones[2], 'sin_iniciar', HOY)).toBe('Debería haber empezado el 01/09/2026; fin: 30/06/2027')
    expect(textoPlazo(acciones[3], 'futura', HOY)).toBe('Empieza el 01/02/2027; fin: 30/06/2027')
  })

  it('qué recibe cada uno', () => {
    const ids = (bs: ReturnType<typeof bloquesPara>) => bs.map((b) => [b.titulo ?? '', b.acciones.map((x) => x.id)])
    expect(ids(bloquesPara({ rol: 'admin', titulaciones: [], responsabilidades: [] }, acciones, conCuenta, nombre))).toEqual([
      ['Plan del centro: acciones sin cuenta responsable', ['id3', 'id4']],
      ['Plan del centro: acciones con cuenta responsable', ['id1', 'id2']],
    ])
    expect(ids(bloquesPara({ rol: 'transversal', titulaciones: [], responsabilidades: ['Coordinación movilidad'] }, acciones, conCuenta, nombre)))
      .toEqual([['', ['id1', 'id2']]])
    expect(bloquesPara({ rol: 'transversal', titulaciones: [], responsabilidades: ['Coordinación cultura'] }, acciones, conCuenta, nombre)).toEqual([])
    expect(ids(bloquesPara({ rol: 'coordinador', titulaciones: ['D110', 'C203'], responsabilidades: [] }, acciones, conCuenta, nombre))).toEqual([
      ['C203 · Grado en Ingeniería Civil', ['id6']],
      ['D110 · Máster', ['id7']],
    ])
  })

  it('redacción', () => {
    const bloques = bloquesPara({ rol: 'transversal', titulaciones: [], responsabilidades: ['Coordinación movilidad'] }, acciones, conCuenta, nombre)
    const r = redactarResumen({ nombre: 'Movilidad', bloques, hoy: HOY, urlApp: 'https://x/app/', dia: 15 })
    expect(r.asunto).toBe('Resumen mensual: 2 acciones abiertas, 1 vencida')
    expect(r.texto).toContain('Resumen mensual de acciones · noviembre de 2026')
    expect(r.texto).toContain('1 con el plazo vencido y 1 vence en los próximos 60 días')
    expect(r.texto).toContain('PLAZO VENCIDO (1)\n• AM-CEN-2026-01. Acción 1\n   Tareas: - Convocar · - Resolver\n   Estado: En proceso. Venció el 31/10/2026 (hace 15 días).\n   https://x/app/gestion/CEN/accion/id1')
    expect(r.texto).not.toContain('Responsable:') // una sola responsabilidad
    expect(r.html).toContain('Vencen pronto (1)')
    expect(r.html).not.toContain('<script')
  })

  it('mismas situaciones y grupos que la aplicación', () => {
    const fechas = [null, '2026-01-01', '2026-11-14', '2026-11-15', '2026-11-16', '2026-12-15', '2027-01-14', '2027-01-15', '2027-06-30']
    for (const estado of ['pendiente', 'en_proceso', 'completada'])
      for (const fecha_inicio of fechas)
        for (const fecha_fin of fechas) {
          if (fecha_inicio && fecha_fin && fecha_fin < fecha_inicio) continue
          const x = a('CEN', null, { estado, fecha_inicio, fecha_fin })
          const app = situacion({ estado: estado as EstadoAccion, fecha_inicio, fecha_fin }, HOY)
          expect(prioridad(x, HOY) ?? 'finalizada', `${estado} ${fecha_inicio} ${fecha_fin}`).toBe(app)
        }
    expect(NIVELES.map((n) => [n.p, n.titulo])).toEqual(GRUPOS_SITUACION.map((g) => [g.situacion, g.titulo]))
  })
})
