import { Alert, Badge, Button, Group, Paper, Stack, Switch, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBell, IconBellOff, IconCalendarStats, IconMail, IconSend } from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  activarPush, desactivarPush, enviarEmailPrueba, enviarMiResumen, estadoEmail, enviarPrueba, estadoPush, type EstadoPush,
} from '../lib/push'
import { supabase } from '../lib/supabase'

/** Estado del envío por email; se vuelve a consultar cada vez que se abre la página. */
export function useEstadoEmail() {
  return useQuery({ queryKey: ['estado_email'], queryFn: () => estadoEmail(), staleTime: 0, refetchOnMount: 'always' })
}

export function useEstadoPush() {
  return useQuery({ queryKey: ['estado_push'], queryFn: estadoPush, staleTime: 30_000 })
}

const EXPLICACION: Partial<Record<EstadoPush, string>> = {
  'no-soportado': 'Este navegador no admite notificaciones push.',
  'requiere-instalar':
    'En iPhone y iPad las notificaciones solo funcionan con la aplicación instalada (Compartir → «Añadir a pantalla de inicio») y iOS 16.4 o posterior. Ábrela desde su icono y actívalas aquí.',
  'sin-service-worker': 'Las notificaciones solo están disponibles en la versión publicada de la aplicación.',
  bloqueado:
    'Has bloqueado las notificaciones para esta aplicación. Para recibirlas, permítelas en los ajustes del navegador o del sistema y vuelve aquí.',
}

