import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configuracionCompleta = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true },
})
