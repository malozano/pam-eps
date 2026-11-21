import { Alert, Button, Code, Group, NumberInput, Paper, Skeleton, Stack, Switch, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconPlayerPlay } from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useEstadoEmail } from '../../components/Notificaciones'
import { estadoEmail } from '../../lib/push'
import { direccionesAvisos } from '../../lib/avisos'
import { supabase } from '../../lib/supabase'

interface Ajustes {
  activo: boolean
  dias_antes_inicio: number
  dias_antes_fin: number
  dias_despues_fin: number
  url_app: string | null
  url_funciones: string | null
  ultima_ejecucion: string | null
  ultimo_resultado: { generados: number; procesados: number; notificaciones: number; emails?: number } | null
}

/** Ajustes de los avisos de plazos (administración). */
export function Avisos() {
  const qc = useQueryClient()
  const [guardando, setGuardando] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const { data: estadoMail } = useEstadoEmail()
  const hayEmail = estadoMail?.email
  const [verificando, setVerificando] = useState(false)
  const [conexion, setConexion] = useState<string | null>(null)
  async function comprobarSmtp() {
    setVerificando(true)
    setConexion(null)
    const r = await estadoEmail(true)
    setVerificando(false)
    setConexion(r.error ?? r.conexion ?? (r.email ? 'sin respuesta' : 'El envío por email no está configurado'))
  }
  const { data: ajustes, isLoading } = useQuery({
    queryKey: ['ajustes_avisos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ajustes_avisos').select('*').single()
      if (error) throw error
      return data as Ajustes
    },
  })
  const form = useForm({
    initialValues: { activo: true, dias_antes_inicio: 0, dias_antes_fin: 30, dias_despues_fin: 1 },
  })
  useEffect(() => {
    if (!ajustes) return
    const v = {
      activo: ajustes.activo,
      dias_antes_inicio: ajustes.dias_antes_inicio,
      dias_antes_fin: ajustes.dias_antes_fin,
      dias_despues_fin: ajustes.dias_despues_fin,
    }
    form.setValues(v)
    form.resetDirty(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajustes])

  async function guardar(v: typeof form.values) {
    setGuardando(true)
    const { error } = await supabase.from('ajustes_avisos').update({ ...v, ...direccionesAvisos() }).eq('id', true)
    setGuardando(false)
    if (error) return notifications.show({ color: 'red', title: 'No se ha guardado', message: error.message })
    notifications.show({ color: 'green', message: 'Ajustes de avisos guardados' })
    qc.invalidateQueries({ queryKey: ['ajustes_avisos'] })
  }

  async function ejecutar() {
    setEjecutando(true)
    const { data, error } = await supabase.functions.invoke('enviar-avisos', { body: { modo: 'ejecutar' } })
    setEjecutando(false)
    if (error) return notifications.show({ color: 'red', title: 'No se ha podido ejecutar', message: error.message })
    const r = data as Ajustes['ultimo_resultado']
    notifications.show({
      color: 'green',
      title: 'Avisos procesados',
      message: `${r?.generados} avisos nuevos · ${r?.notificaciones} notificaciones push · ${r?.emails ?? 0} emails`,
    })
    qc.invalidateQueries({ queryKey: ['ajustes_avisos'] })
  }

  if (isLoading || !ajustes) return <Skeleton h={300} />
  const r = ajustes.ultimo_resultado

  return (
    <Stack maw={720}>
      <div>
        <Title order={2}>Avisos de plazos</Title>
        <Text size="sm" c="dimmed">
          Cada mañana se avisa a la coordinación de cada plan (y a la administración, del plan del centro) de las
          acciones que empiezan, de las que se acercan a su fecha de fin y de las que han vencido sin completarse. Cada
          aviso se envía una sola vez por acción (si se reprograma una fecha, se avisa de nuevo para la nueva fecha).
        </Text>
      </div>
      <Paper withBorder p="md">
        <form onSubmit={form.onSubmit(guardar)}>
          <Stack>
            <Switch label="Avisos activados" {...form.getInputProps('activo', { type: 'checkbox' })} />
            <NumberInput
              label="Aviso de inicio: días antes de la fecha de inicio"
              description="0 = el mismo día de inicio (solo acciones pendientes)"
              min={0}
              max={60}
              w={360}
              {...form.getInputProps('dias_antes_inicio')}
            />
            <NumberInput
              label="Aviso de fin próximo: días antes de la fecha de fin"
              description="Por defecto, 30 (un mes antes)"
              min={1}
              max={120}
              w={360}
              {...form.getInputProps('dias_antes_fin')}
            />
            <NumberInput
              label="Aviso de plazo vencido: días después de la fecha de fin"
              description="1 = al día siguiente de la fecha de fin, si no se ha completado ni cancelado"
              min={0}
              max={60}
              w={360}
              {...form.getInputProps('dias_despues_fin')}
            />
            <Group>
              <Button type="submit" loading={guardando}>Guardar</Button>
            </Group>
          </Stack>
        </form>
      </Paper>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Title order={5}>Envío</Title>
          <Text size="sm">
            Se ejecuta automáticamente cada día hacia las 7-8 h. Última ejecución:{' '}
            <b>
              {ajustes.ultima_ejecucion
                ? new Date(ajustes.ultima_ejecucion).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
                : 'todavía no se ha ejecutado'}
            </b>
            {r && ` · ${r.generados} avisos nuevos, ${r.notificaciones} notificaciones push y ${r.emails ?? 0} emails enviados`}
          </Text>
          {!ajustes.url_funciones && (
            <Alert color="yellow" variant="light">
              Pulsa «Guardar» una vez para que la tarea programada conozca la dirección del servidor.
            </Alert>
          )}
          <Text size="sm">
            Envío por email:{' '}
            {hayEmail === undefined ? '…' : hayEmail ? <b>configurado</b> : <b>no configurado</b>}. Cada persona puede
            desactivar los avisos por email o las notificaciones push en «Mi cuenta → Notificaciones».
          </Text>
          {estadoMail?.error && (
            <Alert color="red" variant="light" title="No se ha podido comprobar el envío por email">
              {estadoMail.error}
            </Alert>
          )}
          {hayEmail && (
            <Text size="xs" c="dimmed">
              Servidor <Code>{estadoMail?.host}</Code>, puerto <Code>{estadoMail?.puerto}</Code>, remitente{' '}
              <Code>{estadoMail?.remitente}</Code>
            </Text>
          )}
          {hayEmail && (
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={comprobarSmtp} loading={verificando}>
                Comprobar conexión SMTP
              </Button>
              {conexion && (
                <Text size="sm" c={conexion === 'ok' ? 'green' : 'red'}>
                  {conexion === 'ok' ? 'Conexión y autenticación correctas' : `Error: ${conexion}`}
                </Text>
              )}
            </Group>
          )}
          {hayEmail === false && !estadoMail?.error && (
            <Alert color="yellow" variant="light" title="Configurar el envío por email">
              {!!estadoMail?.faltan?.length && (
                <Text size="sm" fw={500} mb={4}>
                  La función no encuentra: {estadoMail.faltan.join(', ')}.
                </Text>
              )}
              <Text size="sm">
                En Supabase → Edge Functions → Secrets, añade: <Code>SMTP_HOST</Code> (p. ej. smtp.gmail.com),{' '}
                <Code>SMTP_PORT</Code> = 465, <Code>SMTP_USER</Code> (la cuenta de correo), <Code>SMTP_PASS</Code> (la
                contraseña de aplicación) y <Code>SMTP_FROM</Code> (p. ej. «Planes de mejora EPS &lt;cuenta@gmail.com&gt;»).
              </Text>
              <Text size="xs" mt={4}>
                Deben estar en «Edge Functions → Secrets» (no en «Vault» ni en otras secciones) y con estos nombres
                exactos, en mayúsculas. Los cambios se aplican en unos segundos; vuelve a abrir esta página para comprobarlo.
              </Text>
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            Destino de la tarea: <Code>{ajustes.url_funciones ?? '—'}</Code>
          </Text>
          <Button variant="light" leftSection={<IconPlayerPlay size={16} />} onClick={ejecutar} loading={ejecutando} w="fit-content">
            Ejecutar ahora
          </Button>
        </Stack>
      </Paper>
    </Stack>
  )
}
