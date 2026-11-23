/**
 * Consultas sobre todas las acciones (administración): filtros, pendientes por responsable con
 * listados para copiar, y estadísticas.
 */
import { etiquetaCurso } from './cursos'
import { fechaCorta } from './formato'
import { normalizar } from './importacion'
import { diasHasta, enPlanDelCurso, estaAbierta, hoyISO, situacion, type Situacion } from './seguimiento'
import type { Accion, EstadoAccion } from './tipos'

// ---------------------------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------------------------
export interface FiltrosConsulta {
  titulaciones: string[] //   vacío = todas
  anyos: number[] //          curso de la acción; vacío = todos
  estados: EstadoAccion[]
  responsables: string[]
  situaciones: Situacion[] // vencida, sin_iniciar, proxima, en_plazo, finalizada
  texto: string
  /** Rango de fechas: acciones activas en algún momento del rango (inicio ≤ hasta y fin ≥ desde) */
  desde: string | null
  hasta: string | null
  soloMejora: boolean
  incluirCerradas: boolean
}

export const FILTROS_VACIOS: FiltrosConsulta = {
  titulaciones: [], anyos: [], estados: [], responsables: [], situaciones: [], texto: '',
  desde: null, hasta: null, soloMejora: false, incluirCerradas: true,
}

export function filtrarAcciones<T extends Accion>(acciones: T[], f: FiltrosConsulta, hoy = hoyISO()): T[] {
  const palabras = normalizar(f.texto).split(' ').filter(Boolean)
  return acciones.filter((a) => {
    if (f.titulaciones.length && !f.titulaciones.includes(a.titulacion)) return false
    if (f.anyos.length && !f.anyos.includes(a.anyo)) return false
    if (f.estados.length && !f.estados.includes(a.estado)) return false
    if (f.responsables.length && !f.responsables.includes(a.responsable ?? '')) return false
    if (f.situaciones.length && !f.situaciones.includes(situacion(a, hoy))) return false
    if (f.soloMejora && !a.es_mejora) return false
    if (!f.incluirCerradas && a.cerrada) return false
    if (f.desde && (a.fecha_fin ?? a.fecha_inicio ?? '9999') < f.desde) return false
    if (f.hasta && (a.fecha_inicio ?? a.fecha_fin ?? '0000') > f.hasta) return false
    if (palabras.length) {
      const t = normalizar(`${a.codigo} ${a.nombre} ${a.tareas ?? ''} ${a.responsable ?? ''} ${a.observaciones ?? ''} ${a.indicadores.join(' ')}`)
      if (!palabras.every((p) => t.includes(p))) return false
    }
    return true
  })
}

// ---------------------------------------------------------------------------------------------
// Pendientes por responsable
// ---------------------------------------------------------------------------------------------
export interface GrupoResponsable<T> {
  clave: string
  titulacion: string | null //  null cuando se agrupa solo por responsable (un único plan)
  responsable: string
  acciones: T[]
  vencidas: number
}

const SIN_RESPONSABLE = 'Sin responsable asignado'

/**
 * Acciones abiertas (pendientes o en proceso) agrupadas por responsable (y por plan si hay varios).
 * Dentro de cada grupo, primero las vencidas y después por fecha de fin. Los grupos con más
 * vencidas y más acciones van primero.
 */
export function pendientesPorResponsable<T extends Accion>(acciones: T[], porPlan: boolean, hoy = hoyISO()): GrupoResponsable<T>[] {
  const grupos = new Map<string, GrupoResponsable<T>>()
  for (const a of acciones) {
    if (!estaAbierta(a.estado)) continue
    const responsable = a.responsable?.trim() || SIN_RESPONSABLE
    const clave = porPlan ? `${a.titulacion}|${responsable}` : responsable
    const g = grupos.get(clave) ?? { clave, titulacion: porPlan ? a.titulacion : null, responsable, acciones: [], vencidas: 0 }
    g.acciones.push(a)
    if (situacion(a, hoy) === 'vencida') g.vencidas++
    grupos.set(clave, g)
  }
  for (const g of grupos.values())
    g.acciones.sort(
      (x, y) =>
        Number(situacion(y, hoy) === 'vencida') - Number(situacion(x, hoy) === 'vencida') ||
        (x.fecha_fin ?? '9999').localeCompare(y.fecha_fin ?? '9999') ||
        x.codigo.localeCompare(y.codigo),
    )
  return [...grupos.values()].sort(
    (a, b) =>
      b.vencidas - a.vencidas ||
      b.acciones.length - a.acciones.length ||
      (a.titulacion ?? '').localeCompare(b.titulacion ?? '') ||
      a.responsable.localeCompare(b.responsable, 'es'),
  )
}

const ESTADO_TXT: Record<EstadoAccion, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', completada: 'Completada', cancelada: 'Cancelada',
}

