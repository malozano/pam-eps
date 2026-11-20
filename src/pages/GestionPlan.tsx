import { Alert, Anchor, Badge, Button, Group, Skeleton, Stack, Table, Text, Title } from '@mantine/core'
import { IconFileImport } from '@tabler/icons-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { EstadoBadge } from '../components/EstadoBadge'
import { etiquetaCurso } from '../lib/cursos'
import { fechaCorta } from '../lib/formato'
import { useAccionesTitulacion } from '../lib/useCatalogos'
import { useTitulaciones } from '../lib/useTitulaciones'

/** Plan de una titulación. De momento es un listado de consulta; en la fase 3 se añaden alta, edición y borrado. */
export function GestionPlan() {
  const { codigo = '' } = useParams()
  const { esAdmin, titulaciones } = useAuth()
  const { data: tits } = useTitulaciones()
  const { data: acciones, isLoading, error } = useAccionesTitulacion(codigo)
  if (!esAdmin && !titulaciones.includes(codigo)) return <Navigate to="/" replace />
  const tit = tits?.find((x) => x.codigo === codigo)

  return (
    <Stack>
      <Anchor component={Link} to="/" size="sm">
        ← Inicio
      </Anchor>
      <Group justify="space-between" align="flex-end">
        <div>
          <Badge variant="light">{codigo}</Badge>
          <Title order={2}>{tit?.nombre ?? codigo}</Title>
        </div>
        <Button component={Link} to={`/gestion/${codigo}/importar`} variant="light" leftSection={<IconFileImport size={16} />}>
          Importar Excel
        </Button>
      </Group>
      {error && <Alert color="red">{(error as Error).message}</Alert>}
      {isLoading ? (
        <Skeleton h={200} />
      ) : !acciones?.length ? (
        <Alert color="blue">
          Este plan todavía no tiene acciones. Puedes importar el Excel actual con «Importar Excel».
        </Alert>
      ) : (
        <Table.ScrollContainer minWidth={800}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Código</Table.Th>
                <Table.Th>Acción</Table.Th>
                <Table.Th>Curso</Table.Th>
                <Table.Th>Inicio</Table.Th>
                <Table.Th>Fin</Table.Th>
                <Table.Th>Estado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {acciones.map((a) => (
                <Table.Tr key={a.id} opacity={a.cerrada ? 0.6 : 1}>
                  <Table.Td>
                    <Text size="sm" ff="monospace" style={{ whiteSpace: 'nowrap' }}>{a.codigo}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2}>{a.nombre}</Text>
                    <Group gap={4}>
                      {!a.es_mejora && <Badge size="xs" variant="outline" color="gray">No es acción de mejora</Badge>}
                      {a.cerrada && <Badge size="xs" variant="outline" color="gray">Cerrada</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{etiquetaCurso(a.anyo)}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(a.fecha_inicio)}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(a.fecha_fin)}</Table.Td>
                  <Table.Td miw={130}><EstadoBadge estado={a.estado} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  )
}
