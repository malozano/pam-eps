/**
 * Informe de seguimiento semestral (CEN19) en Word, con la plantilla de la EPS
 * (public/plantillas/informe-seguimiento.docx, preparada con scripts/preparar_plantilla_informe.py).
 *
 * Se rellena: titulación, semestre y curso, análisis de tasas (si se aporta el Excel), estado de las
 * acciones del plan del curso y acciones ya propuestas para el curso siguiente. El resto de apartados,
 * el nombre del coordinador/a y la fecha quedan para completarlos a mano.
 */
import { aspectosDestacados, pct, type AnalisisTasas, type CriteriosTasas, type Motivo } from './analisisTasas'
import { etiquetaCurso } from './cursos'
import { fechaCorta } from './formato'
import { estaAbierta, hoyISO } from './seguimiento'
import type { Accion, EstadoAccion, Titulacion } from './tipos'
import { accionesPlanAnterior } from './word'

/** Curso por defecto: durante el año natural N, el curso (N-1)-N. */
export function anyoInformePorDefecto(hoy: Date = new Date()): number {
  return hoy.getFullYear() - 1
}
/** Semestre por defecto: hasta mayo (incluido), el primero; desde junio, el segundo. */
export function semestrePorDefecto(hoy: Date = new Date()): 'primero' | 'segundo' {
  return hoy.getMonth() <= 4 ? 'primero' : 'segundo'
}

// ---------------------------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------------------------
type AccionInforme = Pick<
  Accion,
  'id' | 'codigo' | 'anyo' | 'numero' | 'nombre' | 'tareas' | 'responsable' | 'fecha_inicio' | 'fecha_fin' | 'indicadores'
  | 'estado' | 'observaciones' | 'es_mejora' | 'origen'
>

export interface GrupoAcciones {
  estado: EstadoAccion
  titulo: string
  acciones: { codigo: string; nombre: string; detalle: string }[]
}

const TITULO_GRUPO: Record<EstadoAccion, string> = {
  en_proceso: 'Las acciones actualmente en proceso son:',
  completada: 'Las siguientes acciones han sido completadas:',
  pendiente: 'Las siguientes acciones están pendientes:',
  cancelada: 'Las siguientes acciones han sido canceladas:',
}
const ORDEN: EstadoAccion[] = ['en_proceso', 'completada', 'pendiente', 'cancelada']

function detalle(a: AccionInforme): string {
  const obs = (a.observaciones ?? '').trim()
  const partes: string[] = []
  if (a.estado === 'en_proceso' && a.fecha_fin) partes.push(`Fin previsto: ${fechaCorta(a.fecha_fin)}.`)
  if (a.estado === 'pendiente')
    partes.push(`Inicio previsto: ${fechaCorta(a.fecha_inicio)}; fin previsto: ${fechaCorta(a.fecha_fin)}.`)
  if (obs) partes.push(obs)
  return partes.length ? ' ' + partes.join(' ') : ''
}

/**
 * Acciones del plan del curso analizado (`anyo`): las de ese curso y las de cursos anteriores que
 * seguían abiertas al empezarlo, agrupadas por estado (solo grupos con acciones).
 */
export function gruposAcciones(acciones: AccionInforme[], anyo: number, finalizadas: Map<string, string>): GrupoAcciones[] {
  const plan = accionesPlanAnterior(acciones, anyo + 1, finalizadas).sort(
    (a, b) => b.anyo - a.anyo || a.numero - b.numero,
  )
  return ORDEN.map((estado) => ({
    estado,
    titulo: TITULO_GRUPO[estado],
    acciones: plan.filter((a) => a.estado === estado).map((a) => ({ codigo: a.codigo, nombre: a.nombre.trim().replace(/\.$/, ''), detalle: detalle(a) })),
  })).filter((g) => g.acciones.length)
}

const ESTADO_TEXTO: Record<EstadoAccion, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

