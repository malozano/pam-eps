/**
 * Navegación de vuelta desde la ficha de una acción: los listados pasan en el estado de la
 * navegación la pantalla desde la que se abre («desde»), y la ficha vuelve a ella. Sin ese
 * estado (enlace de un correo, recarga, dirección escrita) la ficha vuelve al plan, como siempre.
 */
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export interface Desde {
  ruta: string
  etiqueta: string
}
export interface EstadoNavegacion {
  desde?: Desde
}

/** Nombre de la pantalla actual para el enlace «← …» de la ficha. */
export function etiquetaDeRuta(pathname: string, esTransversal = false): string {
  if (pathname === '/') return esTransversal ? 'Mis acciones' : 'Inicio'
  if (pathname.startsWith('/admin/consultas')) return 'Consultas'
  const informe = /^\/gestion\/([^/]+)\/informe/.exec(pathname)
  if (informe) return `Informe de seguimiento ${informe[1]}`
  const plan = /^\/gestion\/([^/]+)\/?$/.exec(pathname)
  if (plan) return `Plan ${plan[1]}`
  return 'Volver'
}

/** Estado que se pasa al abrir una acción desde la pantalla actual. */
export function useEstadoDesde(): EstadoNavegacion {
  const { pathname, search } = useLocation()
  const { esTransversal } = useAuth()
  return { desde: { ruta: pathname + search, etiqueta: etiquetaDeRuta(pathname, esTransversal) } }
}

/** Origen recibido (en la ficha o en la edición), si lo hay. */
export function useDesde(): Desde | undefined {
  return (useLocation().state as EstadoNavegacion | null)?.desde
}
