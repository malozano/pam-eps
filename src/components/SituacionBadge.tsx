import { Badge, Tooltip } from '@mantine/core'
import { diasHasta, situacion, type Situacion } from '../lib/seguimiento'
import type { Accion } from '../lib/tipos'

const INFO: Partial<Record<Situacion, { texto: string; color: string }>> = {
  vencida: { texto: 'Vencida', color: 'red' },
  sin_iniciar: { texto: 'Debería haber empezado', color: 'orange' },
  proxima: { texto: 'Empieza pronto', color: 'yellow' },
}

/** Aviso de plazos de una acción abierta (no muestra nada si está en plazo o finalizada). */
export function SituacionBadge({ accion }: { accion: Pick<Accion, 'estado' | 'fecha_inicio' | 'fecha_fin'> }) {
  const s = situacion(accion)
  const info = INFO[s]
  if (!info) return null
  const detalle =
    s === 'vencida' && accion.fecha_fin
      ? `Terminó hace ${-diasHasta(accion.fecha_fin)} días`
      : s === 'sin_iniciar' && accion.fecha_inicio
        ? `Debía empezar hace ${-diasHasta(accion.fecha_inicio)} días y sigue pendiente`
        : accion.fecha_inicio
          ? `Empieza en ${diasHasta(accion.fecha_inicio)} días`
          : ''
  return (
    <Tooltip label={detalle} disabled={!detalle}>
      <Badge size="xs" color={info.color} variant="filled" style={{ overflow: 'visible' }}>
        {info.texto}
      </Badge>
    </Tooltip>
  )
}
