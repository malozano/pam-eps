// Edge Function: envío de avisos de plazos por notificación push y por email.
//
// POST JSON:
//   { modo: 'tarea', secreto }  -> tarea programada diaria (pg_cron): genera y envía los avisos
//   { modo: 'ejecutar' }        -> igual, lanzado a mano por administración (con su sesión)
//   { modo: 'prueba', canal? }  -> notificación (canal 'push', por defecto) o email ('email') de prueba
//                                  a quien llama
//   { modo: 'clave' }           -> devuelve la clave pública VAPID (la genera la primera vez)
//   { modo: 'estado', verificar? } -> si el email está configurado (qué variables faltan, por nombre) y,
//                                  con verificar (solo administración), prueba la conexión SMTP
//
// Email: por SMTP con SSL (puerto 465; Supabase bloquea los puertos 25 y 587). Se configura con los
// secretos de la función SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS y SMTP_FROM
// (p. ej. «Planes de mejora EPS <cuenta@gmail.com>»). Sin ellos, solo se envían notificaciones push.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@10.6.1'
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

// ---------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------
function transporteEmail() {
  const host = Deno.env.get('SMTP_HOST')?.trim()
  const user = Deno.env.get('SMTP_USER')?.trim()
  // las contraseñas de aplicación de Google se muestran con espacios: se quitan
  const pass = Deno.env.get('SMTP_PASS')?.replace(/\s+/g, '')
  if (!host || !user || !pass) return null
  const port = Number(Deno.env.get('SMTP_PORT')?.trim() || 465)
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
}
const remitente = () => Deno.env.get('SMTP_FROM') ?? `Planes de mejora EPS <${Deno.env.get('SMTP_USER')}>`

const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function cuerpoEmail(m: { title: string; body: string; url: string }, urlApp: string) {
  const lineas = m.body.split('\n')
  const texto = `${m.title}\n\n${m.body}\n\nVer la acción: ${m.url}\n\n--\nAviso automático de los planes de acciones de mejora de la Escuela Politécnica Superior.\nPuedes desactivar los avisos por email en «Mi cuenta → Notificaciones»: ${urlApp}perfil`
  const cuerpo = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1b1e">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e3e5e8">
<tr><td style="padding:20px 24px;border-bottom:3px solid #4263eb">
<div style="font-size:12px;color:#6b7280">Escuela Politécnica Superior · Planes de acciones de mejora</div>
<div style="font-size:18px;font-weight:bold;margin-top:4px">${html(m.title)}</div></td></tr>
<tr><td style="padding:20px 24px;font-size:15px;line-height:1.5">
<p style="margin:0 0 8px;font-weight:bold">${html(lineas[0] ?? '')}</p>
${lineas.slice(1).map((l) => `<p style="margin:0 0 8px;color:#374151">${html(l)}</p>`).join('')}
<p style="margin:20px 0 0"><a href="${html(m.url)}" style="display:inline-block;background:#4263eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">Ver la acción</a></p>
</td></tr>
<tr><td style="padding:14px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e3e5e8">
Aviso automático. Puedes desactivar los avisos por email en <a href="${html(urlApp)}perfil" style="color:#4263eb">Mi cuenta → Notificaciones</a>.
</td></tr></table></body></html>`
  return { text: texto, html: cuerpo }
}

async function enviarEmail(
  t: ReturnType<typeof transporteEmail>,
  para: string,
  m: { title: string; body: string; url: string },
  urlApp: string,
) {
  if (!t) return false
  try {
    await t.sendMail({ from: remitente(), to: para, subject: m.title, ...cuerpoEmail(m, urlApp) })
    return true
  } catch (e) {
    console.error('Error al enviar email a', para, (e as Error).message)
    return false
  }
}

const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const ESTADO: Record<string, string> = { pendiente: 'pendiente', en_proceso: 'en proceso' }

interface AvisoPendiente {
  id: number
  tipo: 'inicio' | 'fin_proximo' | 'vencida'
  perfil_id: string
  acciones: { id: string; codigo: string; nombre: string; titulacion: string; estado: string; fecha_inicio: string | null; fecha_fin: string | null }
  perfiles: { avisos_push: boolean; avisos_email: boolean; email: string }
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
    .select(
      'id, tipo, perfil_id, enviado_push, enviado_email, acciones(id, codigo, nombre, titulacion, estado, fecha_inicio, fecha_fin), perfiles(avisos_push, avisos_email, email)',
    )
    .or('enviado_push.is.null,enviado_email.is.null')
    // los avisos antiguos que no se pudieron enviar por email (p. ej. sin SMTP configurado) no se acumulan
    .gte('creado', new Date(Date.now() - 3 * 86400000).toISOString())
    .limit(1000)
  if (e2) throw e2
  const avisos = (pendientes ?? []) as unknown as (AvisoPendiente & { enviado_push: string | null; enviado_email: string | null })[]
  const smtp = transporteEmail()

  const perfiles = Array.from(new Set(avisos.map((a) => a.perfil_id)))
  const { data: subs, error: e3 } = perfiles.length
    ? await db.from('suscripciones_push').select('*').in('perfil_id', perfiles)
    : { data: [], error: null }
  if (e3) throw e3

  let notificaciones = 0
  let emails = 0
  for (const a of avisos) {
    const m = mensajeAviso(a, urlApp)
    const cambios: Record<string, string> = {}
    if (!a.enviado_push) {
      if (a.perfiles?.avisos_push) {
        const propias = (subs as Suscripcion[]).filter((s) => s.perfil_id === a.perfil_id)
        notificaciones += await enviar(db, propias, m)
      }
      cambios.enviado_push = new Date().toISOString()
    }
    // Email: si no está configurado, el aviso queda pendiente (unos días) por si se configura
    if (!a.enviado_email && smtp) {
      if (a.perfiles?.avisos_email && (await enviarEmail(smtp, a.perfiles.email, m, urlApp))) emails++
      cambios.enviado_email = new Date().toISOString()
    }
    if (Object.keys(cambios).length) await db.from('avisos').update(cambios).eq('id', a.id)
  }
  const resultado = { generados, procesados: avisos.length, notificaciones, emails, email_configurado: !!smtp }
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
      case 'estado': {
        // Diagnóstico: nombres de las variables que faltan (nunca sus valores)
        const faltan = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((v) => !Deno.env.get(v)?.trim())
        const smtp = transporteEmail()
        const info: Record<string, unknown> = {
          email: !!smtp,
          faltan,
          host: Deno.env.get('SMTP_HOST') ?? null,
          puerto: Number(Deno.env.get('SMTP_PORT') ?? 465),
          remitente: smtp ? remitente() : null,
        }
        if (body.verificar && smtp) {
          if (perfil.rol !== 'admin') return respuesta({ error: 'Solo administración' }, 403)
          try {
            await smtp.verify()
            info.conexion = 'ok'
          } catch (e) {
            info.conexion = (e as Error).message
          }
        }
        return respuesta(info)
      }
      case 'prueba': {
        const urlApp = await prepararWebPush(db)
        if (body.canal === 'email') {
          const smtp = transporteEmail()
          if (!smtp) return respuesta({ error: 'El envío por email no está configurado' }, 400)
          const ok = await enviarEmail(smtp, quien.user.email!, {
            title: 'Email de prueba',
            body: 'Los avisos por email de los planes de mejora funcionan.\nRecibirás aquí los avisos de plazos de tus acciones.',
            url: urlApp,
          }, urlApp)
          return ok ? respuesta({ enviado: true }) : respuesta({ error: 'No se ha podido enviar el email (revisa la configuración SMTP)' }, 502)
        }
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
