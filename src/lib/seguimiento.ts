/**
 * Reglas de seguimiento de las acciones: qué entra en el plan de un curso y qué
 * acciones requieren atención en una fecha dada. Las fechas son cadenas 'aaaa-mm-dd'.
 */
import type { Accion, EstadoAccion } from './tipos'

export const ESTADOS_ABIERTOS: EstadoAccion[] = ['pendiente', 'en_proceso']

export function estaAbierta(estado: EstadoAccion): boolean {
  return ESTADOS_ABIERTOS.includes(estado)
}

/**
 * Misma regla que la función SQL plan_publico (sin el filtro de «es acción de mejora»):
 * acciones del curso + acciones de cursos anteriores todavía pendientes o en proceso.
 */
export function enPlanDelCurso(a: Pick<Accion, 'anyo' | 'estado'>, anyo: number): boolean {
  return a.anyo === anyo || (a.anyo < anyo && estaAbierta(a.estado))
}

export type Situacion =
  | 'vencida' //       abierta y con la fecha de fin ya pasada
  | 'vence_pronto' //  abierta y con la fecha de fin en los próximos `diasFin` días (60)
  | 'sin_iniciar' //   pendiente y con la fecha de inicio ya alcanzada
  | 'proxima' //       pendiente y empieza en los próximos `diasAviso` días
  | 'en_plazo' //      abierta y sin nada que destacar
  | 'finalizada' //    completada o cancelada

/** Días antes de la fecha de fin en que una acción abierta se destaca como «Vence pronto». */
export const DIAS_VENCE_PRONTO = 60

export function hoyISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + dias))
  return f.toISOString().slice(0, 10)
}

export function situacion(
  a: Pick<Accion, 'estado' | 'fecha_inicio' | 'fecha_fin'>,
  hoy: string = hoyISO(),
  diasAviso = 30,
  diasFin = DIAS_VENCE_PRONTO,
): Situacion {
  if (!estaAbierta(a.estado)) return 'finalizada'
  if (a.fecha_fin && a.fecha_fin < hoy) return 'vencida'
  // muchas acciones solo tienen fecha de fin: se destacan antes de que venza el plazo
  if (a.fecha_fin && a.fecha_fin <= sumarDias(hoy, diasFin)) return 'vence_pronto'
  if (a.estado === 'pendiente' && a.fecha_inicio) {
    if (a.fecha_inicio <= hoy) return 'sin_iniciar'
    if (a.fecha_inicio <= sumarDias(hoy, diasAviso)) return 'proxima'
  }
  return 'en_plazo'
}

/** Días que faltan (positivo) o que han pasado (negativo) desde hoy hasta una fecha. */
export function diasHasta(iso: string, hoy: string = hoyISO()): number {
  const t = (s: string) => {
    const [a, m, d] = s.split('-').map(Number)
    return Date.UTC(a, m - 1, d)
  }
  return Math.round((t(iso) - t(hoy)) / 86400000)
}

/** Orden de prioridad de las situaciones en todos los listados (lo más urgente primero). */
export const ORDEN_SITUACION: Record<Situacion, number> = {
  vencida: 0, vence_pronto: 1, sin_iniciar: 2, proxima: 3, en_plazo: 4, finalizada: 5,
}

/** Compara dos acciones: situación más urgente primero, después fecha de fin y código. */
export function compararPorUrgencia(
  x: Pick<Accion, 'estado' | 'fecha_inicio' | 'fecha_fin' | 'codigo'>,
  y: Pick<Accion, 'estado' | 'fecha_inicio' | 'fecha_fin' | 'codigo'>,
  hoy: string = hoyISO(),
): number {
  return (
    ORDEN_SITUACION[situacion(x, hoy)] - ORDEN_SITUACION[situacion(y, hoy)] ||
    (x.fecha_fin ?? '9999').localeCompare(y.fecha_fin ?? '9999') ||
    x.codigo.localeCompare(y.codigo)
  )
}
