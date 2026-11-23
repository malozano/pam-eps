/**
 * Origen de una acción: el informe en el que se planteó por primera vez (uno de los cuatro
 * habituales, con su curso) seguido, opcionalmente, del motivo o problema detectado. Se guarda
 * como un único texto: «Informe anual de titulación (CEN10) del curso 2025-26. Alta tasa de…».
 */
import { etiquetaCurso } from './cursos'

export type TipoInforme = 'cen02' | 'cen10' | 'cen19_1' | 'cen19_2'

export const INFORMES: { tipo: TipoInforme; texto: string; corto: string }[] = [
  { tipo: 'cen02', texto: 'Informe anual de centro (CEN02)', corto: 'Informe anual de centro (CEN02)' },
  { tipo: 'cen10', texto: 'Informe anual de titulación (CEN10)', corto: 'Informe anual de titulación (CEN10)' },
  { tipo: 'cen19_1', texto: 'Informe semestral de titulación (CEN19) de primer semestre', corto: 'Informe semestral (CEN19), primer semestre' },
  { tipo: 'cen19_2', texto: 'Informe semestral de titulación (CEN19) de segundo semestre', corto: 'Informe semestral (CEN19), segundo semestre' },
]

export interface Origen {
  tipo: TipoInforme | null //   null: sin informe (solo el texto libre)
  anyo: number | null //        curso del informe (año de inicio)
  motivo: string
}

/**
 * Curso del informe que se propone para una acción del curso `anyo`: los informes anuales y el
 * del segundo semestre son del curso anterior; el del primer semestre, del mismo curso.
 */
export function cursoPropuesto(tipo: TipoInforme, anyo: number): number {
  return tipo === 'cen19_1' ? anyo : anyo - 1
}

export function componerOrigen(o: Origen): string {
  if (!o.tipo || !o.anyo) return o.motivo
  const informe = `${INFORMES.find((i) => i.tipo === o.tipo)!.texto} del curso ${etiquetaCurso(o.anyo)}`
  return o.motivo.trim() ? `${informe}. ${o.motivo.replace(/^\s+/, '')}` : informe
}

const PATRON = new RegExp(
  `^(${INFORMES.map((i) => i.texto.replace(/[()]/g, '\\$&')).join('|')}) del curso (\\d{4})-\\d{2}(?:\\.\\s*([\\s\\S]*))?$`,
)

/** Interpreta un origen guardado; si no sigue el formato, todo es texto libre. */
export function analizarOrigen(texto: string | null): Origen {
  const t = texto ?? ''
  const m = PATRON.exec(t)
  if (!m) return { tipo: null, anyo: null, motivo: t }
  return { tipo: INFORMES.find((i) => i.texto === m[1])!.tipo, anyo: Number(m[2]), motivo: m[3] ?? '' }
}
