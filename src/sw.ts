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
