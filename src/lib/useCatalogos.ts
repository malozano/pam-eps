import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Accion } from './tipos'

export function useResponsables() {
  return useQuery({
    queryKey: ['responsables'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('responsables').select('nombre').eq('activo', true).order('orden')
      if (error) throw error
      return data.map((r) => r.nombre as string)
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