/** Tabla resumen del plan del curso: una fila por acción. */
export function resumenAcciones(acciones: AccionInforme[], anyo: number, finalizadas: Map<string, string>) {
  return accionesPlanAnterior(acciones, anyo + 1, finalizadas)
    .sort((a, b) => b.anyo - a.anyo || a.numero - b.numero)
    .map((a) => ({
      codigo: a.codigo,
      responsable: a.responsable ?? '',
      fecha: a.fecha_fin ? fechaCorta(a.fecha_fin) : '',
      origen: a.origen ?? '',
      estado: ESTADO_TEXTO[a.estado],
    }))
}

/** Acciones de mejora ya introducidas para el curso siguiente (tabla «Código | Descripción | Responsable | Fechas»). */
export function accionesPropuestas(acciones: AccionInforme[], anyo: number) {
  return acciones
    .filter((a) => a.es_mejora && a.anyo === anyo + 1)
    .sort((a, b) => a.numero - b.numero)
    .map((a) => ({
      codigo: a.codigo,
      nombre: a.nombre.trim(),
      responsable: a.responsable ?? '',
      fechas: [a.fecha_inicio, a.fecha_fin].filter(Boolean).map((f) => fechaCorta(f)).join(' –\n'),
    }))
}

/** Acciones pendientes del plan cuya fecha de fin ya ha pasado: conviene registrar una nueva fecha prevista. */
export function pendientesVencidas(acciones: AccionInforme[], anyo: number, finalizadas: Map<string, string>, hoy = hoyISO()) {
  return accionesPlanAnterior(acciones, anyo + 1, finalizadas).filter(
    (a) => a.estado === 'pendiente' && estaAbierta(a.estado) && a.fecha_fin !== null && a.fecha_fin < hoy,
  )
}

// ---------------------------------------------------------------------------------------------
// Tablas de tasas en WordprocessingML (se insertan con {@tasas})
// ---------------------------------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

interface FormatoTexto {
  b?: boolean
  i?: boolean
  sz?: number //       medios puntos (16 = 8 pt)
  color?: string
  shd?: string //      fondo del texto (leyenda)
}
const run = (texto: string, f: FormatoTexto = {}) =>
  `<w:r><w:rPr>${f.b ? '<w:b/>' : ''}${f.i ? '<w:i/>' : ''}${f.color ? `<w:color w:val="${f.color}"/>` : ''}${
    f.sz ? `<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>` : ''
  }${f.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${f.shd}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`
const parrafo = (runs: string, o: { antes?: number; despues?: number; mantenerConSiguiente?: boolean; centrado?: boolean } = {}) =>
  `<w:p><w:pPr>${o.mantenerConSiguiente ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.antes ?? 0}" w:after="${
    o.despues ?? 60
  }"/>${o.centrado ? '<w:jc w:val="center"/>' : ''}</w:pPr>${runs}</w:p>`

/** Colores de resaltado (de mayor a menor prioridad) */
export const COLOR_MOTIVO: Record<Motivo, string> = {
  baja: 'F4CCCC',
  no_presentados: 'CFE2F3',
  atipica: 'FFF2CC',
  cambio: 'FCE5CD',
}
const PRIORIDAD: Motivo[] = ['baja', 'no_presentados', 'atipica', 'cambio']

interface Celda {
  texto: string
  ancho: number // twips
  fondo?: string
  b?: boolean
  i?: boolean
  derecha?: boolean
  span?: number
  vmerge?: 'restart' | 'continue'
}
const celda = (c: Celda) =>
  `<w:tc><w:tcPr><w:tcW w:w="${c.ancho}" w:type="dxa"/>${c.span ? `<w:gridSpan w:val="${c.span}"/>` : ''}${
    c.vmerge ? `<w:vMerge${c.vmerge === 'restart' ? ' w:val="restart"' : ''}/>` : ''
  }${c.fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fondo}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${
    c.derecha ? '<w:jc w:val="right"/>' : ''
  }</w:pPr>${c.vmerge === 'continue' ? '' : run(c.texto, { b: c.b, i: c.i, sz: 16 })}</w:p></w:tc>`
