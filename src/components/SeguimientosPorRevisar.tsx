import { Anchor, Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconChecks } from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { fechaCorta } from '../lib/formato'
import { supabase } from '../lib/supabase'
import type { Accion, EntradaHistorial } from '../lib/tipos'
import { TextoConEnlaces } from './TextoConEnlaces'
import { useEstadoDesde } from '../lib/navegacion'

type Fila = EntradaHistorial & {
  acciones: Pick<Accion, 'id' | 'codigo' | 'nombre' | 'titulacion' | 'responsable'>
  perfiles: { nombre: string | null } | null
}

export function useSeguimientosPorRevisar(activo: boolean) {
  return useQuery({
    queryKey: ['por_revisar'],
    enabled: activo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historial')
        .select('*, acciones(id, codigo, nombre, titulacion, responsable), perfiles!historial_usuario_fkey(nombre)')
        .eq('requiere_revision', true)
        .is('revisado', null)
        .order('fecha', { ascending: false })
      if (error) throw error
      return data as Fila[]
    },
  })
}

export async function marcarRevisados(ids: number[], revisado = true) {
  const { error } = await supabase.rpc('marcar_revisados', { p_ids: ids, p_revisado: revisado })
  if (error) throw error
}

/**
 * Seguimientos registrados por las cuentas de coordinación transversal que la administración
 * todavía no ha revisado. Si algo no es correcto, se corrige con un nuevo seguimiento o editando la acción.
 */
export function SeguimientosPorRevisar() {
  const estadoDesde = useEstadoDesde()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data = [] } = useSeguimientosPorRevisar(true)
  const [guardando, setGuardando] = useState<number | 'todos' | null>(null)
  if (!data.length) return null

  async function revisar(ids: number[], clave: number | 'todos') {
    setGuardando(clave)
    try {
      await marcarRevisados(ids)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['por_revisar'] }),
        qc.invalidateQueries({ queryKey: ['historial'] }),
      ])
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se ha guardado', message: (e as Error).message })
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Paper withBorder p="md" bg="var(--mantine-color-yellow-light)">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Title order={4} fw={500}>Seguimientos de responsables por revisar</Title>
          <Badge color="yellow">{data.length}</Badge>
        </Group>
        {data.length > 1 && (
          <Button size="xs" variant="default" leftSection={<IconChecks size={14} />} loading={guardando === 'todos'}
            onClick={() => revisar(data.map((h) => h.id), 'todos')}>
            Marcar todos como revisados
          </Button>
        )}
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Cambios registrados por las cuentas de coordinación transversal. Si alguno no es correcto, ábrelo y corrígelo con
        un nuevo seguimiento o editando la acción.
      </Text>
      <Stack gap="xs">
        {data.map((h) => (
          <Paper key={h.id} withBorder p="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <Anchor component={Link} to={`/gestion/${h.acciones.titulacion}/accion/${h.acciones.id}`} state={estadoDesde} ff="monospace" size="sm">
                    {h.acciones.codigo}
                  </Anchor>
                  <Text size="sm" fw={500}>
                    {h.estado_anterior && h.estado_nuevo && h.estado_anterior !== h.estado_nuevo
                      ? `${t(`estado.${h.estado_anterior}`)} → ${t(`estado.${h.estado_nuevo}`)}`
                      : 'Nota de seguimiento'}
                  </Text>
                </Group>
                <Text size="sm" lineClamp={1}>{h.acciones.nombre}</Text>
                <Text size="xs" c="dimmed">
                  {h.perfiles?.nombre || h.usuario_email} ({h.acciones.responsable}) ·{' '}
                  {new Date(h.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                  {h.fecha_inicio && ` · Nuevo inicio: ${fechaCorta(h.fecha_inicio)}`}
                  {h.fecha_fin && ` · Nuevo fin: ${fechaCorta(h.fecha_fin)}`}
                </Text>
                {h.comentario && <TextoConEnlaces texto={h.comentario} size="sm" mt={4} lineClamp={3} />}
              </div>
              <Button size="xs" variant="light" color="green" leftSection={<IconCheck size={14} />} loading={guardando === h.id}
                onClick={() => revisar([h.id], h.id)}>
                Revisado
              </Button>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Paper>
  )
}
