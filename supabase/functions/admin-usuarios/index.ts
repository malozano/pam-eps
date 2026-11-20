// Edge Function: gestión de cuentas de usuario por el administrador.
// Necesita la clave de servicio (solo disponible en el servidor de Supabase),
// por eso no puede hacerse desde el navegador.
//
// Acciones (POST JSON):
//   { accion: 'crear', email, password, nombre?, rol, titulaciones: string[] }
//   { accion: 'password', id, password }
//   { accion: 'borrar', id }
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Identificar a quien llama y comprobar que es administrador activo
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: quien, error: errUsuario } = await admin.auth.getUser(jwt)
  if (errUsuario || !quien.user) return respuesta({ error: 'No autenticado' }, 401)
  const { data: perfil } = await admin.from('perfiles').select('rol, activo').eq('id', quien.user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.activo) return respuesta({ error: 'Solo administración' }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return respuesta({ error: 'JSON no válido' }, 400)
  }

  try {
    switch (body.accion) {
      case 'crear': {
        const email = String(body.email ?? '').trim().toLowerCase()
        const password = String(body.password ?? '')
        const nombre = body.nombre ? String(body.nombre).trim() : null
        const rol = body.rol === 'admin' ? 'admin' : 'coordinador'
        const titulaciones = Array.isArray(body.titulaciones) ? body.titulaciones.map(String) : []
        if (!/^\S+@\S+\.\S+$/.test(email)) return respuesta({ error: 'Email no válido' }, 400)
        if (password.length < 10) return respuesta({ error: 'La contraseña debe tener al menos 10 caracteres' }, 400)

        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { nombre },
        })
        if (error) return respuesta({ error: error.message }, 400)
        const id = data.user.id
        // El trigger on_auth_user_created ya ha creado el perfil; completamos rol y titulaciones
        const { error: e1 } = await admin.from('perfiles').update({ nombre, rol }).eq('id', id)
        if (e1) throw e1
        if (titulaciones.length) {
          const { error: e2 } = await admin
            .from('perfil_titulacion')
            .insert(titulaciones.map((t: string) => ({ perfil_id: id, titulacion: t })))
          if (e2) throw e2
        }
        return respuesta({ id })
      }
      case 'password': {
        const password = String(body.password ?? '')
        if (password.length < 10) return respuesta({ error: 'La contraseña debe tener al menos 10 caracteres' }, 400)
        const { error } = await admin.auth.admin.updateUserById(String(body.id), { password })
        if (error) return respuesta({ error: error.message }, 400)
        return respuesta({ ok: true })
      }
      case 'borrar': {
        if (String(body.id) === quien.user.id) return respuesta({ error: 'No puedes borrar tu propio usuario' }, 400)
        const { error } = await admin.auth.admin.deleteUser(String(body.id))
        if (error) return respuesta({ error: error.message }, 400)
        return respuesta({ ok: true })
      }
      default:
        return respuesta({ error: 'Acción desconocida' }, 400)
    }
  } catch (e) {
    return respuesta({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
