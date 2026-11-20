import { Alert, Anchor, Stack, Title } from '@mantine/core'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useTitulaciones } from '../lib/useTitulaciones'

/** Gestión del plan de una titulación. Se completa en la fase 3 (listado, alta, edición y borrado). */
export function GestionPlan() {
  const { codigo = '' } = useParams()
  const { esAdmin, titulaciones } = useAuth()
  const { data } = useTitulaciones()
  if (!esAdmin && !titulaciones.includes(codigo)) return <Navigate to="/" replace />
  const tit = data?.find((x) => x.codigo === codigo)
  return (
    <Stack>
      <Anchor component={Link} to="/" size="sm">
        ← Inicio
      </Anchor>
      <Title order={2}>{tit?.nombre ?? codigo}</Title>
      <Alert color="blue">La gestión de acciones se incorporará en la fase 3.</Alert>
    </Stack>
  )
}
