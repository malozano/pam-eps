/// <reference lib="webworker" />
/**
 * Service worker de la aplicación instalable (PWA).
 * - Guarda en caché la aplicación (HTML, JS, CSS, iconos) para que abra rápido y sin conexión.
 * - Nunca guarda datos de Supabase: las acciones siempre se leen actualizadas.
 * - Más adelante: recepción de notificaciones push.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Las rutas de la aplicación (/gestion/…, /plan/…) se sirven con index.html
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)))

// La aplicación pide activar la versión nueva cuando el usuario acepta
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ---------------------------------------------------------------------
// Notificaciones push (avisos de plazos)
// ---------------------------------------------------------------------
interface MensajePush {
  title: string
  body: string
  url?: string
  tag?: string
}

self.addEventListener('push', (e) => {
  let m: MensajePush = { title: 'Planes de mejora', body: '' }
  try {
    m = e.data?.json() as MensajePush
  } catch {
    m.body = e.data?.text() ?? ''
  }
  e.waitUntil(
    self.registration.showNotification(m.title, {
      body: m.body,
      tag: m.tag,
      icon: `${import.meta.env.BASE_URL}pwa-192.png`,
      badge: `${import.meta.env.BASE_URL}pwa-192.png`,
      data: { url: m.url || import.meta.env.BASE_URL },
    }),
  )
})

// Al pulsar la notificación se abre (o se enfoca) la aplicación en la página de la acción
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data as { url?: string } | null)?.url || import.meta.env.BASE_URL
  e.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const v of ventanas) {
        if ('focus' in v) {
          await v.focus()
          if ('navigate' in v) await (v as WindowClient).navigate(url)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
