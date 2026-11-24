// Resumen mensual de acciones por correo: selección de acciones según el destinatario, grupos por
// situación y redacción (texto y HTML). Sin dependencias para poder probarlo también con vitest.
// Las situaciones y sus reglas son las mismas que en la aplicación (situacion() y GRUPOS_SITUACION
// en src/lib/seguimiento.ts); src/lib/resumen.test.ts comprueba que coinciden.

export type Prioridad = 'vencida' | 'vence_pronto' | 'sin_iniciar' | 'proxima' | 'en_plazo' | 'futura'

export interface AccionR {
  id: string
  codigo: string
  nombre: string
  tareas: string | null
  titulacion: string
  responsable: string | null
  estado: string
  fecha_inicio: string | null
  fecha_fin: string | null
}

export interface Bloque {
  titulo?: string
  nota?: string
  acciones: AccionR[]
  verResponsable: boolean
}

const DIAS_PRONTO = 60 //  «Vence pronto»: fin en los próximos 60 días
const DIAS_AVISO = 30 //   «Empieza pronto»: inicio en los próximos 30 días
const ABIERTOS = ['pendiente', 'en_proceso']
const ESTADO: Record<string, string> = { pendiente: 'Pendiente', en_proceso: 'En proceso' }

const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000)
const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')

/** Situación de una acción abierta (null si está completada o cancelada). */
export function prioridad(a: AccionR, hoy: string): Prioridad | null {
  if (!ABIERTOS.includes(a.estado)) return null
  if (a.fecha_fin && a.fecha_fin < hoy) return 'vencida'
  if (a.fecha_fin && dias(hoy, a.fecha_fin) <= DIAS_PRONTO) return 'vence_pronto'
  if (a.estado === 'pendiente' && a.fecha_inicio) {
    if (a.fecha_inicio <= hoy) return 'sin_iniciar'
    if (dias(hoy, a.fecha_inicio) <= DIAS_AVISO) return 'proxima'
    return 'futura'
  }
  return 'en_plazo'
}

export const NIVELES: { p: Prioridad; titulo: string; color: string }[] = [
  { p: 'vencida', titulo: 'Plazo vencido', color: '#c92a2a' },
  { p: 'vence_pronto', titulo: 'Vencen pronto', color: '#d9480f' },
  { p: 'sin_iniciar', titulo: 'Deberían haber empezado', color: '#9c36b5' },
  { p: 'proxima', titulo: 'Empiezan pronto', color: '#e67700' },
  { p: 'en_plazo', titulo: 'En plazo', color: '#2b8a3e' },
  { p: 'futura', titulo: 'Empiezan más adelante', color: '#495057' },
]

/** Agrupa por situación; dentro de cada grupo, por fecha de fin y código (como en la aplicación). */
export function porPrioridad(acciones: AccionR[], hoy: string): Record<Prioridad, AccionR[]> {
  const g: Record<Prioridad, AccionR[]> = { vencida: [], vence_pronto: [], sin_iniciar: [], proxima: [], en_plazo: [], futura: [] }
  for (const a of acciones) {
    const p = prioridad(a, hoy)
    if (p) g[p].push(a)
  }
  const k = (s: string | null) => s ?? '9999'
  for (const lista of Object.values(g))
    lista.sort((x, y) => k(x.fecha_fin).localeCompare(k(y.fecha_fin)) || x.codigo.localeCompare(y.codigo))
  return g
}

// ---------------------------------------------------------------------------------------------
// Qué acciones recibe cada persona
// ---------------------------------------------------------------------------------------------
export interface Destinatario {
  rol: 'admin' | 'coordinador' | 'transversal'
  titulaciones: string[] // coordinación: los planes que gestiona
  responsabilidades: string[] // transversal: sus responsabilidades del plan del centro
}

/**
 * - Administración: todo el plan del centro, separando las acciones sin cuenta responsable (las
 *   gestiona la administración) de las que tienen una cuenta transversal asignada.
 * - Coordinación transversal: sus acciones del plan del centro.
 * - Coordinación de titulación: su plan (o planes), uno por bloque.
 * `conCuenta`: responsables del plan del centro con una cuenta transversal activa.
 */
