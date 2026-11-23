import {
  Alert, Anchor, Badge, Button, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Timeline, Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
  IconArchive, IconArchiveOff, IconCalendarEvent, IconCheck, IconChecklist, IconFileImport, IconNote, IconPencil, IconPlus,
} from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { EstadoBadge } from '../components/EstadoBadge'
import { ListaIndicadores } from '../components/ListaIndicadores'
import { SeguimientoModal } from '../components/SeguimientoModal'
import { marcarRevisados } from '../components/SeguimientosPorRevisar'
import { SituacionBadge } from '../components/SituacionBadge'
import { TextoConEnlaces } from '../components/TextoConEnlaces'
import { etiquetaCurso } from '../lib/cursos'
import { fechaCorta } from '../lib/formato'
import { estaAbierta } from '../lib/seguimiento'
import { supabase } from '../lib/supabase'
import type { EntradaHistorial } from '../lib/tipos'
import { useAccionesTitulacion, useHistorial } from '../lib/useCatalogos'
import { useTitulaciones } from '../lib/useTitulaciones'

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text size="sm" component="div">
        {children}
      </Text>
    </div>
  )
}

const ICONO: Record<EntradaHistorial['tipo'], ReactNode> = {
  alta: <IconPlus size={14} />,
  importacion: <IconFileImport size={14} />,
  estado: <IconChecklist size={14} />,
  seguimiento: <IconNote size={14} />,
  cierre: <IconArchive size={14} />,
}

