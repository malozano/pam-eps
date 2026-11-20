import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { IndicadorCatalogo, Procedimiento } from './indicadores'
import type { Accion, EntradaHistorial } from './tipos'

/**
 * Responsables disponibles para un plan. El plan del centro (CEN) tiene su propio catálogo,
 * que comparte algunos responsables con el de las titulaciones. Mientras no se sepa el
 * ámbito (`undefined`), la consulta espera.
 */
export function useResponsables(ambito: 'centro' | 'titulacion' | undefined) {
  return useQuery({
    queryKey: ['responsables', ambito],
    enabled: ambito !== undefined,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('responsables')
        .select('nombre')
        .eq('activo', true)
        .eq(ambito === 'centro' ? 'para_centro' : 'para_titulaciones', true)
      if (error) throw error
      return data.map((r) => r.nombre as string).sort((a, b) => a.localeCompare(b, 'es'))
    },
  })
}

export function useAccionesTitulacion(titulacion: string) {
  return useQuery({
    queryKey: ['acciones', titulacion],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acciones')
        .select('*')
        .eq('titulacion', titulacion)
        .order('anyo', { ascending: false })
        .order('numero')
      if (error) throw error
      return data as Accion[]
    },
  })
}

export function useHistorial(accionId: string | undefined) {
  return useQuery({
    queryKey: ['historial', accionId],
    enabled: !!accionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historial')
        .select('*')
        .eq('accion_id', accionId!)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
      if (error) throw error
      return data as EntradaHistorial[]
    },
  })
}

/** Catálogo de indicadores y procedimientos (lectura pública). */
export function useCatalogoIndicadores() {
  return useQuery({
    queryKey: ['catalogo_indicadores'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const [ind, proc] = await Promise.all([
        supabase.from('catalogo_indicadores').select('*').order('orden'),
        supabase.from('procedimientos').select('*').order('orden'),
      ])
      if (ind.error) throw ind.error
      if (proc.error) throw proc.error
      const indicadores = ind.data as IndicadorCatalogo[]
      return {
        indicadores,
        procedimientos: proc.data as Procedimiento[],
        porCodigo: new Map(indicadores.map((i) => [i.codigo, i])),
      }
    },
  })
}

/** Número de acciones (de todos los planes) que usan cada indicador del catálogo. */
export function useUsoIndicadores() {
  return useQuery({
    queryKey: ['uso_indicadores'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('uso_indicadores')
      if (error) throw error
      return new Map((data as { codigo: string; acciones: number }[]).map((r) => [r.codigo, Number(r.acciones)]))
    },
  })
}
