import { describe, expect, it } from 'vitest'
import { accionesParaInforme, grupoDe, textoGrupo, trocearEnlaces } from './informe'

describe('informe de seguimiento', () => {
  it('agrupa por estado', () => {
    expect(grupoDe({ estado: 'completada' })).toBe('finalizadas')
    expect(grupoDe({ estado: 'cancelada' })).toBe('finalizadas')
    expect(grupoDe({ estado: 'en_proceso' })).toBe('en_proceso')
    expect(grupoDe({ estado: 'pendiente' })).toBe('pendientes')
  })
  it('solo acciones de mejora no cerradas', () => {
    const r = accionesParaInforme([
      { id: 1, es_mejora: true, cerrada: false },
      { id: 2, es_mejora: false, cerrada: false },
      { id: 3, es_mejora: true, cerrada: true },
    ])
    expect(r.map((x) => x.id)).toEqual([1])
  })
  it('texto para copiar', () => {
    const base = { anyo: 2026, fecha_inicio: '2026-09-01', fecha_fin: '2027-02-28' }
    expect(
      textoGrupo('en_proceso', [
        { ...base, codigo: 'AM-D110-2026-01', nombre: 'Difusión', estado: 'en_proceso', observaciones: 'Emails enviados' },
        { ...base, codigo: 'AM-D110-2026-02', nombre: 'Guías', estado: 'en_proceso', observaciones: null },
      ]),
    ).toBe(
      'AM-D110-2026-01. Difusión\nFecha de finalización prevista: 28/02/2027.\nEmails enviados\n\n' +
        'AM-D110-2026-02. Guías\nFecha de finalización prevista: 28/02/2027.\n(Sin observaciones)',
    )
    expect(textoGrupo('finalizadas', [{ ...base, codigo: 'X', nombre: 'N', estado: 'cancelada', observaciones: 'No procede' }]))
      .toBe('X. N\nEstado: Cancelada.\nNo procede')
  })
  it('detecta enlaces en las evidencias', () => {
    expect(trocearEnlaces('Acta: https://ua.es/acta.pdf. Ver también (https://x.org/a?b=1)')).toEqual([
      { texto: 'Acta: ' },
      { texto: 'https://ua.es/acta.pdf', url: 'https://ua.es/acta.pdf' },
      { texto: '. Ver también (' },
      { texto: 'https://x.org/a?b=1', url: 'https://x.org/a?b=1' },
      { texto: ')' },
    ])
    expect(trocearEnlaces('sin enlaces')).toEqual([{ texto: 'sin enlaces' }])
  })
})