/** Texto para pegar en un correo: una entrada por acción, con el plazo y si ha vencido. */
export function textoListado<T extends Accion>(g: GrupoResponsable<T>, urlApp: string, hoy = hoyISO(), titulo = 'Acciones abiertas'): string {
  const lineas = g.acciones.map((a) => {
    const s = situacion(a, hoy)
    const plazo =
      s === 'vencida' && a.fecha_fin
        ? `PLAZO VENCIDO el ${fechaCorta(a.fecha_fin)} (hace ${-diasHasta(a.fecha_fin, hoy)} días)`
        : `Plazo: ${fechaCorta(a.fecha_inicio)} – ${fechaCorta(a.fecha_fin)}`
    const bloque = (titulo: string, texto: string | null) => {
      const l = (texto ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
      if (!l.length) return ''
      return l.length === 1 ? `\n   ${titulo}: ${l[0]}` : `\n   ${titulo}:${l.map((x) => `\n     ${x}`).join('')}`
    }
    return `• ${a.codigo}. ${a.nombre.trim()}${bloque('Tareas', a.tareas)}\n   Estado: ${ESTADO_TXT[a.estado]}. ${plazo}.${bloque('Observaciones', a.observaciones)}${
      urlApp ? `\n   ${urlApp}gestion/${a.titulacion}/accion/${a.id}` : ''
    }`
  })
  const cabecera = `${titulo} de ${g.responsable}${g.titulacion ? ` (plan ${g.titulacion})` : ''}: ${g.acciones.length}${
    g.vencidas ? `, ${g.vencidas} con el plazo vencido` : ''
  }`
  return `${cabecera}\n\n${lineas.join('\n\n')}`
}

// ---------------------------------------------------------------------------------------------
// Estadísticas
// ---------------------------------------------------------------------------------------------
export const ESTADOS_ORDEN: EstadoAccion[] = ['completada', 'en_proceso', 'pendiente', 'cancelada']

/** Número de acciones (de mejora) por titulación y curso. */
export function accionesPorTitulacionYCurso(acciones: Accion[]) {
  const anyos = [...new Set(acciones.map((a) => a.anyo))].sort()
  const filas = new Map<string, Record<number, number>>()
  for (const a of acciones) {
    const f = filas.get(a.titulacion) ?? {}
    f[a.anyo] = (f[a.anyo] ?? 0) + 1
    filas.set(a.titulacion, f)
  }
  const max = Math.max(0, ...[...filas.values()].flatMap((f) => Object.values(f)))
  return { anyos, cursos: anyos.map(etiquetaCurso), filas, max }
}

/** Estado del plan de un curso por titulación (mismo criterio que el plan publicado). */
export function estadoPlanPorTitulacion(acciones: Accion[], anyo: number, hoy = hoyISO()) {
  const res = new Map<string, Record<EstadoAccion, number> & { total: number; vencidas: number }>()
  for (const a of acciones) {
    if (!enPlanDelCurso(a, anyo)) continue
    const r = res.get(a.titulacion) ?? { pendiente: 0, en_proceso: 0, completada: 0, cancelada: 0, total: 0, vencidas: 0 }
    r[a.estado]++
    r.total++
    if (situacion(a, hoy) === 'vencida') r.vencidas++
    res.set(a.titulacion, r)
  }
  return res
}

/** Distribución por responsable: total, abiertas, vencidas y número de planes en los que aparece. */
export function accionesPorResponsable(acciones: Accion[], hoy = hoyISO()) {
  const res = new Map<string, { total: number; abiertas: number; vencidas: number; planes: Set<string> }>()
  for (const a of acciones) {
    const k = a.responsable?.trim() || SIN_RESPONSABLE
    const r = res.get(k) ?? { total: 0, abiertas: 0, vencidas: 0, planes: new Set<string>() }
    r.total++
    if (estaAbierta(a.estado)) r.abiertas++
    if (situacion(a, hoy) === 'vencida') r.vencidas++
    r.planes.add(a.titulacion)
    res.set(k, r)
  }
  return [...res.entries()]
    .map(([responsable, r]) => ({ responsable, ...r, planes: r.planes.size }))
    .sort((a, b) => b.total - a.total || a.responsable.localeCompare(b.responsable, 'es'))
}

/** Evolución por curso: acciones propuestas y su estado actual. */
export function evolucionPorCurso(acciones: Accion[]) {
  const res = new Map<number, Record<EstadoAccion, number> & { total: number }>()
  for (const a of acciones) {
    const r = res.get(a.anyo) ?? { pendiente: 0, en_proceso: 0, completada: 0, cancelada: 0, total: 0 }
    r[a.estado]++
    r.total++
    res.set(a.anyo, r)
  }
  return [...res.entries()].sort(([x], [y]) => x - y).map(([anyo, r]) => ({ anyo, curso: etiquetaCurso(anyo), ...r }))
}