/** Ficha de una acción: datos, seguimiento (cambios de estado, cierre) e historial. */
export function FichaAccion() {
  const { codigo = '', id = '' } = useParams()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { esAdmin, esTransversal, titulaciones: mias } = useAuth()
  const { data: titulaciones = [] } = useTitulaciones()
  const { data: acciones = [], isLoading } = useAccionesTitulacion(codigo)
  const { data: historial = [], isLoading: cargandoHistorial } = useHistorial(id)
  const [seguimiento, setSeguimiento] = useState(false)

  // Las cuentas transversales solo consultan (y registran el seguimiento de) sus acciones del CEN
  const soloSeguimiento = esTransversal && codigo === 'CEN'
  if (!esAdmin && !mias.includes(codigo) && !soloSeguimiento) return <Navigate to="/" replace />
  if (isLoading) return <Skeleton h={400} />
  const a = acciones.find((x) => x.id === id)
  const tit = titulaciones.find((x) => x.codigo === codigo)
  if (!a)
    return (
      <Alert color="red" title="Acción no encontrada">
        <Anchor component={Link} to={soloSeguimiento ? '/' : `/gestion/${codigo}`}>Volver</Anchor>
      </Alert>
    )

  const cambiarCerrada = (cerrada: boolean) =>
    modals.openConfirmModal({
      title: cerrada ? 'Marcar como cerrada' : 'Quitar la marca de cerrada',
      children: (
        <Text size="sm">
          {cerrada
            ? 'Indica que el resultado de la acción ya se ha reportado en un informe de seguimiento. Pasará al histórico y dejará de aparecer en los próximos informes.'
            : 'La acción volverá a aparecer en el próximo informe de seguimiento.'}
        </Text>
      ),
      labels: { confirm: cerrada ? 'Marcar como cerrada' : 'Quitar marca', cancel: 'Cancelar' },
      onConfirm: async () => {
        const { error } = await supabase.rpc('marcar_cerradas', { p_acciones: [a.id], p_cerrada: cerrada })
        if (error) {
          notifications.show({ color: 'red', title: 'No se ha guardado', message: error.message })
          return
        }
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['acciones'] }),
          qc.invalidateQueries({ queryKey: ['historial', a.id] }),
        ])
        notifications.show({ color: 'green', message: cerrada ? 'Acción cerrada' : 'Marca de cerrada retirada' })
      },
    })

  return (
    <Stack maw={960}>
      <Anchor component={Link} to={soloSeguimiento ? '/' : `/gestion/${codigo}`} size="sm">
        ← {soloSeguimiento ? 'Mis acciones' : tit ? `Plan ${tit.codigo}` : 'Volver al plan'}
      </Anchor>

      <Stack gap={6}>
        <Group gap="xs">
          <Text ff="monospace" fw={600}>{a.codigo}</Text>
          <Badge variant="light">Curso {etiquetaCurso(a.anyo)}</Badge>
          <EstadoBadge estado={a.estado} />
          {a.cerrada && <Badge variant="outline" color="gray">Cerrada</Badge>}
          {!a.es_mejora && <Badge variant="outline" color="gray">No es acción de mejora</Badge>}
          <SituacionBadge accion={a} />
        </Group>
        <Title order={2}>{a.nombre}</Title>
      </Stack>

      <Group gap="xs">
        <Button leftSection={<IconNote size={16} />} onClick={() => setSeguimiento(true)}>
          Registrar seguimiento
        </Button>
        {!soloSeguimiento && (
          <Button variant="default" leftSection={<IconPencil size={16} />} component={Link} to="editar">
            Editar
          </Button>
        )}
        {!soloSeguimiento && !estaAbierta(a.estado) &&
          (a.cerrada ? (
            <Button variant="subtle" color="gray" leftSection={<IconArchiveOff size={16} />} onClick={() => cambiarCerrada(false)}>
              Quitar marca de cerrada
            </Button>
          ) : (
            <Button variant="light" color="gray" leftSection={<IconArchive size={16} />} onClick={() => cambiarCerrada(true)}>
              Marcar como cerrada
            </Button>
          ))}
      </Group>

      <Paper withBorder p="md">
        <Stack>
          {a.tareas && (
            <Dato etiqueta="Tareas">
              <TextoConEnlaces texto={a.tareas} size="sm" />
            </Dato>
          )}
          <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
            <Dato etiqueta="Responsable">{a.responsable ?? '—'}</Dato>
            <Dato etiqueta="Fechas">
              {fechaCorta(a.fecha_inicio)} – {fechaCorta(a.fecha_fin)}
            </Dato>
            <Dato etiqueta={a.indicadores.length > 1 ? 'Indicadores' : 'Indicador'}>
              <ListaIndicadores indicadores={a.indicadores} marcarInactivos />
            </Dato>
            <Dato etiqueta="Origen">{a.origen ?? '—'}</Dato>
            {a.presupuesto !== null && (
              <Dato etiqueta="Presupuesto">
                {a.presupuesto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </Dato>
            )}
          </SimpleGrid>
          <Dato etiqueta="Observaciones">
            {a.observaciones ? <TextoConEnlaces texto={a.observaciones} size="sm" /> : <Text size="sm" c="dimmed">Sin observaciones</Text>}
          </Dato>
        </Stack>
      </Paper>

      <Title order={4} mt="sm">
        Historial
      </Title>
      {cargandoHistorial ? (
        <Skeleton h={120} />
      ) : (
        <Timeline bulletSize={24} lineWidth={2}>
          {historial.map((h) => {
            const cambio = h.estado_anterior && h.estado_nuevo && h.estado_anterior !== h.estado_nuevo
            const titulo =
              h.tipo === 'alta'
                ? 'Alta de la acción'
                : h.tipo === 'importacion'
                  ? 'Importada desde Excel'
                  : h.tipo === 'cierre'
                    ? (h.comentario ?? 'Cierre')
                    : cambio
                      ? `${t(`estado.${h.estado_anterior}`)} → ${t(`estado.${h.estado_nuevo}`)}`
                      : 'Nota de seguimiento'
            return (
              <Timeline.Item key={h.id} bullet={ICONO[h.tipo]} title={<Text size="sm" fw={500}>{titulo}</Text>}>
                <Text size="xs" c="dimmed">
                  {new Date(h.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                  {h.usuario_email && ` · ${h.usuario_email}`}
                </Text>
                {esAdmin && h.requiere_revision && !h.revisado && (
                  <Group gap="xs" mt={4}>
                    <Badge color="yellow" size="sm">Pendiente de revisar</Badge>
                    <Button size="compact-xs" variant="light" color="green" leftSection={<IconCheck size={12} />}
                      onClick={() => marcarRevisados([h.id]).then(() => Promise.all([
                        qc.invalidateQueries({ queryKey: ['historial', a.id] }),
                        qc.invalidateQueries({ queryKey: ['por_revisar'] }),
                      ])).catch((e: Error) => notifications.show({ color: 'red', title: 'No se ha guardado', message: e.message }))}>
                      Marcar como revisado
                    </Button>
                  </Group>
                )}
                {h.tipo !== 'cierre' && h.tipo !== 'alta' && h.tipo !== 'importacion' && h.comentario && (
                  <TextoConEnlaces texto={h.comentario} size="sm" mt={4} />
                )}
                {h.evidencias && (
                  <Paper bg="var(--mantine-color-gray-light)" p="xs" mt={4}>
                    <Text size="xs" fw={600} c="dimmed">Evidencias</Text>
                    <TextoConEnlaces texto={h.evidencias} size="sm" />
                  </Paper>
                )}
                {(h.fecha_inicio || h.fecha_fin) && (
                  <Group gap={4} mt={4}>
                    <IconCalendarEvent size={14} />
                    <Text size="xs">
                      {h.fecha_inicio && `Nuevo inicio: ${fechaCorta(h.fecha_inicio)}. `}
                      {h.fecha_fin && `Nuevo fin: ${fechaCorta(h.fecha_fin)}.`}
                    </Text>
                  </Group>
                )}
              </Timeline.Item>
            )
          })}
        </Timeline>
      )}

      <SeguimientoModal accion={a} opened={seguimiento} onClose={() => setSeguimiento(false)} />
    </Stack>
  )
}
