// Crea (o promociona) la cuenta de administración inicial.
// Uso:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/crear-admin.mjs correo@ua.es 'contraseña-larga' 'Nombre Apellidos'
// La clave de servicio (secret) está en Project Settings > API keys. No la subas nunca al repositorio.
import { createClient } from '@supabase/supabase-js'

const [email, password, nombre = null] = process.argv.slice(2)
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/crear-admin.mjs email password [nombre]')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

let id
const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } })
if (error) {
  if (!/already|registered|exists/i.test(error.message)) throw error
  const { data: lista, error: e } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (e) throw e
  id = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
  console.log('El usuario ya existía; se le asigna el rol de administración.')
} else {
  id = data.user.id
}
const { error: e2 } = await sb.from('perfiles').update({ rol: 'admin', activo: true, nombre }).eq('id', id)
if (e2) throw e2
console.log(`Administrador listo: ${email} (${id})`)
