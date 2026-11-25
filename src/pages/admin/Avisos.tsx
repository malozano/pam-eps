import { Alert, Button, Code, Group, NumberInput, Paper, Skeleton, Stack, Switch, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconCalendarStats, IconPlayerPlay } from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useEstadoEmail } from '../../components/Notificaciones'
import { enviarMiResumen, estadoEmail } from '../../lib/push'
import { direccionesAvisos } from '../../lib/avisos'
import { usePublicacion } from '../../lib/publicacion'
import { supabase } from '../../lib/supabase'

interface Ajustes {
  activo: boolean
  dias_antes_inicio: number
  dias_antes_fin: number
  dias_despues_fin: number
  resumen_activo: boolean
  resumen_dia: number
  avisos_plazo_transversal: boolean
  url_app: string | null
  url_funciones: string | null
  ultima_ejecucion: string | null
  ultimo_resultado: { generados: number; procesados: number; notificaciones: number; emails?: number; resumenes?: number } | null
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
    initialValues: {
      activo: true, dias_antes_inicio: 0, dias_antes_fin: 30, dias_despues_fin: 1,
      avisos_plazo_transversal: true, resumen_activo: true, resumen_dia: 15,
    },
  })
  useEffect(() => {
    if (!ajustes) return
    const v = {
      activo: ajustes.activo,
      dias_antes_inicio: ajustes.dias_antes_inicio,
      dias_antes_fin: ajustes.dias_antes_fin,
      dias_despues_fin: ajustes.dias_despues_fin,
      avisos_plazo_transversal: ajustes.avisos_plazo_transversal,
      resumen_activo: ajustes.resumen_activo,
      resumen_dia: ajustes.resumen_dia,
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
      message: `${r?.generados} avisos nuevos · ${r?.notificaciones} notificaciones push · ${r?.emails ?? 0} emails${r?.resumenes ? ` · ${r.resumenes} resúmenes mensuales` : ''}`,
    })
    qc.invalidateQueries({ queryKey: ['ajustes_avisos'] })
    qc.invalidateQueries({ queryKey: ['resumenes'] })
  }

  if (isLoading || !ajustes) return <Skeleton h={300} />
  const r = ajustes.ultimo_resultado

  return (
    <Stack maw={720}>
      <Title order={2}>Ajustes</Title>
      <Publicacion />
      <div>
        <Title order={3} mt="sm">Avisos de plazos</Title>
        <Text size="sm" c="dimmed">
          Cada mañana se avisa a la coordinación de cada plan (y a la administración, del plan del centro) de las
          acciones que empiezan, de las que se acercan a su fecha de fin y de las que han vencido sin completarse. Cada
          aviso se envía una sola vez por acción (si se reprograma una fecha, se avisa de nuevo para la nueva fecha).
          Además, una vez al mes se envía por correo un resumen de las acciones abiertas.
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
            <Switch
              label="Avisar también a las cuentas de coordinación transversal de sus acciones del plan del centro"
              description="La administración recibe siempre los avisos de todo el plan del centro"
              {...form.getInputProps('avisos_plazo_transversal', { type: 'checkbox' })}
            />
            <Title order={5} mt="sm">Resumen mensual por correo</Title>
            <Text size="sm" c="dimmed">
              Un correo con las acciones abiertas agrupadas por situación (vencidas, vencen pronto, deberían haber
              empezado, empiezan pronto, en plazo y empiezan más adelante). Lo reciben las cuentas transversales (sus acciones), la coordinación de cada
              titulación (su plan) y la administración (todo el plan del centro, separando las acciones sin cuenta
              responsable). Cada persona puede desactivarlo en «Mi cuenta → Notificaciones».
            </Text>
            <Switch label="Resumen mensual activado" {...form.getInputProps('resumen_activo', { type: 'checkbox' })} />
            <NumberInput
              label="Día del mes en que se envía"
              description="Por defecto el 15, para no coincidir con los plazos de principio y fin de mes. Si ese día falla el envío, se reintenta los dos días siguientes."
              min={1}
              max={28}
              w={360}
              disabled={!form.values.resumen_activo}
              {...form.getInputProps('resumen_dia')}
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
            {r?.resumenes ? `, y ${r.resumenes} resúmenes mensuales` : ''}
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
                contraseña de aplicación) y <Code>SMTP_FROM</Code> (p. ej. «Seguimiento Calidad EPS &lt;cuenta@gmail.com&gt;»).
              </Text>
              <Text size="xs" mt={4}>
                Deben estar en «Edge Functions → Secrets» (no en «Vault» ni en otras secciones) y con estos nombres
                exactos, en mayúsculas. Los cambios se aplican en unos segundos; vuelve a abrir esta página para comprobarlo.
              </Text>
            </Alert>
          )}
          <EstadoResumen activo={ajustes.resumen_activo} dia={ajustes.resumen_dia} />
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

