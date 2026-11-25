import {
  Alert, Anchor, Badge, Button, CopyButton, Group, Modal, Paper, Progress, Stack, Table, Text, TextInput, Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconCopy, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProgresoRevision } from '../../components/Revision'
import { pendientesPorResponsable, textoListado } from '../../lib/consultas'
import { tituloPropuesto, useEstadoRevision, useRevisiones, type AmbitoRevision, type Revision } from '../../lib/revision'
import { supabase } from '../../lib/supabase'
import type { Accion } from '../../lib/tipos'
import { useTitulaciones } from '../../lib/useTitulaciones'
import { useEstadoDesde } from '../../lib/navegacion'

const urlApp = () => `${window.location.origin}${import.meta.env.BASE_URL}`
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

const AMBITOS: { ambito: AmbitoRevision; titulo: string; ayuda: string }[] = [
  {
    ambito: 'centro',
    titulo: 'Plan del centro',
    ayuda: 'Para el informe anual de centro (CEN02). Las cuentas de coordinación transversal ven sus acciones por revisar en «Mis acciones».',
  },
  {
    ambito: 'titulaciones',
    titulo: 'Planes de titulación',
    ayuda: 'Para los informes de titulación (CEN10, CEN19). Cada coordinación ve sus acciones por revisar en el inicio y en su plan, y un aviso al preparar el informe si le faltan.',
  },
]

function useInvalidar() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['revisiones'] }), qc.invalidateQueries({ queryKey: ['estado_revision'] })])
}

/** Detalle de una revisión en curso: progreso por titulación o por responsable. */
function DetalleRevision({ revision, acciones }: { revision: Revision; acciones: Accion[] }) {
  const { data: tits = [] } = useTitulaciones()
  const { data: filas = [], isLoading } = useEstadoRevision(revision.id)
  const invalidar = useInvalidar()
  const revisadas = filas.filter((f) => f.revisada).length
  const pendientes = useMemo(() => {
    const ids = new Set(filas.filter((f) => !f.revisada).map((f) => f.accion_id))
    return acciones.filter((a) => ids.has(a.id))
  }, [filas, acciones])

  const finalizar = () =>
    modals.openConfirmModal({
      title: 'Finalizar la revisión',
      children: (
        <Text size="sm">
          Se cerrará «{revision.titulo}» con {revisadas} de {filas.length} acciones revisadas. Dejarán de mostrarse los
          avisos de acciones por revisar. Podrás abrir otra revisión cuando la necesites.
        </Text>
      ),
      labels: { confirm: 'Finalizar', cancel: 'Cancelar' },
      onConfirm: async () => {
        const { error } = await supabase.rpc('finalizar_revision', { p_revision: revision.id })
        if (error) return notifications.show({ color: 'red', title: 'No se ha guardado', message: error.message })
        await invalidar()
        notifications.show({ color: 'green', message: 'Revisión finalizada' })
      },
    })

  return (
    <Stack>
      <ProgresoRevision revision={revision} total={filas.length} revisadas={revisadas}>
        <Button size="xs" variant="default" leftSection={<IconPlayerStop size={14} />} onClick={finalizar}>
          Finalizar revisión
        </Button>
      </ProgresoRevision>
      {isLoading ? null : revision.ambito === 'titulaciones' ? (
        <PorTitulacion filas={filas} tits={tits} />
      ) : (
        <PorResponsable pendientes={pendientes} />
      )}
    </Stack>
  )
}

