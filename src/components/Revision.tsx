import { Alert, Anchor, Button, Group, Paper, Progress, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChecks, IconClipboardCheck, IconClockHour4 } from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { confirmarEstado, usePorRevisar, useRevisiones, type Revision } from '../lib/revision'
import { supabase } from '../lib/supabase'
import type { Accion } from '../lib/tipos'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

/** Cabecera de una revisión en curso con su progreso. */
export function ProgresoRevision({ revision, total, revisadas, children }: {
  revision: Revision
  total: number
  revisadas: number
  children?: ReactNode
}) {
  const pendientes = total - revisadas
  return (
    <Paper withBorder p="sm" bg={pendientes ? 'var(--mantine-color-blue-light)' : 'var(--mantine-color-green-light)'}>
      <Group justify="space-between" align="flex-start" gap="xs">
        <div style={{ flex: '1 1 320px' }}>
          <Group gap={6}>
            <IconClipboardCheck size={18} />
            <Text fw={600} size="sm">{revision.titulo}</Text>
          </Group>
          <Text size="xs" c="dimmed">
            Revisión del estado de las acciones abierta el {fecha(revision.inicio)}. Registra el seguimiento de cada acción o,
            si no ha cambiado, confirma su estado actual.
          </Text>
        </div>
        {children}
      </Group>
      <Group gap="xs" mt="xs" wrap="nowrap">
        <Progress value={total ? (revisadas / total) * 100 : 100} color={pendientes ? 'blue' : 'green'} style={{ flex: 1 }} aria-label="Progreso de la revisión" />
        <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>
          {pendientes ? `${revisadas} de ${total} revisadas` : total ? 'Todas revisadas' : 'Sin acciones que revisar'}
        </Text>
      </Group>
    </Paper>
  )
}

/** Fondo de las filas de acciones pendientes de revisar */
export const FONDO_POR_REVISAR = 'var(--mantine-color-blue-0)'

/** Marca «Por revisar», debajo del estado (lo que hay que revisar es el estado). */
export function MarcaPorRevisar() {
  return (
    <Group gap={4} wrap="nowrap" mt={4} c="blue.8">
      <IconClockHour4 size={14} aria-hidden />
      <Text size="xs" fw={500} c="blue.8" style={{ whiteSpace: 'nowrap' }}>Por revisar</Text>
    </Group>
  )
}

/** Botón para confirmar el estado actual de una acción (cuenta como revisada, sin más datos). */
export function BotonConfirmarEstado({ accion, size = 'sm' }: { accion: Pick<Accion, 'id' | 'estado'>; size?: 'xs' | 'sm' }) {
  const qc = useQueryClient()
  const [enviando, setEnviando] = useState(false)
  async function confirmar() {
    setEnviando(true)
    try {
      await confirmarEstado(accion)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['estado_revision'] }),
        qc.invalidateQueries({ queryKey: ['historial', accion.id] }),
        qc.invalidateQueries({ queryKey: ['revisiones'] }),
      ])
      notifications.show({ color: 'green', message: 'Estado confirmado: acción revisada' })
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se ha guardado', message: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Button size={size} variant="light" color="blue" leftSection={<IconChecks size={16} />} loading={enviando} onClick={confirmar} w="fit-content">
      Confirmar estado actual
    </Button>
  )
}

/** Aviso en la ficha de una acción pendiente de revisar. */
export function AvisoAccionPorRevisar({ accion }: { accion: Accion }) {
  const { revision, porRevisar } = usePorRevisar(accion.titulacion, accion.titulacion === 'CEN' ? 'centro' : 'titulaciones')
  if (!revision || !porRevisar.has(accion.id)) return null
  return (
    <Alert color="blue" variant="light" icon={<IconClockHour4 size={18} />} title="Pendiente de revisar">
      <Stack gap="xs">
        <Text size="sm">
          {revision.titulo}. Si la acción ha avanzado, se ha completado o ha cambiado su plazo, usa «Registrar
          seguimiento». Si sigue igual, confirma su estado actual (no hace falta escribir nada).
        </Text>
        <BotonConfirmarEstado accion={accion} />
      </Stack>
    </Alert>
  )
}

/** En el inicio de la coordinación de titulación: revisión en curso y acciones que le quedan. */
export function AvisoRevisionInicio() {
  const { esAdmin, titulaciones } = useAuth()
  const { revision, filas, porRevisar, revisadas } = usePorRevisar(null, 'titulaciones')
  if (esAdmin || !revision || !filas.length) return null
  const planes = titulaciones.filter((t) => filas.some((f) => f.titulacion === t))
  return (
    <ProgresoRevision revision={revision} total={filas.length} revisadas={revisadas}>
      <Group gap="xs">
        {planes.map((t) => {
          const n = filas.filter((f) => f.titulacion === t && porRevisar.has(f.accion_id)).length
          return (
            <Anchor key={t} component={Link} to={`/gestion/${t}?revision=1`} size="sm">
              {t}: {n ? `${n} por revisar` : 'revisado'}
            </Anchor>
          )
        })}
      </Group>
    </ProgresoRevision>
  )
}

/** En el inicio de la administración: revisiones en curso con su progreso global. */
export function AvisoRevisionesAdmin() {
  const { data: revisiones = [] } = useRevisiones()
  const activas = revisiones.filter((r) => !r.fin)
  const { data: recuentos = [] } = useQuery({
    queryKey: ['estado_revision', 'recuentos', activas.map((r) => r.id).join(',')],
    enabled: activas.length > 0,
    queryFn: () =>
      Promise.all(
        activas.map(async (r) => {
          const { data, error } = await supabase.rpc('recuento_revision', { p_revision: r.id }).single()
          if (error) throw error
          return { id: r.id, ...(data as { total: number; revisadas: number }) }
        }),
      ),
  })
  if (!activas.length) return null
  return (
    <Stack gap="xs">
      {activas.map((r) => {
        const c = recuentos.find((x) => x.id === r.id)
        return (
          <ProgresoRevision key={r.id} revision={r} total={c?.total ?? 0} revisadas={c?.revisadas ?? 0}>
            <Anchor component={Link} to="/admin/consultas?tab=revision" size="sm">
              Ver el detalle{r.ambito === 'titulaciones' ? ' por titulación' : ' por responsable'}
            </Anchor>
          </ProgresoRevision>
        )
      })}
    </Stack>
  )
}

/** En la página del informe de seguimiento: acciones del plan que faltan por revisar. */
export function AvisoRevisionInforme({ titulacion, acciones }: { titulacion: string; acciones: Accion[] }) {
  const { revision, porRevisar } = usePorRevisar(titulacion, titulacion === 'CEN' ? 'centro' : 'titulaciones')
  if (!revision || !porRevisar.size) return null
  const lista = acciones.filter((a) => porRevisar.has(a.id))
  return (
    <Alert color="blue" icon={<IconClockHour4 size={18} />} title={`Quedan ${porRevisar.size === 1 ? '1 acción' : `${porRevisar.size} acciones`} por revisar`}>
      <Text size="sm">
        {revision.titulo}. Antes de cerrar el informe, registra el seguimiento de estas acciones o confirma su estado actual
        si no han cambiado:
      </Text>
      <Group gap="xs" mt={6}>
        {lista.map((a) => (
          <Anchor key={a.id} component={Link} to={`/gestion/${titulacion}/accion/${a.id}`} ff="monospace" size="sm">{a.codigo}</Anchor>
        ))}
      </Group>
    </Alert>
  )
}
