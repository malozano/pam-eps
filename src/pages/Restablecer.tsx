import { Alert, Anchor, Button, Center, Loader, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Destino del enlace de acceso o de recuperación: valida el enlace (inicia sesión) y pide la
 * contraseña nueva.
 */
export function Restablecer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [estado, setEstado] = useState<'validando' | 'listo' | 'invalido'>('validando')
  const [error, setError] = useState<string | null>(null)
  const validado = useRef(false)
  const form = useForm({
    initialValues: { password: '', repetir: '' },
    validate: {
      password: (v) => (v.length >= 10 ? null : 'Mínimo 10 caracteres'),
      repetir: (v, vals) => (v === vals.password ? null : 'Las contraseñas no coinciden'),
    },
  })

  useEffect(() => {
    // el enlace solo sirve una vez: se valida una sola vez aunque el efecto se repita
    if (validado.current) return
    validado.current = true
    const token_hash = params.get('token_hash')
    if (!token_hash) {
      setEstado('invalido')
      return
    }
    supabase.auth.verifyOtp({ token_hash, type: 'recovery' }).then(({ error: e }) => {
      setEstado(e ? 'invalido' : 'listo')
      // se quita el código de la dirección
      window.history.replaceState(null, '', window.location.pathname)
    })
  }, [params])

  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-gray-0)">
      <Paper withBorder shadow="sm" p="xl" radius="md" w="100%" maw={420}>
        <Stack>
          <div>
            <Text size="sm" c="dimmed">{t('app.centro')}</Text>
            <Title order={2}>{t('app.titulo')}</Title>
          </div>
          <Title order={4} fw={500}>Elegir contraseña</Title>
          {estado === 'validando' && <Center><Loader /></Center>}
          {estado === 'invalido' && (
            <>
              <Alert color="red">
                El enlace no es válido o ha caducado (solo sirve una vez y durante una hora). Pide uno nuevo con
                «¿Has olvidado tu contraseña?».
              </Alert>
              <Anchor component={Link} to="/login" size="sm">Ir a la pantalla de acceso</Anchor>
            </>
          )}
          {estado === 'listo' && (
            <form
              onSubmit={form.onSubmit(async (v) => {
                setError(null)
                const { error: e } = await supabase.auth.updateUser({ password: v.password })
                if (e) setError(e.message)
                else navigate('/', { replace: true })
              })}
            >
              <Stack>
                {error && <Alert color="red">{error}</Alert>}
                <PasswordInput label="Contraseña nueva" autoComplete="new-password" {...form.getInputProps('password')} />
                <PasswordInput label="Repetir contraseña" autoComplete="new-password" {...form.getInputProps('repetir')} />
                <Button type="submit" loading={form.submitting}>Guardar y entrar</Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>
    </Center>
  )
}
