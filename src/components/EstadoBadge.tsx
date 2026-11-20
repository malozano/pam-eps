import { Badge } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { EstadoAccion } from '../lib/tipos'

const COLORES: Record<EstadoAccion, string> = {
  pendiente: 'gray',
  en_proceso: 'blue',
  completada: 'green',
  cancelada: 'red',
}

export function EstadoBadge({ estado }: { estado: EstadoAccion }) {
  const { t } = useTranslation()
  return (
    <Badge color={COLORES[estado]} variant="light" style={{ overflow: 'visible' }}>
      {t(`estado.${estado}`)}
    </Badge>
  )
}
