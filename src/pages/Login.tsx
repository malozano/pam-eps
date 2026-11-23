import { Alert, Anchor, Button, Center, Group, Modal, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { estaInstalada, InstalarApp } from '../components/Pwa'
import { supabase } from '../lib/supabase'

export function Login() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [instalar, setInstalar] = useState(false)
  const [recuperar, setRecuperar] = useState(false)
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : t('login.email')),
      password: (v) => (v.length > 0 ? null : t('login.password')),
    },
  })
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/'
  if (session) return <Navigate to={destino} replace />

  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-gray-0)">
      <Paper withBorder shadow="sm" p="xl" radius="md" w="100%" maw={400}>
        <form
          onSubmit={form.onSubmit(async (v) => {
            setEnviando(true)
            setError(null)
            const { error } = await supabase.auth.signInWithPassword({ email: v.email.trim(), password: v.password })
            setEnviando(false)
            if (error) setError(t('login.error'))
            else navigate(destino, { replace: true })
          })}
        >
          <Stack>
            <div>
              <Text size="sm" c="dimmed">
                {t('app.centro')}
              </Text>
              <Title order={2}>{t('app.titulo')}</Title>
            </div>
            <Title order={4} fw={500}>
              {t('login.titulo')}
            </Title>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput label={t('login.email')} type="email" autoComplete="username" {...form.getInputProps('email')} />
            <PasswordInput label={t('login.password')} autoComplete="current-password" {...form.getInputProps('password')} />
            <Anchor component="button" type="button" size="sm" ta="right" mt={-8} onClick={() => setRecuperar(true)}>
              ¿Has olvidado tu contraseña?
            </Anchor>
            <Button type="submit" loading={enviando}>
              {t('login.entrar')}
            </Button>
            <Text size="xs" c="dimmed">
              {t('login.ayuda')}
            </Text>
            <Group justify="space-between">
              <Anchor component={Link} to="/plan" size="sm">
                {t('publico.planes')} →
              </Anchor>
              {!estaInstalada() && (
                <Anchor component="button" type="button" size="sm" onClick={() => setInstalar(true)}>
                  {t('nav.instalar')}
                </Anchor>
              )}
            </Group>
          </Stack>
        </form>
      </Paper>
      <InstalarApp opened={instalar} onClose={() => setInstalar(false)} />
      <Modal opened={recuperar} onClose={() => setRecuperar(false)} title="Restablecer la contraseña">
        {recuperar && <Recuperar emailInicial={form.values.email} />}
      </Modal>
    </Center>
  )
}

/** Pide un enlace para establecer una contraseña nueva (lo envía la función de avisos por correo). */
function Recuperar({ emailInicial }: { emailInicial: string }) {
  const [email, setEmail] = useState(emailInicial)
  const [estado, setEstado] = useState<'inicio' | 'enviando' | 'enviado' | 'error'>('inicio')
  if (estado === 'enviado')
    return (
      <Alert color="green">
        Si <b>{email.trim()}</b> corresponde a una cuenta activa, recibirás en unos minutos un correo con un enlace para
        elegir una contraseña nueva. Revisa también la carpeta de correo no deseado.
      </Alert>
    )
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setEstado('enviando')
        const { error } = await supabase.functions.invoke('enviar-avisos', { body: { modo: 'recuperar', email: email.trim() } })
        setEstado(error ? 'error' : 'enviado')
      }}
    >
      <Stack>
        <Text size="sm">Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</Text>
        {estado === 'error' && <Alert color="red">No se ha podido enviar la solicitud. Inténtalo más tarde.</Alert>}
        <TextInput label="Correo electrónico" type="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} data-autofocus />
        <Button type="submit" loading={estado === 'enviando'} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>
          Enviar enlace
        </Button>
      </Stack>
    </form>
  )
}
