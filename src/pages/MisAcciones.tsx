import { Accordion, Alert, Anchor, Badge, Group, Paper, Skeleton, Stack, Table, Text, Title } from '@mantine/core'
import { IconExternalLink } from '@tabler/icons-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { EstadoBadge } from '../components/EstadoBadge'
import { SituacionBadge } from '../components/SituacionBadge'
import { FONDO_POR_REVISAR, MarcaPorRevisar, ProgresoRevision } from '../components/Revision'
import { SugerenciaNotificaciones } from '../components/SugerenciaNotificaciones'
import { anyoPorDefecto, etiquetaCurso } from '../lib/cursos'
import { fechaCorta } from '../lib/formato'
import { porPrioridad, PRIORIDADES } from '../lib/prioridad'
import { usePorRevisar } from '../lib/revision'
import { estaAbierta } from '../lib/seguimiento'
import type { Accion } from '../lib/tipos'
import { useAccionesTitulacion } from '../lib/useCatalogos'

function TablaAcciones({ acciones, verResponsable, porRevisar }: { acciones: Accion[]; verResponsable: boolean; porRevisar: Set<string> }) {
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table verticalSpacing={6} fz="sm" highlightOnHover>
        <Table.Tbody>
          {acciones.map((a) => (
            <Table.Tr key={a.id} style={porRevisar.has(a.id) ? { background: FONDO_POR_REVISAR } : undefined}>
              <Table.Td w={150} style={{ verticalAlign: 'top' }}>
                <Anchor component={Link} to={`/gestion/CEN/accion/${a.id}`} ff="monospace" size="sm">{a.codigo}</Anchor>
              </Table.Td>
              <Table.Td>
                <Text size="sm" lineClamp={2}>{a.nombre}</Text>
                <Group gap={4} mt={2}>
                  <SituacionBadge accion={a} />
                  {verResponsable && a.responsable && <Badge size="xs" variant="outline" color="gray" tt="none">{a.responsable}</Badge>}
                </Group>
              </Table.Td>
              <Table.Td w={190} style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                {fechaCorta(a.fecha_inicio)} – {fechaCorta(a.fecha_fin)}
              </Table.Td>
              <Table.Td w={120} style={{ verticalAlign: 'top' }}>
                <EstadoBadge estado={a.estado} />
                {porRevisar.has(a.id) && <MarcaPorRevisar />}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

/**
 * Inicio de una cuenta de coordinación transversal: las acciones del plan del centro de sus
 * responsabilidades, por prioridad, y el histórico de las ya completadas o canceladas.
 */
export function MisAcciones() {
  const { t } = useTranslation()
  const { perfil, responsabilidades } = useAuth()
  const { data: acciones = [], isLoading } = useAccionesTitulacion('CEN')
  const grupos = useMemo(() => porPrioridad(acciones), [acciones])
  const historico = useMemo(() => {
    const m = new Map<number, Accion[]>()
    for (const a of acciones.filter((x) => !estaAbierta(x.estado))) m.set(a.anyo, [...(m.get(a.anyo) ?? []), a])
    return [...m.entries()].sort(([x], [y]) => y - x)
  }, [acciones])
  const abiertas = acciones.filter((a) => estaAbierta(a.estado)).length
  const varias = responsabilidades.length > 1
  const rev = usePorRevisar('CEN', 'centro')

  return (
    <Stack maw={1100}>
      <div>
        <Title order={2}>{t('inicio.bienvenida', { nombre: perfil?.nombre || perfil?.email })}</Title>
        <Group gap={6} mt={4}>
          <Text size="sm" c="dimmed">Responsable en el plan del centro de:</Text>
          {responsabilidades.map((r) => <Badge key={r} variant="light" tt="none">{r}</Badge>)}
        </Group>
      </div>
      <SugerenciaNotificaciones />
      {rev.revision && rev.filas.length > 0 && (
        <ProgresoRevision revision={rev.revision} total={rev.filas.length} revisadas={rev.revisadas}>
          {rev.porRevisar.size > 0 && (
            <Text size="sm" fw={500}>
              Te {rev.porRevisar.size === 1 ? 'queda 1 acción' : `quedan ${rev.porRevisar.size} acciones`} por revisar
            </Text>
          )}
        </ProgresoRevision>
      )}

      {responsabilidades.length === 0 ? (
        <Alert color="yellow">
          Tu cuenta todavía no tiene responsabilidades asignadas en el plan del centro. Ponte en contacto con la
          coordinación de calidad.
        </Alert>
      ) : isLoading ? (
        <Skeleton h={300} />
      ) : (
        <>
          <Text size="sm">
            {abiertas === 0
              ? 'No tienes acciones abiertas.'
              : `Tienes ${abiertas === 1 ? '1 acción abierta' : `${abiertas} acciones abiertas`}. Entra en cada una para registrar su seguimiento (lo realizado, evidencias, cambios de estado o de fechas).`}
          </Text>
          {PRIORIDADES.filter(({ prioridad }) => grupos[prioridad].length > 0).map(({ prioridad, titulo, ayuda, color }) => (
            <Paper key={prioridad} withBorder p="md">
              <Group gap="xs" mb={2}>
                <Title order={4}>{titulo}</Title>
                <Badge color={color}>{grupos[prioridad].length}</Badge>
              </Group>
              <Text size="xs" c="dimmed" mb="xs">{ayuda}</Text>
              <TablaAcciones acciones={grupos[prioridad]} verResponsable={varias} porRevisar={rev.porRevisar} />
            </Paper>
          ))}

          {historico.length > 0 && (
            <>
              <Title order={4} mt="sm">Histórico: acciones completadas o canceladas</Title>
              <Accordion variant="separated">
                {historico.map(([anyo, lista]) => (
                  <Accordion.Item key={anyo} value={String(anyo)}>
                    <Accordion.Control>
                      <Group gap="xs">
                        <Text fw={500}>Curso {etiquetaCurso(anyo)}</Text>
                        <Badge variant="light" color="gray">{lista.length}</Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel><TablaAcciones acciones={lista} verResponsable={varias} porRevisar={rev.porRevisar} /></Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            </>
          )}
        </>
      )}

      <Anchor href={`${import.meta.env.BASE_URL}plan/CEN/${anyoPorDefecto()}`} target="_blank" size="sm">
        <Group gap={4}>Plan de acciones del centro publicado <IconExternalLink size={14} /></Group>
      </Anchor>
    </Stack>
  )
}