export function bloquesPara(
  d: Destinatario,
  abiertas: AccionR[],
  conCuenta: Set<string>,
  nombreTitulacion: (codigo: string) => string,
): Bloque[] {
  const abiertasDe = (t: string) => abiertas.filter((a) => a.titulacion === t && ABIERTOS.includes(a.estado))
  if (d.rol === 'admin') {
    const cen = abiertasDe('CEN')
    const sin = cen.filter((a) => !a.responsable || !conCuenta.has(a.responsable))
    const con = cen.filter((a) => a.responsable && conCuenta.has(a.responsable))
    return [
      {
        titulo: 'Plan del centro: acciones sin cuenta responsable',
        nota: 'No tienen una cuenta de coordinación transversal asignada (o no tienen responsable): su seguimiento depende de ti.',
        acciones: sin,
        verResponsable: true,
      },
      {
        titulo: 'Plan del centro: acciones con cuenta responsable',
        nota: 'Las gestionan las cuentas de coordinación transversal; recibirás un aviso cuando registren su seguimiento.',
        acciones: con,
        verResponsable: true,
      },
    ].filter((b) => b.acciones.length > 0)
  }
  if (d.rol === 'transversal') {
    const mias = abiertasDe('CEN').filter((a) => a.responsable && d.responsabilidades.includes(a.responsable))
    return mias.length ? [{ acciones: mias, verResponsable: d.responsabilidades.length > 1 }] : []
  }
  return [...d.titulaciones]
    .sort((a, b) => (a === 'CEN' ? -1 : b === 'CEN' ? 1 : a.localeCompare(b)))
    .map((t) => ({
      titulo: d.titulaciones.length > 1 ? `${t} · ${nombreTitulacion(t)}` : undefined,
      acciones: abiertasDe(t),
      verResponsable: true,
    }))
    .filter((b) => b.acciones.length > 0)
}

