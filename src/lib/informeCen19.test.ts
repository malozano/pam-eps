import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import { analizarTasas, CRITERIOS_POR_DEFECTO } from './analisisTasas'
import {
  accionesPropuestas, anyoInformePorDefecto, datosInforme, generarInforme, gruposAcciones, nombreFicheroInforme,
  pendientesVencidas, semestrePorDefecto,
} from './informeCen19'
import type { AsignaturaTasas, TasasTitulacion } from './tasas'

type A = Parameters<typeof gruposAcciones>[0][number]
const a = (codigo: string, anyo: number, numero: number, extra: Partial<A> = {}): A => ({
  id: codigo, codigo, anyo, numero, nombre: `Acción ${codigo}.`, tareas: null, responsable: 'Coordinación titulación',
  fecha_inicio: `${anyo}-09-01`, fecha_fin: `${anyo + 1}-06-30`, indicadores: [], estado: 'pendiente', observaciones: null,
  es_mejora: true, origen: 'CEN19 2.º semestre 2024-25', ...extra,
})
const acciones: A[] = [
  a('AM-D110-2025-01', 2025, 1, { estado: 'en_proceso', observaciones: 'Solicitud enviada' }),
  a('AM-D110-2025-02', 2025, 2, { estado: 'completada', observaciones: 'Aula renovada' }),
  a('AM-D110-2025-03', 2025, 3, { estado: 'pendiente', fecha_inicio: '2025-10-01', fecha_fin: '2025-12-31' }),
  a('AM-D110-2025-04', 2025, 4, { estado: 'cancelada', observaciones: 'Ya no procede' }),
  a('AM-D110-2025-05', 2025, 5, { es_mejora: false, estado: 'en_proceso' }),
  a('AM-D110-2024-01', 2024, 1, { estado: 'completada' }), // finalizada antes del curso: fuera
  a('AM-D110-2026-01', 2026, 1, { fecha_fin: '2027-03-31' }), // propuesta para el curso siguiente
]
const finalizadas = new Map([['AM-D110-2024-01', '2025-06-15']])

describe('informe de seguimiento (CEN19)', () => {
  it('curso y semestre por defecto', () => {
    expect(anyoInformePorDefecto(new Date('2026-03-10'))).toBe(2025)
    expect(anyoInformePorDefecto(new Date('2026-11-20'))).toBe(2025)
    expect(semestrePorDefecto(new Date('2026-05-31'))).toBe('primero')
    expect(semestrePorDefecto(new Date('2026-06-01'))).toBe('segundo')
    expect(nombreFicheroInforme('D110', 2025, 'segundo')).toBe('InformeSeguimiento-D110-2025-26-2S.docx')
  })

  it('acciones del plan del curso agrupadas por estado', () => {
    const g = gruposAcciones(acciones, 2025, finalizadas)
    expect(g.map((x) => [x.estado, x.acciones.map((y) => y.codigo)])).toEqual([
      ['en_proceso', ['AM-D110-2025-01']],
      ['completada', ['AM-D110-2025-02']],
      ['pendiente', ['AM-D110-2025-03']],
      ['cancelada', ['AM-D110-2025-04']],
    ])
    expect(g[0].acciones[0]).toEqual({ codigo: 'AM-D110-2025-01', nombre: 'Acción AM-D110-2025-01', detalle: ' Fin previsto: 30/06/2026. Solicitud enviada' })
    expect(g[2].acciones[0].detalle).toBe(' Inicio previsto: 01/10/2025; fin previsto: 31/12/2025.')
    expect(accionesPropuestas(acciones, 2025).map((x) => x.codigo)).toEqual(['AM-D110-2026-01'])
    expect(pendientesVencidas(acciones, 2025, finalizadas, '2026-03-01').map((x) => x.codigo)).toEqual(['AM-D110-2025-03'])
  })

  it('genera el Word con la plantilla: titulación, semestre, tasas y acciones', async () => {
    const asig = (codigo: string, curso: number, rend: number, matr = 40): AsignaturaTasas => ({
      codigo, nombre: `ASIG ${codigo}`, curso, tipo: 'OBLIGATORIA', semestre: 'segundo', esTrabajoFin: false,
      datos: { '2024-25': { matriculados: matr, aprobados: null, presentados: null, exito: 0.8, rendimiento: 0.7, no_presentados: null },
               '2025-26': { matriculados: matr, aprobados: null, presentados: null, exito: 0.8, rendimiento: rend, no_presentados: null } },
    })
    const t: TasasTitulacion = { titulacion: 'X', cursos: ['2024-25', '2025-26'], asignaturas: [asig('A', 1, 0.2), asig('B', 1, 0.7), asig('C', 2, 0.75)] }
    const analisis = analizarTasas(t, '2025-26', 'segundo')
    const b = readFileSync('public/plantillas/informe-seguimiento.docx')
    const blob = await generarInforme(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      datosInforme({ titulacion: { codigo: 'D110', nombre: 'Máster en Software Móvil' }, anyo: 2025, bloque: 'segundo', acciones, finalizadas, analisis, criterios: CRITERIOS_POR_DEFECTO }),
    )
    const xml = new PizZip(await blob.arrayBuffer()).file('word/document.xml')!.asText()
    const texto = xml.replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')
    expect(texto).not.toMatch(/[{}]/)
    expect(texto).not.toContain('RELLENAR')
    expect(texto).toContain('D110 · Máster en Software Móvil')
    expect(texto).toContain('SEGUNDO SEMESTRE · CURSO 2025-26')
    expect(texto).not.toContain('PRIMER SEMESTRE')
    expect(texto).toContain('1.º curso')
    expect(texto).toContain('ASIG A (1.º, 40 matriculados): tasa de rendimiento del 20 % (inferior al 30 %)')
    expect(texto).toContain('Las acciones actualmente en proceso son:')
    expect(texto).toContain('Las siguientes acciones han sido canceladas:')
    expect(texto).toContain('AM-D110-2026-01Acción AM-D110-2026-01.Coordinación titulación01/09/2026 –\n31/03/2027') // tabla de propuestas
    expect(texto).toContain('AM-D110-2025-03Coordinación titulación31/12/2025CEN19 2.º semestre 2024-25Pendiente') // tabla resumen
    expect(texto).toContain('AM-D110-2025-01. Acción AM-D110-2025-01. Fin previsto: 30/06/2026. Solicitud enviada') // viñeta
    expect(xml).toContain('w:fill="F4CCCC"') // celda resaltada
    expect((xml.match(/<w:tblW w:w="9000" w:type="dxa"\/>/g) ?? []).length).toBe(2) // tablas generadas: 1.º y 2.º
  })

  it('sin Excel de tasas: el apartado queda para rellenar a mano', async () => {
    const b = readFileSync('public/plantillas/informe-seguimiento.docx')
    const blob = await generarInforme(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      datosInforme({ titulacion: { codigo: 'CEN', nombre: 'EPS' }, anyo: 2025, bloque: 'primero', acciones: [], finalizadas: new Map(), analisis: null, criterios: CRITERIOS_POR_DEFECTO }),
    )
    const texto = new PizZip(await blob.arrayBuffer()).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '')
    expect(texto).toContain('PRIMER SEMESTRE · CURSO 2025-26')
    expect(texto).toContain('No hay acciones de mejora en el plan de este curso.')
    expect(texto).not.toContain('Aspectos a destacar')
  })
})