/** Sección «Notificaciones» de Mi cuenta: push en este dispositivo y preferencia de email. */
export function Notificaciones() {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const { data: estado, isLoading } = useEstadoPush()
  const [ocupado, setOcupado] = useState(false)
  const [email, setEmail] = useState(perfil?.avisos_email ?? true)
  const [resumen, setResumen] = useState(perfil?.resumen_mensual ?? true)
  const { data: estadoMail } = useEstadoEmail()
  const hayEmail = estadoMail?.email

  const { data: dispositivos = [] } = useQuery({
    queryKey: ['mis_dispositivos', estado],
    queryFn: async () => {
      const { data } = await supabase.from('suscripciones_push').select('id, dispositivo, creada').order('creada')
      return data ?? []
    },
  })

  const error = (e: unknown) =>
    notifications.show({ color: 'red', title: 'No se ha podido completar', message: e instanceof Error ? e.message : String(e) })

  async function cambiar(activar: boolean) {
    if (!perfil) return
    setOcupado(true)
    try {
      if (activar) await activarPush(perfil.id)
      else await desactivarPush()
      notifications.show({ color: 'green', message: activar ? 'Notificaciones activadas en este dispositivo' : 'Notificaciones desactivadas en este dispositivo' })
    } catch (e) {
      error(e)
    } finally {
      setOcupado(false)
      qc.invalidateQueries({ queryKey: ['estado_push'] })
    }
  }

  async function prueba() {
    setOcupado(true)
    try {
      const r = await enviarPrueba()
      notifications.show({
        color: r.enviadas ? 'green' : 'orange',
        message: r.enviadas
          ? `Notificación de prueba enviada a ${r.enviadas === 1 ? '1 dispositivo' : `${r.enviadas} dispositivos`}`
          : 'No se ha podido entregar a ningún dispositivo',
      })
    } catch (e) {
      error(e)
    } finally {
      setOcupado(false)
    }
  }

  async function pruebaEmail() {
    setOcupado(true)
    try {
      await enviarEmailPrueba()
      notifications.show({ color: 'green', message: `Email de prueba enviado a ${perfil?.email}` })
    } catch (e) {
      error(e)
    } finally {
      setOcupado(false)
    }
  }

  async function cambiarResumen(v: boolean) {
    setResumen(v)
    const { error: e } = await supabase.rpc('mi_resumen_mensual', { p_activo: v })
    if (e) error(e)
  }

  async function miResumen() {
    setOcupado(true)
    try {
      const r = await enviarMiResumen()
      notifications.show(
        r.enviado
          ? { color: 'green', message: `Resumen enviado a ${r.email} (${r.acciones === 1 ? '1 acción abierta' : `${r.acciones} acciones abiertas`})` }
          : { color: 'blue', message: 'No tienes acciones abiertas: no hay resumen que enviar' },
      )
    } catch (e) {
      error(e)
    } finally {
      setOcupado(false)
    }
  }

  async function cambiarEmail(v: boolean) {
    setEmail(v)
    const { error: e } = await supabase.rpc('mis_preferencias_avisos', { p_push: true, p_email: v })
    if (e) error(e)
  }

  return (
    <Paper withBorder p="md">
      <Stack>
        <div>
          <Title order={4}>Notificaciones</Title>
          <Text size="sm" c="dimmed">
            Avisos de las acciones de tus planes: cuando llega la fecha de inicio, cuando se acerca la fecha de fin y
            cuando vence el plazo sin completarse.
          </Text>
        </div>

        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text fw={500}>Notificaciones en este dispositivo</Text>
              <Text size="xs" c="dimmed">Push en el móvil u ordenador, aunque la aplicación esté cerrada</Text>
            </div>
            <Switch
              size="md"
              aria-label="Notificaciones en este dispositivo"
              checked={estado === 'activo'}
              disabled={isLoading || ocupado || !(estado === 'activo' || estado === 'inactivo')}
              onChange={(e) => cambiar(e.currentTarget.checked)}
              onLabel={<IconBell size={14} />}
              offLabel={<IconBellOff size={14} />}
            />
          </Group>
          {estado && EXPLICACION[estado] && <Alert color="yellow" variant="light">{EXPLICACION[estado]}</Alert>}
          {dispositivos.length > 0 && (
            <Group gap={6}>
              <Text size="xs" c="dimmed">Dispositivos con notificaciones:</Text>
              {dispositivos.map((d) => (
                <Badge key={d.id} size="sm" variant="light">{d.dispositivo ?? 'Dispositivo'}</Badge>
              ))}
            </Group>
          )}
          {dispositivos.length > 0 && (
            <Button size="xs" variant="default" leftSection={<IconSend size={14} />} onClick={prueba} loading={ocupado} w="fit-content">
              Enviar notificación de prueba
            </Button>
          )}
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text fw={500}>Avisos por email</Text>
              <Text size="xs" c="dimmed">
                {estadoMail === undefined
                  ? perfil?.email
                  : estadoMail.error
                    ? `${perfil?.email} · no se ha podido comprobar el envío por email (${estadoMail.error})`
                    : !hayEmail
                      ? `${perfil?.email} · el envío por email todavía no está configurado${estadoMail.faltan?.length ? ` (falta ${estadoMail.faltan.join(', ')})` : ''}`
                      : `Se envían a ${perfil?.email}`}
              </Text>
            </div>
            <Switch size="md" aria-label="Avisos por email" checked={email} onChange={(e) => cambiarEmail(e.currentTarget.checked)} />
          </Group>
          {hayEmail && email && (
            <Button size="xs" variant="default" leftSection={<IconMail size={14} />} onClick={pruebaEmail} loading={ocupado} w="fit-content">
              Enviar email de prueba
            </Button>
          )}
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text fw={500}>Resumen mensual por email</Text>
              <Text size="xs" c="dimmed">
                A mitad de mes, un correo con tus acciones abiertas por prioridad: vencidas, las que vencen en los
                próximos 60 días, en curso y las que empiezan más adelante
              </Text>
            </div>
            <Switch size="md" aria-label="Resumen mensual por email" checked={resumen} onChange={(e) => cambiarResumen(e.currentTarget.checked)} />
          </Group>
          {hayEmail && (
            <Button size="xs" variant="default" leftSection={<IconCalendarStats size={14} />} onClick={miResumen} loading={ocupado} w="fit-content">
              Enviarme ahora mi resumen
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  )
}