// ---------------------------------------------------------------------------------------------
// Redacción
// ---------------------------------------------------------------------------------------------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const unaLinea = (s: string, n: number) => {
  const t = s.replace(/\s*\n\s*/g, ' · ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`)

export function textoPlazo(a: AccionR, p: Prioridad, hoy: string): string {
  const fin = a.fecha_fin ? `; fin: ${fecha(a.fecha_fin)}` : ''
  if (p === 'vencida') return `Venció el ${fecha(a.fecha_fin)} (hace ${plural(dias(a.fecha_fin!, hoy), 'día', 'días')})`
  if (p === 'vence_pronto') {
    const n = dias(hoy, a.fecha_fin!)
    return n === 0 ? `Vence hoy (${fecha(a.fecha_fin)})` : `Vence el ${fecha(a.fecha_fin)} (en ${plural(n, 'día', 'días')})`
  }
  if (p === 'sin_iniciar') return `Debería haber empezado el ${fecha(a.fecha_inicio)}${fin}`
  if (p === 'proxima') return `Empieza el ${fecha(a.fecha_inicio)} (en ${plural(dias(hoy, a.fecha_inicio!), 'día', 'días')})${fin}`
  if (p === 'futura') return `Empieza el ${fecha(a.fecha_inicio)}${fin}`
  return a.fecha_inicio ? `Plazo: ${fecha(a.fecha_inicio)} – ${fecha(a.fecha_fin)}` : `Fin: ${fecha(a.fecha_fin)}`
}

export interface Resumen {
  asunto: string
  texto: string
  html: string
  total: number
  vencidas: number
}

export function redactarResumen(o: {
  nombre: string | null
  bloques: Bloque[]
  hoy: string
  urlApp: string
  dia: number
}): Resumen {
  const { bloques, hoy, urlApp } = o
  const grupos = bloques.map((b) => ({ ...b, g: porPrioridad(b.acciones, hoy) }))
  const cuenta = (p: Prioridad) => grupos.reduce((n, b) => n + b.g[p].length, 0)
  const total = grupos.reduce((n, b) => n + b.acciones.length, 0)
  const vencidas = cuenta('vencida')
  const pronto = cuenta('vence_pronto')
  const [anyo, mes] = hoy.split('-').map(Number)
  const titulo = `Resumen mensual de acciones · ${MESES[mes - 1]} de ${anyo}`
  const asunto = `Resumen mensual: ${plural(total, 'acción abierta', 'acciones abiertas')}${
    vencidas ? `, ${plural(vencidas, 'vencida', 'vencidas')}` : ''
  }`
  const detalle = [vencidas && plural(vencidas, 'con el plazo vencido', 'con el plazo vencido'), pronto && `${pronto} ${pronto === 1 ? 'vence' : 'vencen'} en los próximos ${DIAS_PRONTO} días`]
    .filter(Boolean)
    .join(' y ')
  const intro = `Hola${o.nombre ? `, ${o.nombre}` : ''}. A ${fecha(hoy)} tienes ${plural(total, 'acción abierta', 'acciones abiertas')}${detalle ? ` (${detalle})` : ''}. Entra en cada una para registrar su seguimiento: lo realizado, las evidencias y, si hace falta, nuevas fechas.`
  const pie = `Recibes este resumen el día ${o.dia} de cada mes. Puedes desactivarlo en «Mi cuenta → Notificaciones»: ${urlApp}perfil`
  const enlace = (a: AccionR) => `${urlApp}gestion/${a.titulacion}/accion/${a.id}`

  // Texto plano
  const t: string[] = [titulo, '', intro]
  for (const b of grupos) {
    if (b.titulo) t.push('', `=== ${b.titulo.toUpperCase()} ===`)
    if (b.nota) t.push(b.nota)
    for (const { p, titulo: tn } of NIVELES) {
      if (!b.g[p].length) continue
      t.push('', `${tn.toUpperCase()} (${b.g[p].length})`)
      for (const a of b.g[p]) {
        t.push(`• ${a.codigo}. ${unaLinea(a.nombre, 200)}`)
        if (b.verResponsable) t.push(`   Responsable: ${a.responsable ?? 'sin responsable'}`)
        if (a.tareas?.trim()) t.push(`   Tareas: ${unaLinea(a.tareas, 300)}`)
        t.push(`   Estado: ${ESTADO[a.estado] ?? a.estado}. ${textoPlazo(a, p, hoy)}.`, `   ${enlace(a)}`)
      }
    }
  }
  t.push('', '--', pie)

  // HTML
  const h: string[] = []
  for (const b of grupos) {
    if (b.titulo) h.push(`<h2 style="font-size:16px;margin:24px 0 4px;color:#1a1b1e">${esc(b.titulo)}</h2>`)
    if (b.nota) h.push(`<p style="margin:0 0 8px;font-size:13px;color:#6b7280">${esc(b.nota)}</p>`)
    for (const { p, titulo: tn, color } of NIVELES) {
      if (!b.g[p].length) continue
      h.push(`<h3 style="font-size:14px;margin:16px 0 6px;color:${color};border-bottom:2px solid ${color};padding-bottom:2px">${esc(tn)} (${b.g[p].length})</h3>`)
      for (const a of b.g[p]) {
        h.push(`<div style="margin:0 0 12px;padding:8px 10px;border:1px solid #e3e5e8;border-left:3px solid ${color};border-radius:4px">
<div><a href="${esc(enlace(a))}" style="font-family:monospace;color:#4263eb;text-decoration:none;font-weight:bold">${esc(a.codigo)}</a> <span style="font-size:14px">${esc(unaLinea(a.nombre, 200))}</span></div>
${b.verResponsable ? `<div style="font-size:12px;color:#6b7280">Responsable: ${esc(a.responsable ?? 'sin responsable')}</div>` : ''}
${a.tareas?.trim() ? `<div style="font-size:13px;color:#374151;margin-top:4px">Tareas: ${esc(unaLinea(a.tareas, 300))}</div>` : ''}
<div style="font-size:13px;margin-top:4px"><b>${esc(ESTADO[a.estado] ?? a.estado)}</b> · <span style="color:${p === 'vencida' ? color : '#374151'}">${esc(textoPlazo(a, p, hoy))}</span></div>
</div>`)
      }
    }
  }
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1b1e">
<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e3e5e8">
<tr><td style="padding:20px 24px;border-bottom:3px solid #4263eb">
<div style="font-size:12px;color:#6b7280">Escuela Politécnica Superior · Seguimiento Calidad EPS</div>
<div style="font-size:18px;font-weight:bold;margin-top:4px">${esc(titulo)}</div></td></tr>
<tr><td style="padding:20px 24px;font-size:15px;line-height:1.45">
<p style="margin:0 0 8px">${esc(intro)}</p>
${h.join('\n')}
<p style="margin:20px 0 0"><a href="${esc(urlApp)}" style="display:inline-block;background:#4263eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">Abrir la aplicación</a></p>
</td></tr>
<tr><td style="padding:14px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e3e5e8">
Recibes este resumen el día ${o.dia} de cada mes. Puedes desactivarlo en <a href="${esc(urlApp)}perfil" style="color:#4263eb">Mi cuenta → Notificaciones</a>.
</td></tr></table></body></html>`

  return { asunto, texto: t.join('\n'), html, total, vencidas }
}
