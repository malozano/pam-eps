import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/tipos'

interface AuthState {
  cargando: boolean
  session: Session | null
  perfil: Perfil | null
  /** Códigos de titulación que el usuario gestiona (el admin gestiona todas). */
  titulaciones: string[]
  esAdmin: boolean
  salir: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [titulaciones, setTitulaciones] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setCargando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) {
      setPerfil(null)
      setTitulaciones([])
      return
    }
    let cancelado = false
    setCargando(true)
    Promise.all([
      supabase.from('perfiles').select('*').eq('id', userId).single(),
      supabase.from('perfil_titulacion').select('titulacion').eq('perfil_id', userId),
    ]).then(([p, t]) => {
      if (cancelado) return
      setPerfil((p.data as Perfil) ?? null)
      setTitulaciones((t.data ?? []).map((r) => r.titulacion as string))
      setCargando(false)
    })
    return () => {
      cancelado = true
    }
  }, [userId])

  const valor: AuthState = {
    cargando,
    session,
    perfil,
    titulaciones,
    esAdmin: perfil?.rol === 'admin' && perfil.activo,
    salir: async () => {
      await supabase.auth.signOut()
    },
  }
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
