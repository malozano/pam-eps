/**
 * Un "año" de acción es el año de inicio del curso: 2026 => curso 2026-27.
 * Durante el año natural N se proponen acciones para el curso N-(N+1).
 */
export function etiquetaCurso(anyo: number): string {
  return `${anyo}-${String((anyo + 1) % 100).padStart(2, '0')}`
}

export function anyoPorDefecto(hoy: Date = new Date()): number {
  return hoy.getFullYear()
}

/** Cursos seleccionables al dar de alta: anterior, actual (por defecto) y siguiente. */
export function anyosSeleccionables(hoy: Date = new Date()): number[] {
  const a = anyoPorDefecto(hoy)
  return [a - 1, a, a + 1]
}

export function codigoAccion(titulacion: string, anyo: number, numero: number): string {
  return `AM-${titulacion}-${anyo}-${String(numero).padStart(2, '0')}`
}

const RE_CODIGO = /^AM-([A-Z0-9]+)-(\d{4})-(\d{2,})$/

/** Descompone un código. El prefijo puede ser el código de titulación o, en acciones antiguas, sus siglas. */
export function parsearCodigo(codigo: string): { prefijo: string; anyo: number; numero: number } | null {
  const m = RE_CODIGO.exec(codigo.trim().toUpperCase())
  if (!m) return null
  return { prefijo: m[1], anyo: Number(m[2]), numero: Number(m[3]) }
}
