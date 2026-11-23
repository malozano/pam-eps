/**
 * Suscripción del dispositivo a las notificaciones push (avisos de plazos).
 */
import { estaInstalada } from '../components/Pwa'
import { supabase } from './supabase'

export type EstadoPush =
  | 'no-soportado' //       navegador sin push
  | 'requiere-instalar' //  iPhone/iPad: solo funciona con la aplicación instalada
  | 'sin-service-worker' // modo desarrollo
  | 'bloqueado' //          el usuario ha denegado el permiso
  | 'inactivo'
  | 'activo'

const esIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)

function base64UrlABytes(b64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Registro del service worker; en la primera visita se espera unos segundos a que se registre. */
async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  if (await navigator.serviceWorker.getRegistration()) return navigator.serviceWorker.ready
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 4000)), // sin service worker (modo desarrollo)
  ])
}

export async function estadoPush(): Promise<EstadoPush> {
  if (esIOS() && !estaInstalada()) return 'requiere-instalar'
  if (!('PushManager' in window) || !('Notification' in window)) return 'no-soportado'
  const r = await registro()
  if (!r) return 'sin-service-worker'
  if (Notification.permission === 'denied') return 'bloqueado'
  const s = await r.pushManager.getSubscription()
  if (!s) return 'inactivo'
  // La suscripción existe en el navegador: comprobar que está registrada en el servidor
  const { data } = await supabase.from('suscripciones_push').select('id').eq('endpoint', s.endpoint).maybeSingle()
  return data ? 'activo' : 'inactivo'
}

async function clavePublica(): Promise<string> {
  const { data } = await supabase.rpc('clave_publica_push')
  if (data) return data as string
  // La primera vez, la Edge Function genera las claves
  const { data: r, error } = await supabase.functions.invoke('enviar-avisos', { body: { modo: 'clave' } })
  if (error) throw error
  return (r as { clave: string }).clave
}

function nombreDispositivo(): string {
  const ua = navigator.userAgent
  const so = /Android/.test(ua) ? 'Android' : esIOS() ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Otro'
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return `${so}${nav ? ' · ' + nav : ''}${estaInstalada() ? ' · app' : ''}`
}

export async function activarPush(perfilId: string): Promise<void> {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No se ha concedido el permiso de notificaciones')
  const r = await registro()
  if (!r) throw new Error('La aplicación no tiene service worker (¿modo desarrollo?)')
  const s =
    (await r.pushManager.getSubscription()) ??
    (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(await clavePublica()) }))
  const j = s.toJSON()
  const { error } = await supabase.from('suscripciones_push').upsert(
    { perfil_id: perfilId, endpoint: s.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, dispositivo: nombreDispositivo() },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

export async function desactivarPush(): Promise<void> {
  const r = await registro()
  const s = await r?.pushManager.getSubscription()
  if (!s) return
  await supabase.from('suscripciones_push').delete().eq('endpoint', s.endpoint)
  await s.unsubscribe()
}

export async function enviarPrueba(): Promise<{ dispositivos: number; enviadas: number }> {
  const { data, error } = await supabase.functions.invoke('enviar-avisos', { body: { modo: 'prueba' } })
  if (error) throw error
  return data as { dispositivos: number; enviadas: number }
}

export interface EstadoEmail {
  email: boolean
  faltan?: string[]
  host?: string | null
  puerto?: number
  remitente?: string | null
  /** 'ok' o el mensaje de error al probar la conexión SMTP (solo si se pide verificar) */
  conexion?: string
  /** Error al consultar el estado (la función no responde, sin permisos…) */
  error?: string
}

async function mensajeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  const detalle = ctx ? await ctx.json().catch(() => null) : null
  return detalle?.error ?? (error instanceof Error ? error.message : String(error))
}

/** Estado del envío de avisos por email en el servidor (secretos SMTP). */
export async function estadoEmail(verificar = false): Promise<EstadoEmail> {
  const { data, error } = await supabase.functions.invoke('enviar-avisos', { body: { modo: 'estado', verificar } })
  if (error) return { email: false, error: await mensajeError(error) }
  return data as EstadoEmail
}

export async function enviarEmailPrueba(): Promise<void> {
  const { error } = await supabase.functions.invoke('enviar-avisos', { body: { modo: 'prueba', canal: 'email' } })
  if (error) throw new Error(await mensajeError(error))
}

/** Envía ya a quien llama su resumen mensual. Devuelve cuántas acciones incluye (0 = no se envía). */
export async function enviarMiResumen(): Promise<{ enviado: boolean; acciones: number; email: string }> {
  const { data, error } = await supabase.functions.invoke('enviar-avisos', { body: { modo: 'resumen' } })
  if (error) throw new Error(await mensajeError(error))
  return data as { enviado: boolean; acciones: number; email: string }
}
