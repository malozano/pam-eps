/**
 * Plan de acciones de mejora en Word, con la plantilla oficial de la UA
 * (public/plantillas/plan-mejora.docx, preparada con scripts/preparar_plantilla_word.py).
 *
 * - Tabla 1: plan del curso (acciones de mejora del curso y de cursos anteriores que siguen
 *   pendientes o en proceso). «Plazo» = fecha de fin.
 * - Tabla 2: estado de las acciones del plan del curso anterior. «Evidencias» = observaciones.
 */
import { etiquetaCurso } from './cursos'
import { fechaCorta } from './formato'
import { unirIndicadores } from './indicadores'
import { enPlanDelCurso, estaAbierta } from './seguimiento'
import type { Accion, EstadoAccion, Titulacion } from './tipos'

const ESTADO_TEXTO: Record<EstadoAccion, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

type AccionWord = Pick<
  Accion,
  | 'id' | 'codigo' | 'anyo' | 'numero' | 'nombre' | 'tareas' | 'responsable' | 'fecha_fin' | 'indicadores' | 'estado'
  | 'observaciones' | 'es_mejora'
>

export interface DatosPlanWord {
  centro: string
  titulo: string
  cursoAnterior: string
  plan: Record<string, string>[]
  anterior: Record<string, string>[]
  hayAnterior: boolean
}

/**
 * Acciones que formaban parte del plan del curso anterior (anyo - 1): las de ese curso y las de
 * cursos previos que seguían abiertas al empezar ese curso, es decir, que siguen abiertas o se
 * finalizaron (completaron o cancelaron) a partir del 1 de septiembre de ese curso.
 * `finalizadas` = fecha (aaaa-mm-dd) en que cada acción pasó a completada/cancelada, según el historial.
 */
export function accionesPlanAnterior<T extends AccionWord>(acciones: T[], anyo: number, finalizadas: Map<string, string>): T[] {
  const anterior = anyo - 1
  const inicioCurso = `${anterior}-09-01`
  return acciones.filter(
    (a) =>
      a.es_mejora &&
      (a.anyo === anterior ||
        (a.anyo < anterior && (estaAbierta(a.estado) || (finalizadas.get(a.id) ?? '') >= inicioCurso))),
  )
}

const ordenar = <T extends AccionWord>(l: T[]) => [...l].sort((a, b) => b.anyo - a.anyo || a.numero - b.numero)
const texto = (s: string | null | undefined) => (s ?? '').trim()

export function datosPlanWord(
  acciones: AccionWord[],
  tit: Pick<Titulacion, 'codigo' | 'nombre' | 'tipo'>,
  anyo: number,
  finalizadas: Map<string, string>,
): DatosPlanWord {
  const curso = etiquetaCurso(anyo)
  const fila = (a: AccionWord) => ({
    codigo: a.codigo,
    nombre: texto(a.nombre),
    tareas: texto(a.tareas),
    responsable: texto(a.responsable),
    plazo: a.fecha_fin ? fechaCorta(a.fecha_fin) : '',
    indicador: unirIndicadores(a.indicadores),
  })
  const plan = ordenar(acciones.filter((a) => a.es_mejora && enPlanDelCurso(a, anyo))).map((a) => ({
    ...fila(a),
    observaciones: texto(a.observaciones),
  }))
  const anterior = ordenar(accionesPlanAnterior(acciones, anyo, finalizadas)).map((a) => ({
    ...fila(a),
    estado: ESTADO_TEXTO[a.estado],
    evidencias: texto(a.observaciones),
  }))
  return {
    centro: 'Escuela Politécnica Superior',
    titulo:
      tit.tipo === 'centro'
        ? `Plan de mejora de la Escuela Politécnica Superior para el curso ${curso}`
        : `Plan de mejora de la titulación ${tit.codigo} ${tit.nombre} para el curso ${curso}`,
    cursoAnterior: etiquetaCurso(anyo - 1),
    plan,
    anterior,
    hayAnterior: anterior.length > 0,
  }
}

export function nombreFicheroWord(titulacion: string, anyo: number): string {
  return `PlanAccionesMejora-${titulacion}-${etiquetaCurso(anyo)}.docx`
}

/** Rellena la plantilla (ArrayBuffer del .docx) con los datos. Las librerías se cargan bajo demanda. */
export async function generarWord(plantilla: ArrayBuffer, datos: DatosPlanWord): Promise<Blob> {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([import('pizzip'), import('docxtemplater')])
  const doc = new Docxtemplater(new PizZip(plantilla), {
    paragraphLoop: true,
    linebreaks: true, // los saltos de línea de tareas y observaciones se respetan
    nullGetter: () => '',
  })
  doc.render(datos)
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Blob
}

export async function cargarPlantillaWord(): Promise<ArrayBuffer> {
  const r = await fetch(`${import.meta.env.BASE_URL}plantillas/plan-mejora.docx`)
  if (!r.ok) throw new Error('No se ha podido cargar la plantilla Word')
  return r.arrayBuffer()
}
