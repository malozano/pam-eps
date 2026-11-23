/**
 * Niveles de prioridad de las acciones abiertas (los mismos que usará el resumen mensual por correo):
 *   a) vencida      la fecha de fin ya ha pasado
 *   b) vence_pronto la fecha de fin llega en los próximos `diasPronto` días (60 por defecto)
 *   c) en_curso     ya debería estar en marcha: la fecha de inicio ha llegado o no tiene
 *   d) futura       la fecha de inicio todavía no ha llegado
 */
import { diasHasta, estaAbierta, hoyISO } from './seguimiento'
import type { Accion } from './tipos'

export type Prioridad = 'vencida' | 'vence_pronto' | 'en_curso' | 'futura'

export const PRIORIDADES: { prioridad: Prioridad; titulo: string; ayuda: string; color: string }[] = [
  { prioridad: 'vencida', titulo: 'Plazo vencido', ayuda: 'La fecha de fin ya ha pasado.', color: 'red' },
  { prioridad: 'vence_pronto', titulo: 'Vencen en los próximos 60 días', ayuda: 'La fecha de fin está cerca.', color: 'orange' },
  { prioridad: 'en_curso', titulo: 'En curso o que ya deberían haber empezado', ayuda: 'La fecha de inicio ya ha llegado (o no tienen).', color: 'blue' },
  { prioridad: 'futura', titulo: 'Empiezan más adelante', ayuda: 'La fecha de inicio todavía no ha llegado.', color: 'gray' },
]

type Fechas = Pick<Accion, 'estado' | 'fecha_inicio' | 'fecha_fin'>

/** Prioridad de una acción abierta (null si está completada o cancelada). */
export function prioridad(a: Fechas, hoy = hoyISO(), diasPronto = 60): Prioridad | null {
  if (!estaAbierta(a.estado)) return null
  if (a.fecha_fin && a.fecha_fin < hoy) return 'vencida'
  if (a.fecha_fin && diasHasta(a.fecha_fin, hoy) <= diasPronto) return 'vence_pronto'
  if (!a.fecha_inicio || a.fecha_inicio <= hoy) return 'en_curso'
  return 'futura'
}

/** Agrupa las acciones abiertas por prioridad, ordenadas por fecha de fin (o de inicio, las futuras). */
export function porPrioridad<T extends Accion>(acciones: T[], hoy = hoyISO()): Record<Prioridad, T[]> {
  const g: Record<Prioridad, T[]> = { vencida: [], vence_pronto: [], en_curso: [], futura: [] }
  for (const a of acciones) {
    const p = prioridad(a, hoy)
    if (p) g[p].push(a)
  }
  const fin = (a: T) => a.fecha_fin ?? '9999'
  const ini = (a: T) => a.fecha_inicio ?? '9999'
  for (const p of ['vencida', 'vence_pronto', 'en_curso'] as const)
    g[p].sort((x, y) => fin(x).localeCompare(fin(y)) || x.codigo.localeCompare(y.codigo))
  g.futura.sort((x, y) => ini(x).localeCompare(ini(y)) || x.codigo.localeCompare(y.codigo))
  return g
}