function PorTitulacion({ filas, tits }: { filas: { titulacion: string; revisada: boolean }[]; tits: { codigo: string; nombre: string }[] }) {
  const porTit = new Map<string, { total: number; revisadas: number }>()
  for (const f of filas) {
    const c = porTit.get(f.titulacion) ?? { total: 0, revisadas: 0 }
    c.total++
    if (f.revisada) c.revisadas++
    porTit.set(f.titulacion, c)
  }
  const lista = [...porTit.entries()].sort(([a, x], [b, y]) => y.total - y.revisadas - (x.total - x.revisadas) || a.localeCompare(b))
  return (
    <Table.ScrollContainer minWidth={600}>
      <Table verticalSpacing={6} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Titulación</Table.Th>
            <Table.Th w="35%">Progreso</Table.Th>
            <Table.Th ta="right">Revisadas</Table.Th>
            <Table.Th ta="right">Por revisar</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lista.map(([t, c]) => (
            <Table.Tr key={t}>
              <Table.Td>
                <Anchor component={Link} to={`/gestion/${t}?revision=1`} size="sm" fw={500}>{t}</Anchor>
                <Text size="xs" c="dimmed" lineClamp={1}>{tits.find((x) => x.codigo === t)?.nombre}</Text>
              </Table.Td>
              <Table.Td>
                <Progress value={(c.revisadas / c.total) * 100} color={c.revisadas === c.total ? 'green' : 'blue'} aria-label={`Progreso de ${t}`} />
              </Table.Td>
              <Table.Td ta="right">{c.revisadas} de {c.total}</Table.Td>
              <Table.Td ta="right">
                {c.total - c.revisadas ? <Badge color="blue">{c.total - c.revisadas}</Badge> : <Badge color="green" variant="light">Completa</Badge>}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

function PorResponsable({ pendientes }: { pendientes: Accion[] }) {
  const estadoDesde = useEstadoDesde()
  const grupos = pendientesPorResponsable(pendientes, false)
  if (!grupos.length) return <Alert color="green">Todas las acciones del plan del centro están revisadas.</Alert>
  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        Acciones por revisar de cada responsable. Copia el listado para recordárselo por correo.
      </Text>
      {grupos.map((g) => (
        <Paper key={g.clave} withBorder p="sm">
          <Group justify="space-between">
            <Group gap="xs">
              <Text fw={500} size="sm">{g.responsable}</Text>
              <Badge color="blue">{g.acciones.length}</Badge>
            </Group>
            <CopyButton value={textoListado(g, urlApp(), undefined, 'Acciones por revisar')}>
              {({ copied, copy }) => (
                <Button size="xs" variant={copied ? 'light' : 'default'} color={copied ? 'green' : undefined}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />} onClick={copy}>
                  {copied ? 'Copiado' : 'Copiar listado'}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Group gap="xs" mt={4}>
            {g.acciones.map((a) => (
              <Anchor key={a.id} component={Link} to={`/gestion/CEN/accion/${a.id}`} state={estadoDesde} ff="monospace" size="sm">{a.codigo}</Anchor>
            ))}
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}

/** Pestaña de Consultas: abrir, seguir y finalizar las revisiones del estado de las acciones. */
export function RevisionEstado({ acciones }: { acciones: Accion[] }) {
  const { data: revisiones = [] } = useRevisiones()
  const invalidar = useInvalidar()
  const [abriendo, setAbriendo] = useState<AmbitoRevision | null>(null)
  const [titulo, setTitulo] = useState('')
  const finalizadas = revisiones.filter((r) => r.fin)

  async function iniciar() {
    const { error } = await supabase.from('revisiones').insert({ ambito: abriendo, titulo: titulo.trim() })
    if (error) return notifications.show({ color: 'red', title: 'No se ha podido iniciar', message: error.message })
    setAbriendo(null)
    await invalidar()
    notifications.show({ color: 'green', message: 'Revisión iniciada' })
  }

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Antes de un informe, abre una revisión para que se actualice el estado de todas las acciones abiertas. Una acción
        queda revisada cuando se registra su seguimiento o se confirma su estado actual (si no ha cambiado). Recibirás un
        aviso cuando estén todas revisadas.
      </Text>
      {AMBITOS.map(({ ambito, titulo: t, ayuda }) => {
        const activa = revisiones.find((r) => r.ambito === ambito && !r.fin)
        return (
          <Paper key={ambito} withBorder p="md">
            <Title order={4}>{t}</Title>
            <Text size="xs" c="dimmed" mb="sm">{ayuda}</Text>
            {activa ? (
              <DetalleRevision revision={activa} acciones={acciones} />
            ) : (
              <Button variant="light" leftSection={<IconPlayerPlay size={16} />}
                onClick={() => { setTitulo(tituloPropuesto(ambito)); setAbriendo(ambito) }}>
                Iniciar revisión
              </Button>
            )}
          </Paper>
        )
      })}
      {finalizadas.length > 0 && (
        <Paper withBorder p="md">
          <Title order={5} mb="xs">Revisiones anteriores</Title>
          <Table fz="sm" verticalSpacing={4}>
            <Table.Tbody>
              {finalizadas.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{r.titulo}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fecha(r.inicio)} – {fecha(r.fin!)}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>{r.revisadas} de {r.total} revisadas</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <Modal opened={abriendo !== null} onClose={() => setAbriendo(null)} title="Iniciar revisión del estado" size="lg">
        <Stack>
          <Text size="sm">
            {abriendo === 'centro'
              ? 'Entrarán todas las acciones abiertas del plan del centro. Las cuentas de coordinación transversal verán las suyas marcadas como «Por revisar».'
              : 'Entrarán todas las acciones abiertas de los planes de titulación. Cada coordinación verá en su inicio y en su plan las que le quedan, y un aviso al preparar el informe de seguimiento.'}
          </Text>
          <TextInput label="Nombre de la revisión" value={titulo} onChange={(e) => setTitulo(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbriendo(null)}>Cancelar</Button>
            <Button onClick={iniciar} disabled={!titulo.trim()}>Iniciar revisión</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