const fila = (celdas: Celda[], cabecera = false) =>
  `<w:tr><w:trPr><w:cantSplit/>${cabecera ? '<w:tblHeader/>' : ''}</w:trPr>${celdas.map(celda).join('')}</w:tr>`

/** Ancho útil de la celda del semestre en la plantilla (~15,9 cm) */
const ANCHO_TOTAL = 9000
const ANCHO_MAT = 600

function tablaXml(tb: AnalisisTasas['tablas'][number], cursos: string[]): string {
  const n = cursos.length
  const anchoTasa = 700
  const anchoAsig = ANCHO_TOTAL - ANCHO_MAT - 2 * n * anchoTasa
  const grid = [anchoAsig, ANCHO_MAT, ...Array(2 * n).fill(anchoTasa)]
  const gris = 'D9E2F3'
  const corto = (c: string) => c.slice(2) // 2025-26 -> 25-26
  const cab1: Celda[] = [
    { texto: 'Asignatura', ancho: anchoAsig, fondo: gris, b: true, vmerge: 'restart' },
    { texto: 'Mat.', ancho: ANCHO_MAT, fondo: gris, b: true, vmerge: 'restart', derecha: true },
    { texto: 'Tasa de éxito', ancho: anchoTasa * n, fondo: gris, b: true, span: n },
    { texto: 'Tasa de rendimiento', ancho: anchoTasa * n, fondo: gris, b: true, span: n },
  ]
  const cab2: Celda[] = [
    { texto: '', ancho: anchoAsig, fondo: gris, vmerge: 'continue' },
    { texto: '', ancho: ANCHO_MAT, fondo: gris, vmerge: 'continue' },
    ...[...cursos, ...cursos].map((c) => ({ texto: corto(c), ancho: anchoTasa, fondo: gris, b: true, derecha: true })),
  ]
  const valor = (v: number | null, motivos: Motivo[] | null): Celda => {
    const m = motivos ? PRIORIDAD.find((x) => motivos.includes(x)) : undefined
    return { texto: pct(v), ancho: anchoTasa, derecha: true, fondo: m ? COLOR_MOTIVO[m] : undefined, b: !!m }
  }
  const filas = tb.filas.map((f) =>
    fila([
      { texto: f.asignatura.nombre, ancho: anchoAsig },
      { texto: f.matriculados === null ? '—' : String(f.matriculados), ancho: ANCHO_MAT, derecha: true },
      ...f.exito.map((v, k) => valor(v, k === n - 1 ? f.marcas.exito : null)),
      ...f.rendimiento.map((v, k) => valor(v, k === n - 1 ? f.marcas.rendimiento : null)),
    ]),
  )
  const med = fila([
    { texto: 'Mediana', ancho: anchoAsig, b: true, i: true, fondo: 'F2F2F2' },
    { texto: '', ancho: ANCHO_MAT, fondo: 'F2F2F2' },
    ...[...tb.mediana.exito, ...tb.mediana.rendimiento].map((v) => ({
      texto: pct(v), ancho: anchoTasa, b: true, i: true, derecha: true, fondo: 'F2F2F2',
    })),
  ])
  const bordes = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>`)
    .join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="${ANCHO_TOTAL}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${bordes}</w:tblBorders><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid
    .map((w) => `<w:gridCol w:w="${w}"/>`)
    .join('')}</w:tblGrid>${fila(cab1, true)}${fila(cab2, true)}${filas.join('')}${med}</w:tbl>`
}

