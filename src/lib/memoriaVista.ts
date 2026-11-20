/**
 * Memoria de la vista de cada plan durante la sesión del navegador (filtros y posición de
 * desplazamiento), para volver al listado tal como se dejó. Si el almacenamiento no está
 * disponible, simplemente no se recuerda nada.
 */
const clave = (codigo: string, tipo: 'filtros' | 'scroll') => `plan:${codigo}:${tipo}`

function leer(k: string): string | null {
  try {
    return sessionStorage.getItem(k)
  } catch {
    return null
  }
}
function guardar(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento */
  }
}

export const filtrosGuardados = (codigo: string) => leer(clave(codigo, 'filtros'))
export const guardarFiltros = (codigo: string, query: string) => guardar(clave(codigo, 'filtros'), query)
export const scrollGuardado = (codigo: string) => Number(leer(clave(codigo, 'scroll')) ?? 0)
export const guardarScroll = (codigo: string, y: number) => guardar(clave(codigo, 'scroll'), String(Math.round(y)))
