import { Alert, Button, Group, Text } from '@mantine/core'
import { IconBell } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEstadoPush } from './Notificaciones'

const CLAVE = 'sugerencia-notificaciones-cerrada'

/** Invita a activar las notificaciones en este dispositivo (se puede descartar). */
export function SugerenciaNotificaciones() {
  const { data: estado } = useEstadoPush()
  const [cerrada, setCerrada] = useState(() => {
    try {
      return localStorage.getItem(CLAVE) === '1'
    } catch {
      return false
    }
  })
  if (cerrada || estado !== 'inactivo') return null
  const cerrar = () => {
    setCerrada(true)
    try {
      localStorage.setItem(CLAVE, '1')
    } catch {
      /* sin almacenamiento */
    }
  }
  return (
    <Alert icon={<IconBell size={18} />} color="indigo" variant="light" withCloseButton onClose={cerrar} closeButtonLabel="No mostrar más">
      <Group justify="space-between" gap="xs">
        <Text size="sm">Activa las notificaciones para recibir los avisos de plazos de tus acciones en este dispositivo.</Text>
        <Button size="xs" component={Link} to="/perfil">
          Activar
        </Button>
      </Group>
    </Alert>
  )
}