/** Cuántas personas han recibido ya el resumen de este mes, y envío del propio para verlo. */
function EstadoResumen({ activo, dia }: { activo: boolean; dia: number }) {
  const [enviando, setEnviando] = useState(false)
  const hoy = new Date()
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  const { data } = useQuery({
    queryKey: ['resumenes', mes],
    queryFn: async () => {
      const { data: filas, error } = await supabase.from('resumenes').select('acciones').eq('mes', mes)
      if (error) throw error
      return filas.filter((f) => f.acciones > 0).length
    },
  })
  async function enviar() {
    setEnviando(true)
    try {
      const r = await enviarMiResumen()
      notifications.show(
        r.enviado
          ? { color: 'green', message: `Resumen enviado a ${r.email} (${r.acciones} acciones abiertas)` }
          : { color: 'blue', message: 'No tienes acciones abiertas: no hay resumen que enviar' },
      )
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se ha podido enviar', message: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }
  const nombreMes = hoy.toLocaleDateString('es-ES', { month: 'long' })
  return (
    <Group gap="xs">
      <Text size="sm">
        Resumen mensual:{' '}
        {!activo
          ? <b>desactivado</b>
          : data
            ? <>enviado en {nombreMes} a <b>{data === 1 ? '1 persona' : `${data} personas`}</b></>
            : <>se enviará el día <b>{dia}</b></>}
        .
      </Text>
      <Button size="xs" variant="default" leftSection={<IconCalendarStats size={14} />} onClick={enviar} loading={enviando}>
        Enviarme ahora mi resumen
      </Button>
    </Group>
  )
}

/** Qué planes se muestran en la web pública («Planes publicados»). */
function Publicacion() {
  const qc = useQueryClient()
  const { data } = usePublicacion()
  async function cambiar(campo: 'centro' | 'titulaciones', valor: boolean) {
    const { error } = await supabase.from('ajustes_publicacion').update({ [campo]: valor }).eq('id', true)
    if (error) return notifications.show({ color: 'red', title: 'No se ha guardado', message: error.message })
    await qc.invalidateQueries({ queryKey: ['ajustes_publicacion'] })
    notifications.show({
      color: 'green',
      message: `${campo === 'centro' ? 'Plan del centro' : 'Planes de titulación'}: ${valor ? 'publicados' : 'no publicados'}`,
    })
  }
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <div>
          <Title order={4}>Publicación de los planes</Title>
          <Text size="sm" c="dimmed">
            Qué planes se pueden consultar sin iniciar sesión en «Planes publicados» (solo las acciones de mejora). Un plan
            no publicado tampoco se puede ver con su enlace directo. No afecta a la gestión ni a las exportaciones.
          </Text>
        </div>
        {data ? (
          <>
            <Switch label="Publicar el plan del centro" checked={data.centro} onChange={(e) => cambiar('centro', e.currentTarget.checked)} />
            <Switch label="Publicar los planes de titulación" checked={data.titulaciones} onChange={(e) => cambiar('titulaciones', e.currentTarget.checked)} />
            {!data.centro && !data.titulaciones && (
              <Text size="sm" c="orange.8">La página «Planes publicados» indicará que no hay planes publicados.</Text>
            )}
          </>
        ) : (
          <Skeleton h={60} />
        )}
      </Stack>
    </Paper>
  )
}
