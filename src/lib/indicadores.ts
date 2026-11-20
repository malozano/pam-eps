/**
 * Indicadores de una acción: lista de códigos del catálogo («UATR01»), el comodín «Si / No»
 * o textos escritos a mano para indicadores sin código.
 */
export const SI_NO = 'Si / No'

export interface IndicadorCatalogo {
  codigo: string
  nombre: string
  definicion: string | null
  procedimiento: string
  procedimientos: string[]
  activo: boolean
  orden: number
}

export interface Procedimiento {
  codigo: string
  nombre: string
  orden: number
}

const RE_CODIGO = /^[A-Z]{2,6}[0-9]{1,3}$/i
const RE_SI_NO = /^s[ií] ?\/ ?no$/i

/**
 * Separa el texto de una celda en indicadores (misma regla que la función SQL
 * separar_indicadores): si todas las partes separadas por «,», «;», salto de línea o «/»
 * entre códigos son códigos o «Si / No», se separan; si no, el texto se conserva entero.
 */
export function separarIndicadores(texto: string | null | undefined): string[] {
  const t = (texto ?? '').trim()
  if (!t) return []
  const partes = t
    .split(/[,;\n]|(?<=[0-9])\s*\/\s*(?=[A-Za-z])/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (partes.every((x) => RE_CODIGO.test(x) || RE_SI_NO.test(x)))
    return partes.map((x) => (RE_SI_NO.test(x) ? SI_NO : x.toUpperCase()))
  return [t]
}

export function esCodigo(x: string): boolean {
  return RE_CODIGO.test(x)
}

/** Texto para Excel: los indicadores separados por comas. */
export function unirIndicadores(lista: string[]): string {
  return lista.join(', ')
}

/** «UATR01 · Tasa de respuesta…» si está en el catálogo; el texto tal cual si no. */
export function etiquetaIndicador(x: string, catalogo: Map<string, IndicadorCatalogo>): string {
  const i = catalogo.get(x)
  return i ? `${i.codigo} · ${i.nombre}` : x
}
