import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import { accionesPlanAnterior, datosPlanWord, generarWord, nombreFicheroWord } from './word'

type A = Parameters<typeof datosPlanWord>[0][number]
const a = (codigo: string, anyo: number, numero: number, extra: Partial<A> = {}): A => ({
  id: codigo, codigo, anyo, numero, nombre: `Acción ${codigo}`, tareas: null, responsable: 'Coordinación titulación',
  fecha_fin: `${anyo + 1}-06-30`, indicadores: ['Si / No'], estado: 'pendiente', observaciones: null, es_mejora: true, ...extra,
})

const acciones: A[] = [
  a('AM-D110-2026-01', 2026, 1, { tareas: '(1) Emails\n(2) Carteles', indicadores: ['ISV2', 'VER02'], observaciones: 'Prevista' }),
  a('AM-D110-2026-02', 2026, 2, { es_mejora: false }),
  a('AM-D110-2025-01', 2025, 1, { estado: 'en_proceso', observaciones: 'Solicitud enviada' }),
  a('AM-D110-2025-02', 2025, 2, { estado: 'completada', observaciones: 'Aula renovada' }),
  a('AM-D110-2024-01', 2024, 1, { estado: 'pendiente' }),                // abierta: en ambos planes
  a('AM-D110-2024-02', 2024, 2, { estado: 'completada' }),               // terminada en oct. 2025
  a('AM-D110-2024-03', 2024, 3, { estado: 'completada' }),               // terminada en junio 2025
  a('AM-MUDSDM-2023-01', 2023, 1, { estado: 'completada' }),              // importada, sin fecha
]
const finalizadas = new Map([
  ['AM-D110-2024-02', '2025-10-15'],
  ['AM-D110-2024-03', '2025-06-20'],
])
const tit = { codigo: 'D110', nombre: 'Máster Universitario en Desarrollo de Software para Dispositivos Móviles', tipo: 'master' as const }

describe('plan en Word', () => {
  it('plan del curso: acciones de mejora del curso + anteriores abiertas', () => {
    const d = datosPlanWord(acciones, tit, 2026, finalizadas)
    expect(d.titulo).toBe('Plan de mejora de la titulación D110 Máster Universitario en Desarrollo de Software para Dispositivos Móviles para el curso 2026-27')
    expect(d.plan.map((f) => f.codigo)).toEqual(['AM-D110-2026-01', 'AM-D110-2025-01', 'AM-D110-2024-01'])
    expect(d.plan[0]).toMatchObject({ plazo: '30/06/2027', indicador: 'ISV2, VER02', tareas: '(1) Emails\n(2) Carteles', observaciones: 'Prevista' })
  })

  it('plan del curso anterior: las de ese curso y las previas abiertas al empezarlo', () => {
    const ant = accionesPlanAnterior(acciones, 2026, finalizadas).map((x) => x.codigo)
    expect(ant).toEqual(['AM-D110-2025-01', 'AM-D110-2025-02', 'AM-D110-2024-01', 'AM-D110-2024-02'])
    const d = datosPlanWord(acciones, tit, 2026, finalizadas)
    expect(d.cursoAnterior).toBe('2025-26')
    expect(d.hayAnterior).toBe(true)
    expect(d.anterior.find((f) => f.codigo === 'AM-D110-2025-02')).toMatchObject({ estado: 'Completada', evidencias: 'Aula renovada' })
  })

  it('sin plan anterior y plan del centro', () => {
    const d = datosPlanWord([a('AM-CEN-2026-01', 2026, 1)], { codigo: 'CEN', nombre: 'Escuela Politécnica Superior', tipo: 'centro' }, 2026, new Map())
    expect(d.titulo).toBe('Plan de mejora de la Escuela Politécnica Superior para el curso 2026-27')
    expect(d.hayAnterior).toBe(false)
    expect(d.anterior).toEqual([])
    expect(nombreFicheroWord('CEN', 2026)).toBe('PlanAccionesMejora-CEN-2026-27.docx')
  })

  it('rellena la plantilla oficial', async () => {
    const buf = readFileSync('public/plantillas/plan-mejora.docx')
    const plantilla = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const blob = await generarWord(plantilla, datosPlanWord(acciones, tit, 2026, finalizadas))
    const zip = new PizZip(await blob.arrayBuffer())
    const xml = zip.file('word/document.xml')!.asText()
    const textoPlano = xml.replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')
    expect(textoPlano).not.toMatch(/[{}]/) // sin marcas sin sustituir
    expect(textoPlano).toContain('para el curso 2026-27')
    expect(textoPlano).toContain('AM-D110-2024-02')
    expect(textoPlano).toContain('(1) Emails\n(2) Carteles')
    expect(textoPlano).not.toContain('No hay acciones de mejora en el plan')
    expect(textoPlano).not.toContain('no hay acciones de mejora.')
    expect((xml.match(/<w:tr[ >]/g) ?? []).length).toBe(1 + 3 + 1 + 4) // cabeceras + filas
    expect(zip.file('word/header1.xml')!.asText()).toContain('Escuela Politécnica Superior')
  })
})
