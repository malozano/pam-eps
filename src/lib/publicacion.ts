/** Qué planes se muestran en la web pública (lo decide la administración en «Ajustes»). */
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { TipoTitulacion } from './tipos'

export interface AjustesPublicacion {
  centro: boolean
  titulaciones: boolean
}

export function usePublicacion() {
  return useQuery({
    queryKey: ['ajustes_publicacion'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ajustes_publicacion').select('centro, titulaciones').single()
      if (error) throw error
      return data as AjustesPublicacion
    },
  })
}

export const estaPublicado = (p: AjustesPublicacion | undefined, tipo: TipoTitulacion) =>
  !!p && (tipo === 'centro' ? p.centro : p.titulaciones)