/** Contenido del apartado de tasas (tablas, leyenda y borrador de aspectos a destacar). */
export function tasasXml(a: AnalisisTasas | null, c: CriteriosTasas, bloque: 'primero' | 'segundo'): string {
  if (!a) return parrafo(run('…'))
  const sem = bloque === 'primero' ? 'del primer semestre' : 'del segundo semestre (incluye las anuales)'
  const cursosTxt = a.cursos.length > 1 ? `${a.cursos.slice(0, -1).join(', ')} y ${a.cursos.at(-1)}` : a.cursos[0]
  let x = parrafo(
    run(`Tasas de éxito y de rendimiento (eficacia) de las asignaturas ${sem} en ${a.cursos.length > 1 ? 'los cursos' : 'el curso'} ${cursosTxt}. «Mat.»: matriculados en ${a.cursoAnalizado}.`, { i: true, sz: 18 }),
    { despues: 120 },
  )
  for (const tb of a.tablas) {
    x += parrafo(run(tb.titulo, { b: true, sz: 20 }), { antes: 120, despues: 60, mantenerConSiguiente: true })
    x += tablaXml(tb, a.cursos)
  }
  const leyenda = [
    ['baja', `tasa inferior al ${pct(c.tasa_baja)}`],
    ['cambio', `cambio de ${Math.round(c.cambio * 100)} puntos o más respecto al curso anterior`],
    ['atipica', `a ${Math.round(c.desviacion * 100)} puntos o más de la mediana de su curso`],
    ['no_presentados', `éxito y rendimiento difieren ${Math.round(c.no_presentados * 100)} puntos o más (muchos no presentados)`],
  ] as const
  x += parrafo(
    run('Valores destacados en ' + a.cursoAnalizado + ': ', { b: true, sz: 16 }) +
      leyenda.map(([m, t]) => run('      ', { shd: COLOR_MOTIVO[m], sz: 16 }) + run(` ${t}.  `, { sz: 16 })).join('') +
      run(`No se destacan asignaturas con menos de ${c.min_matriculados} matriculados. El TFG/TFM se analiza aparte, sin compararlo con la mediana.`, { sz: 16, i: true }),
    { antes: 120, despues: 120 },
  )
  const aspectos = aspectosDestacados(a)
  x += parrafo(run('Aspectos a destacar (borrador generado automáticamente: revisar y completar el análisis):', { b: true }), { antes: 120 })
  if (!aspectos.length) x += parrafo(run('No se han detectado valores destacados con los criterios aplicados.', { i: true }))
  for (const s of aspectos) x += parrafo(run('– ' + s))
  return x
}

// ---------------------------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------------------------
export interface DatosInforme {
  titulacion: string
  semestre: string
  tasas: string
  resumen: ReturnType<typeof resumenAcciones>
  grupos: GrupoAcciones[]
  propuestas: ReturnType<typeof accionesPropuestas>
}

export function datosInforme(opts: {
  titulacion: Pick<Titulacion, 'codigo' | 'nombre'>
  anyo: number
  bloque: 'primero' | 'segundo'
  acciones: AccionInforme[]
  finalizadas: Map<string, string>
  analisis: AnalisisTasas | null
  criterios: CriteriosTasas
}): DatosInforme {
  return {
    titulacion: `${opts.titulacion.codigo} · ${opts.titulacion.nombre}`,
    semestre: `${opts.bloque === 'primero' ? 'PRIMER' : 'SEGUNDO'} SEMESTRE · CURSO ${etiquetaCurso(opts.anyo)}`,
    tasas: tasasXml(opts.analisis, opts.criterios, opts.bloque),
    resumen: resumenAcciones(opts.acciones, opts.anyo, opts.finalizadas),
    grupos: gruposAcciones(opts.acciones, opts.anyo, opts.finalizadas),
    propuestas: accionesPropuestas(opts.acciones, opts.anyo),
  }
}

export function nombreFicheroInforme(titulacion: string, anyo: number, bloque: 'primero' | 'segundo') {
  return `InformeSeguimiento-${titulacion}-${etiquetaCurso(anyo)}-${bloque === 'primero' ? '1S' : '2S'}.docx`
}

export async function generarInforme(plantilla: ArrayBuffer, datos: DatosInforme): Promise<Blob> {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([import('pizzip'), import('docxtemplater')])
  const doc = new Docxtemplater(new PizZip(plantilla), { paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(datos)
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Blob
}

export async function cargarPlantillaInforme(): Promise<ArrayBuffer> {
  const r = await fetch(`${import.meta.env.BASE_URL}plantillas/informe-seguimiento.docx`)
  if (!r.ok) throw new Error('No se ha podido cargar la plantilla del informe')
  return r.arrayBuffer()
}
