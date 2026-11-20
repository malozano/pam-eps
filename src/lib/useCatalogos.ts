import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Accion } from './tipos'

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
