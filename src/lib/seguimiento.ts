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
  | 'en_plazo' //      abierta y en marcha (o sin fecha de inicio) sin nada urgente
  | 'futura' //        pendiente que empieza dentro de más de `diasAviso` días
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
    return 'futura'
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
  vencida: 0, vence_pronto: 1, sin_iniciar: 2, proxima: 3, en_plazo: 4, futura: 5, finalizada: 6,
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

/**
 * Grupos de acciones abiertas por situación, en orden de urgencia. Los usan «Mis acciones» y el
 * resumen mensual (que incluyen también las que empiezan más adelante); «Requieren atención»
 * muestra todas salvo esas. Mismos nombres y colores que las etiquetas de situación.
 */
export const GRUPOS_SITUACION: { situacion: Exclude<Situacion, 'finalizada'>; titulo: string; ayuda: string; color: string }[] = [
  { situacion: 'vencida', titulo: 'Plazo vencido', ayuda: 'La fecha de fin ya ha pasado.', color: 'red' },
  { situacion: 'vence_pronto', titulo: 'Vencen pronto', ayuda: `La fecha de fin llega en los próximos ${DIAS_VENCE_PRONTO} días.`, color: 'orange' },
  { situacion: 'sin_iniciar', titulo: 'Deberían haber empezado', ayuda: 'Siguen pendientes y su fecha de inicio ya ha llegado.', color: 'grape' },
  { situacion: 'proxima', titulo: 'Empiezan pronto', ayuda: 'Pendientes que empiezan en los próximos 30 días.', color: 'yellow' },
  { situacion: 'en_plazo', titulo: 'En plazo', ayuda: 'En marcha o sin fecha de inicio, sin nada urgente.', color: 'green' },
  { situacion: 'futura', titulo: 'Empiezan más adelante', ayuda: 'Pendientes que empiezan dentro de más de 30 días.', color: 'gray' },
]

/** Agrupa las acciones abiertas por situación (orden dentro de cada grupo: el de compararPorUrgencia). */
export function porSituacion<T extends Pick<Accion, 'estado' | 'fecha_inicio' | 'fecha_fin' | 'codigo'>>(
  acciones: T[],
  hoy: string = hoyISO(),
): Record<Exclude<Situacion, 'finalizada'>, T[]> {
  const g: Record<Exclude<Situacion, 'finalizada'>, T[]> = {
    vencida: [], vence_pronto: [], sin_iniciar: [], proxima: [], en_plazo: [], futura: [],
  }
  for (const a of [...acciones].sort((x, y) => compararPorUrgencia(x, y, hoy))) {
    const s = situacion(a, hoy)
    if (s !== 'finalizada') g[s].push(a)
  }
  return g
}
