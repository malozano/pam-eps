import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

export function Login() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
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
            <Button type="submit" loading={enviando}>
              {t('login.entrar')}
            </Button>
            <Text size="xs" c="dimmed">
              {t('login.ayuda')}
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
