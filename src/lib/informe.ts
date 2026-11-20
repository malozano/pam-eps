/**
 * Utilidades para el seguimiento: agrupación de acciones como en el informe semestral
 * (CEN19) y texto listo para copiar al informe.
 */
import { etiquetaCurso } from './cursos'
import { fechaCorta } from './formato'
import type { Accion } from './tipos'

export type GrupoInforme = 'finalizadas' | 'en_proceso' | 'pendientes'

export const GRUPOS: { grupo: GrupoInforme; titulo: string; ayuda: string }[] = [
  {
    grupo: 'finalizadas',
    titulo: 'Acciones completadas o canceladas',
    ayuda: 'Se indica lo que se ha hecho o el motivo de la cancelación. Una vez reportadas, se marcan como cerradas.',
  },
  {
    grupo: 'en_proceso',
    titulo: 'Acciones en proceso',
    ayuda: 'Lo realizado hasta el momento, la previsión de trabajo futuro y la fecha de finalización.',
  },
  {
    grupo: 'pendientes',
    titulo: 'Acciones pendientes',
    ayuda: 'Si la acción ha sufrido retraso, la fecha estimada en la que comenzará.',
  },
]

export function grupoDe(a: Pick<Accion, 'estado'>): GrupoInforme {
  if (a.estado === 'completada' || a.estado === 'cancelada') return 'finalizadas'
  return a.estado === 'en_proceso' ? 'en_proceso' : 'pendientes'
}

/** Acciones que entran en el informe: de mejora y aún no cerradas. */
export function accionesParaInforme<T extends Pick<Accion, 'es_mejora' | 'cerrada'>>(acciones: T[]): T[] {
  return acciones.filter((a) => a.es_mejora && !a.cerrada)
}

type AccionTexto = Pick<
  Accion,
  'codigo' | 'nombre' | 'estado' | 'anyo' | 'fecha_inicio' | 'fecha_fin' | 'observaciones'
>

/** Texto plano de un grupo de acciones, para pegar en el informe. */
export function textoGrupo(grupo: GrupoInforme, acciones: AccionTexto[]): string {
  return acciones
    .map((a) => {
      const lineas = [`${a.codigo}. ${a.nombre}`]
      if (grupo === 'finalizadas')
        lineas.push(`Estado: ${a.estado === 'cancelada' ? 'Cancelada' : 'Completada'}.`)
      if (grupo === 'en_proceso') lineas.push(`Fecha de finalización prevista: ${fechaCorta(a.fecha_fin)}.`)
      if (grupo === 'pendientes')
        lineas.push(`Curso ${etiquetaCurso(a.anyo)}. Inicio previsto: ${fechaCorta(a.fecha_inicio)}.`)
      lineas.push(a.observaciones ? a.observaciones : '(Sin observaciones)')
      return lineas.join('\n')
    })
    .join('\n\n')
}

/** Separa un texto en fragmentos de texto y URLs, para mostrar las evidencias con enlaces. */
export function trocearEnlaces(texto: string): { texto: string; url?: string }[] {
  const partes: { texto: string; url?: string }[] = []
  const re = /https?:\/\/[^\s<>"')]+[^\s<>"').,;:]/g
  let ultimo = 0
  for (const m of texto.matchAll(re)) {
    if (m.index > ultimo) partes.push({ texto: texto.slice(ultimo, m.index) })
    partes.push({ texto: m[0], url: m[0] })
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo) })
  return partes
}
