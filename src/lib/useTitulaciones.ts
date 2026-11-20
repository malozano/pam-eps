import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Titulacion } from './tipos'

export function useTitulaciones() {
  return useQuery({
    queryKey: ['titulaciones'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('titulaciones').select('*').order('orden').order('nombre')
      if (error) throw error
      return data as Titulacion[]
    },
  })
}
