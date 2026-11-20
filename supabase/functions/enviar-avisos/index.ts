// Edge Function: envío de avisos de plazos por notificación push (el email se añadirá más adelante).
//
// POST JSON:
//   { modo: 'tarea', secreto }  -> tarea programada diaria (pg_cron): genera y envía los avisos
//   { modo: 'ejecutar' }        -> igual, lanzado a mano por administración (con su sesión)
//   { modo: 'prueba' }          -> envía una notificación de prueba a los dispositivos de quien llama
//   { modo: 'clave' }           -> devuelve la clave pública VAPID (la genera la primera vez)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Db = SupabaseClient

async function config(db: Db, clave: string): Promise<string | null> {
  const { data, error } = await db.rpc('config_privada', { p_clave: clave })
  if (error) throw error
  return data as string | null
}

/** Claves VAPID: se generan y guardan la primera vez. */
async function clavesVapid(db: Db) {
  let publica = await config(db, 'vapid_publica')
  let privada = await config(db, 'vapid_privada')
  if (!publica || !privada) {
    const k = webpush.generateVAPIDKeys()
    publica = k.publicKey
    privada = k.privateKey
    for (const [clave, valor] of [['vapid_publica', publica], ['vapid_privada', privada]]) {
      const { error } = await db.rpc('guardar_config_privada', { p_clave: clave, p_valor: valor })
      if (error) throw error
    }
  }
  return { publica, privada }
}

async function prepararWebPush(db: Db) {
  const { publica, privada } = await clavesVapid(db)
  const { data: ajustes } = await db.from('ajustes_avisos').select('url_app').single()
  // El «subject» VAPID debe ser una URL https o mailto
  const subject = ajustes?.url_app?.startsWith('https://') ? ajustes.url_app : 'https://github.com/malozano/pam-eps'
  webpush.setVapidDetails(subject, publica, privada)
  return ajustes?.url_app ?? ''
}

interface Suscripcion {
  id: string
  perfil_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Envía a todas las suscripciones; borra las que ya no existen (404/410). Devuelve cuántas llegaron. */
async function enviar(db: Db, subs: Suscripcion[], mensaje: Record<string, unknown>) {
  let ok = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(mensaje),
        { TTL: 60 * 60 * 24 * 3 },
      )
      ok++
    } catch (e) {
      const codigo = (e as { statusCode?: number }).statusCode
      if (codigo === 404 || codigo === 410) await db.from('suscripciones_push').delete().eq('id', s.id)
      else console.error('Error al enviar push', codigo, (e as Error).message)
    }
  }
  return ok
}

const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const ESTADO: Record<string, string> = { pendiente: 'pendiente', en_proceso: 'en proceso' }

interface AvisoPendiente {
  id: number
  tipo: 'inicio' | 'fin_proximo' | 'vencida'
  perfil_id: string
  acciones: { id: string; codigo: string; nombre: string; titulacion: string; estado: string; fecha_inicio: string | null; fecha_fin: string | null }
  perfiles: { avisos_push: boolean }
}

function mensajeAviso(a: AvisoPendiente, urlApp: string) {
  const ac = a.acciones
  const nombre = ac.nombre.length > 110 ? ac.nombre.slice(0, 107) + '…' : ac.nombre
  const dias = ac.fecha_fin ? Math.round((Date.parse(ac.fecha_fin) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000) : 0
  const textos = {
    inicio: { title: `Empieza ${ac.codigo}`, body: `${nombre}\nInicio: ${fecha(ac.fecha_inicio)}` },
    fin_proximo: { title: `Quedan ${dias} días: ${ac.codigo}`, body: `${nombre}\nFin: ${fecha(ac.fecha_fin)}` },
    vencida: {
      title: `Plazo vencido: ${ac.codigo}`,
      body: `${nombre}\nTerminó el ${fecha(ac.fecha_fin)} y sigue ${ESTADO[ac.estado] ?? ac.estado}`,
    },
  }[a.tipo]
  return { ...textos, url: `${urlApp}gestion/${ac.titulacion}/accion/${ac.id}`, tag: `${ac.codigo}-${a.tipo}` }
}

async function procesar(db: Db) {
  const urlApp = await prepararWebPush(db)
  const { data: generados, error: e1 } = await db.rpc('generar_avisos')
  if (e1) throw e1

  const { data: pendientes, error: e2 } = await db
    .from('avisos')
    .select('id, tipo, perfil_id, acciones(id, codigo, nombre, titulacion, estado, fecha_inicio, fecha_fin), perfiles(avisos_push)')
    .is('enviado_push', null)
    .limit(1000)
  if (e2) throw e2
  const avisos = (pendientes ?? []) as unknown as AvisoPendiente[]

  const perfiles = Array.from(new Set(avisos.map((a) => a.perfil_id)))
  const { data: subs, error: e3 } = perfiles.length
    ? await db.from('suscripciones_push').select('*').in('perfil_id', perfiles)
    : { data: [], error: null }
  if (e3) throw e3

  let notificaciones = 0
  for (const a of avisos) {
    if (a.perfiles?.avisos_push) {
      const propias = (subs as Suscripcion[]).filter((s) => s.perfil_id === a.perfil_id)
      notificaciones += await enviar(db, propias, mensajeAviso(a, urlApp))
    }
    await db.from('avisos').update({ enviado_push: new Date().toISOString() }).eq('id', a.id)
  }
  const resultado = { generados, procesados: avisos.length, notificaciones }
  await db.from('ajustes_avisos').update({ ultima_ejecucion: new Date().toISOString(), ultimo_resultado: resultado }).eq('id', true)
  return resultado
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    /* sin cuerpo */
  }

  try {
    // Tarea programada: se autentica con el secreto guardado en la base de datos
    if (body.modo === 'tarea') {
      const secreto = await config(db, 'secreto_tarea')
      if (!secreto || body.secreto !== secreto) return respuesta({ error: 'No autorizado' }, 401)
      return respuesta(await procesar(db))
    }

    // El resto de modos requieren sesión de usuario
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: quien } = await db.auth.getUser(jwt)
    if (!quien?.user) return respuesta({ error: 'No autenticado' }, 401)
    const { data: perfil } = await db.from('perfiles').select('rol, activo').eq('id', quien.user.id).single()
    if (!perfil?.activo) return respuesta({ error: 'Usuario inactivo' }, 403)

    switch (body.modo) {
      case 'clave': {
        const { publica } = await clavesVapid(db)
        return respuesta({ clave: publica })
      }
      case 'prueba': {
        const urlApp = await prepararWebPush(db)
        const { data: subs } = await db.from('suscripciones_push').select('*').eq('perfil_id', quien.user.id)
        const enviadas = await enviar(db, (subs ?? []) as Suscripcion[], {
          title: 'Notificación de prueba',
          body: 'Las notificaciones de los planes de mejora funcionan en este dispositivo.',
          url: urlApp,
          tag: 'prueba',
        })
        return respuesta({ dispositivos: (subs ?? []).length, enviadas })
      }
      case 'ejecutar': {
        if (perfil.rol !== 'admin') return respuesta({ error: 'Solo administración' }, 403)
        return respuesta(await procesar(db))
      }
      default:
        return respuesta({ error: 'Modo desconocido' }, 400)
    }
  } catch (e) {
    console.error(e)
    return respuesta({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
