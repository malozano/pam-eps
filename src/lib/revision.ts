/**
 * Revisión del estado de las acciones (antes de los informes). La abre la administración para el
 * plan del centro o para todos los planes de titulación; una acción está revisada si se ha
 * registrado su seguimiento (o confirmado su estado) desde el inicio de la revisión.
 */
import { useQuery } from '@tanstack/react-query'
import { etiquetaCurso } from './cursos'
import { INFORMES, origenPorDefecto } from './origen'
import { supabase } from './supabase'
import type { Accion } from './tipos'

export type AmbitoRevision = 'centro' | 'titulaciones'

export interface Revision {
  id: number
  ambito: AmbitoRevision
  titulo: string
  inicio: string
  fin: string | null
  completada: string | null
  total: number | null
  revisadas: number | null
}

export interface EstadoAccionRevision {
  accion_id: string
  titulacion: string
  responsable: string | null
  revisada: boolean
}

export const ambitoDe = (titulacion: string): AmbitoRevision => (titulacion === 'CEN' ? 'centro' : 'titulaciones')

export function useRevisiones() {
  return useQuery({
    queryKey: ['revisiones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('revisiones').select('*').order('inicio', { ascending: false })
      if (error) throw error
      return data as Revision[]
    },
  })
}

/** Revisión en curso de un ámbito (si la hay). */
export function useRevisionActiva(ambito: AmbitoRevision | undefined) {
  const { data = [] } = useRevisiones()
  return ambito ? data.find((r) => r.ambito === ambito && !r.fin) : undefined
}

/** Acciones de una revisión que puede ver el usuario y si están revisadas. */
export function useEstadoRevision(revision: number | undefined) {
  return useQuery({
    queryKey: ['estado_revision', revision],
    enabled: revision !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('estado_revision', { p_revision: revision })
      if (error) throw error
      return data as EstadoAccionRevision[]
    },
  })
}

/** Ids de las acciones por revisar de un plan (o de todos los visibles) en la revisión en curso. */
export function usePorRevisar(titulacion: string | null, ambito: AmbitoRevision | undefined) {
  const revision = useRevisionActiva(ambito)
  const { data = [] } = useEstadoRevision(revision?.id)
  const filas = titulacion ? data.filter((x) => x.titulacion === titulacion) : data
  return {
    revision,
    filas,
    porRevisar: new Set(filas.filter((x) => !x.revisada).map((x) => x.accion_id)),
    revisadas: filas.filter((x) => x.revisada).length,
  }
}

/** Confirma el estado actual de una acción (seguimiento sin cambios). */
export async function confirmarEstado(a: Pick<Accion, 'id' | 'estado'>) {
  const { error } = await supabase.rpc('registrar_seguimiento', { p_accion: a.id, p_estado: a.estado })
  if (error) throw error
}

/** Título que se propone al abrir una revisión, según el informe que toca por la época del año. */
export function tituloPropuesto(ambito: AmbitoRevision, hoy = new Date()): string {
  const o = origenPorDefecto(hoy, ambito === 'centro')
  if (!o?.tipo || !o.anyo) return `Revisión del estado del plan del centro (${hoy.toLocaleDateString('es-ES')})`
  const informe = INFORMES.find((i) => i.tipo === o.tipo)!.texto
  return `Revisión para el ${informe.charAt(0).toLowerCase()}${informe.slice(1)} del curso ${etiquetaCurso(o.anyo)}`
}
